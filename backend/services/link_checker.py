import asyncio
import ipaddress
import socket
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal
from html.parser import HTMLParser

import httpx

from config import settings


class UnsafeDestination(ValueError):
    pass


def require_public_ip(address: str) -> None:
    ip = ipaddress.ip_address(address)
    if not ip.is_global or ip.is_multicast or "%" in address:
        raise UnsafeDestination("Only public addresses are allowed")
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None:
            require_public_ip(str(ip.ipv4_mapped))
        if ip.sixtofour is not None or ip.teredo is not None:
            raise UnsafeDestination("Transition addresses are not supported")


async def public_address(url: httpx.URL) -> str:
    if url.scheme not in {"http", "https"} or not url.host or url.userinfo:
        raise UnsafeDestination("Only public HTTP or HTTPS URLs without credentials are allowed")
    port = url.port or (443 if url.scheme == "https" else 80)
    if port not in {80, 443}:
        raise UnsafeDestination("Only standard web ports are supported")
    try:
        ipaddress.ip_address(url.host)
    except ValueError:
        answers = await asyncio.get_running_loop().getaddrinfo(
            url.host, port, type=socket.SOCK_STREAM,
        )
        addresses = list(dict.fromkeys(answer[4][0] for answer in answers))
        if not addresses:
            raise OSError("No DNS result")
        for address in addresses:
            require_public_ip(address)
        # Prefer IPv4 where available. The actual request uses this verified IP,
        # so a second DNS lookup cannot redirect the connection to a private host.
        return next((address for address in addresses if ":" not in address), addresses[0])
    require_public_ip(url.host)
    return url.host


@dataclass(frozen=True)
class LinkCheck:
    state: Literal["working", "redirected", "broken", "unknown"]
    reason: str
    checked_at: datetime | None = None
    final_url: str | None = None
    text: str = ""
    title: str = ""


class PageText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.title_parts = []
        self.hidden = 0
        self.in_title = False

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "noscript", "svg", "template"}:
            self.hidden += 1
        if tag == "title":
            self.in_title = True

    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript", "svg", "template"}:
            self.hidden = max(0, self.hidden - 1)
        if tag == "title":
            self.in_title = False

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)
            if self.in_title:
                self.title_parts.append(data)


async def read_page(response: httpx.Response) -> tuple[str, str]:
    media_type = response.headers.get("content-type", "").split(";", 1)[0].lower()
    if media_type not in {"text/html", "application/xhtml+xml", "text/plain"}:
        return "", ""
    # Reject compressed bodies rather than risk unbounded decompression.
    if response.headers.get("content-encoding", "identity").lower() != "identity":
        return "", ""
    body = bytearray()
    async for chunk in response.aiter_raw():
        remaining = settings.evidence_max_bytes - len(body)
        body.extend(chunk[:remaining])
        if len(body) >= settings.evidence_max_bytes:
            break
    encoding = response.encoding or "utf-8"
    try:
        content = body.decode(encoding, errors="replace")
    except LookupError:
        content = body.decode("utf-8", errors="replace")
    if media_type == "text/plain":
        return " ".join(content.split())[:settings.evidence_max_chars], ""
    parser = PageText()
    parser.feed(content)
    return (
        " ".join(" ".join(parser.parts).split())[:settings.evidence_max_chars],
        " ".join(" ".join(parser.title_parts).split())[:300],
    )


def observed(state, reason):
    return LinkCheck(state, reason, datetime.now(timezone.utc))


async def _fetch(url: str, transport=None, include_content=False) -> LinkCheck:
    current = httpx.URL(url).copy_with(fragment=None)
    visited: set[str] = set()
    async with httpx.AsyncClient(
        transport=transport,
        trust_env=False,
        follow_redirects=False,
        timeout=httpx.Timeout(settings.link_timeout_seconds),
        limits=httpx.Limits(max_keepalive_connections=0),
        headers={"User-Agent": "Genie-Link-Check/0.1", "Accept-Encoding": "identity"},
    ) as client:
        for hop in range(settings.max_redirects + 1):
            if str(current) in visited:
                return LinkCheck("unknown", "The website entered a redirect loop.")
            visited.add(str(current))
            address = await public_address(current)
            target = current.copy_with(host=address)
            # Preserve virtual hosting and TLS certificate verification while
            # connecting directly to the IP we checked above.
            client.cookies.clear()
            async with client.stream(
                "GET", target,
                headers={"Host": current.netloc.decode("ascii")},
                extensions={"sni_hostname": current.host},
            ) as response:
                code = response.status_code
                if code in {301, 302, 303, 307, 308}:
                    location = response.headers.get("location")
                    if not location or hop == settings.max_redirects:
                        return LinkCheck("unknown", "The website redirect could not be completed.")
                    current = current.join(location).copy_with(fragment=None)
                    continue
                if code in {404, 410}:
                    return observed("broken", f"The website returned HTTP {code}. This does not establish that the service has closed.")
                if 200 <= code < 300:
                    text, title = await read_page(response) if include_content else ("", "")
                    return LinkCheck(
                        "redirected" if hop else "working",
                        "The website responded after a redirect. Service activity is unverified." if hop else "The website responded successfully. Service activity is unverified.",
                        datetime.now(timezone.utc), str(current), text, title,
                    )
                return observed("unknown", f"The website returned HTTP {code}. Service activity could not be determined.")
            # Bodies are only read when requested, with strict size bounds.
    return LinkCheck("unknown", "The website check could not be completed.")


async def check_link(url: str | None, *, transport=None, include_content=False) -> LinkCheck:
    if url is None:
        return LinkCheck("unknown", "This listing has no website to check.")
    try:
        return await asyncio.wait_for(
            _fetch(url, transport, include_content), timeout=settings.link_timeout_seconds,
        )
    except UnsafeDestination:
        return LinkCheck("unknown", "The URL or redirect is not a supported public website destination.")
    except (TimeoutError, httpx.TimeoutException):
        return LinkCheck("unknown", "The website check timed out. A timeout does not establish that a service has closed.")
    except (httpx.HTTPError, httpx.InvalidURL, OSError, ValueError):
        return LinkCheck("unknown", "The website could not be reached or checked. Service activity is unverified.")
