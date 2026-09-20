import asyncio
import time
from collections import OrderedDict

from config import settings
from schemas.listing import ListingRequest
from schemas.result import CheckResult
from services.gemini import Verification, fallback, verify_listing
from services.link_checker import LinkCheck, check_link

# Process local and bounded. Restarting the server clears cached assessments.
_cache: OrderedDict[str, tuple[float, CheckResult]] = OrderedDict()


async def check_listing(listing: ListingRequest) -> CheckResult:
    key = listing.model_dump_json(exclude={"listingId"})
    now = time.monotonic()
    cached = _cache.get(key)
    if cached is not None:
        expires, result = cached
        if expires > now:
            _cache.move_to_end(key)
            return result.model_copy(update={"listingId": listing.listingId, "cached": True}, deep=True)
        del _cache[key]

    link = LinkCheck("unknown", "The website check did not complete.")

    async def pipeline() -> Verification:
        nonlocal link
        link = await check_link(
            str(listing.website) if listing.website is not None else None,
            include_content=True,
        )
        return await verify_listing(listing, link)

    try:
        verification = await asyncio.wait_for(pipeline(), timeout=settings.check_timeout_seconds)
    except TimeoutError:
        return fallback(listing, link, "Verification reached its time limit. Service activity remains uncertain.")
    result = verification.result
    # Provider failures, inaccessible evidence and incomplete requests are not cached.
    if verification.cacheable:
        _cache[key] = (time.monotonic() + settings.cache_ttl_seconds, result)
        _cache.move_to_end(key)
        while len(_cache) > settings.cache_max_entries:
            _cache.popitem(last=False)
    return result
