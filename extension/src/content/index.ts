import { extractDetail, type Listing } from "./extract";

const hostId = "genie-listing-status";

interface Source {
  title: string;
  url: string;
  excerpt: string;
  retrievedAt: string;
}

interface CheckResult {
  listingId: string;
  mode: "live" | "mock";
  status: "active" | "closed" | "uncertain";
  reason: string;
  checkedAt: string | null;
  linkState: "working" | "redirected" | "broken" | "stale" | "unknown";
  replacementUrl: string | null;
  sources: Source[];
  cached: boolean;
  searchAttribution?: { renderedContent: string; queries: string[] } | null;
}

type CheckReply = { ok: true; result: CheckResult } | { ok: false; message: string };

let fingerprint = "";
let host: HTMLElement | null = null;
let websiteLink: HTMLAnchorElement | null = null;
let requestVersion = 0;
const completed = new Map<string, CheckResult>();
const restored = new Set<string>();

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function linkFor(right: Element): HTMLAnchorElement | null {
  const label = Array.from(right.querySelectorAll("p"))
    .find(node => node.textContent?.trim() === "Website");
  const candidate = label?.parentElement?.nextElementSibling;
  return candidate instanceof HTMLAnchorElement ? candidate : null;
}

function originalListing(listing: Listing, link: HTMLAnchorElement | null): Listing {
  const original = link?.dataset.genieOriginalHref;
  return isHttpUrl(original) ? { ...listing, website: original } : listing;
}

function keyFor(listing: Listing): string {
  return JSON.stringify(listing);
}

function clearView() {
  host?.remove();
  host = null;
  websiteLink?.classList.remove("genie-updated-link");
  websiteLink = null;
}

function formatTime(value: string | null): string {
  if (!value) return "Not checked";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Not checked" : date.toLocaleString();
}

function statusText(result: CheckResult): string {
  if (result.status === "active") return "Active";
  if (result.status === "closed") return "Confirmed closed";
  return "Uncertain";
}

function statusClass(result: CheckResult): string {
  if (result.status === "closed") return "closed";
  if (result.status === "active" && result.replacementUrl) return "repair";
  if (result.status === "active" && ["working", "redirected"].includes(result.linkState)) return "active";
  return "uncertain";
}

function hasVerifiedRepair(result: CheckResult): result is CheckResult & { replacementUrl: string } {
  return result.mode === "live"
    && result.status === "active"
    && ["broken", "stale"].includes(result.linkState)
    && isHttpUrl(result.replacementUrl)
    && result.checkedAt !== null
    && result.sources.length > 0;
}

function applyRepair(link: HTMLAnchorElement | null, result: CheckResult, key: string) {
  if (!link || !hasVerifiedRepair(result) || restored.has(key)) return false;
  const original = link.dataset.genieOriginalHref ?? link.href;
  if (!isHttpUrl(original)) return false;
  link.dataset.genieOriginalHref = original;
  link.href = result.replacementUrl;
  link.classList.add("genie-updated-link");
  return true;
}

function restoreOriginal(link: HTMLAnchorElement | null, key: string) {
  const original = link?.dataset.genieOriginalHref;
  if (!link || !isHttpUrl(original)) return;
  link.href = original;
  link.classList.remove("genie-updated-link");
  restored.add(key);
}

function render(listing: Listing, state: "checking" | CheckReply, key: string, link: HTMLAnchorElement | null): HTMLElement {
  const mount = document.createElement("section");
  mount.id = hostId;
  mount.setAttribute("aria-label", "Genie listing check");
  const root = mount.attachShadow({ mode: "open" });
  const style = element("style", `
    :host { display:block; margin:10px 0 0; color:#172033; font:13px/1.5 system-ui,sans-serif; }
    article { border-left:3px solid #94a3b8; padding:8px 10px; background:#f8fafc; overflow-wrap:anywhere; }
    article.active { border-color:#1b8a5a; background:#edf9f2; }
    article.repair { border-color:#b7791f; background:#fff8e7; }
    article.closed { border-color:#c9202b; background:#fff0f1; }
    article.uncertain { border-color:#a66a12; background:#fffaf0; }
    p { margin:4px 0; } .headline { font-weight:700; } .muted { color:#475569; }
    details { margin-top:7px; } summary { cursor:pointer; color:#334155; }
    a, button { color:#1d4ed8; } button { border:0; background:none; padding:0; cursor:pointer; text-decoration:underline; font:inherit; }
    button:focus-visible, a:focus-visible, summary:focus-visible { outline:2px solid #1d4ed8; outline-offset:2px; }
    ul { margin:5px 0; padding-left:20px; } .source-title { font-weight:600; }
    blockquote { margin:4px 0 8px; padding-left:8px; border-left:2px solid #cbd5e1; color:#475569; }
    iframe { display:block; width:100%; min-height:46px; border:0; margin-top:6px; background:white; }
  `);
  const card = element("article");
  if (state === "checking") {
    card.append(element("p", "Checking Genie…"));
    card.className = "checking";
    root.append(style, card);
    return mount;
  }

  if (!state.ok) {
    card.className = "uncertain";
    card.append(element("p", "Uncertain"), element("p", state.message));
    root.append(style, card);
    return mount;
  }
  const result = state.result;

  const repaired = hasVerifiedRepair(result) && !restored.has(key);
  card.className = statusClass(result);
  const headline = element("p", repaired ? "Updated link by Genie" : statusText(result));
  headline.className = "headline";
  card.append(headline, element("p", result.reason));
  const details = element("details");
  details.append(element("summary", "Genie details"));
  details.append(element("p", `Original link: ${result.linkState}`));
  details.append(element("p", `Checked: ${formatTime(result.checkedAt)}`));
  if (result.cached) details.append(element("p", "Using a recent completed check."));
  if (listing.website) {
    const original = element("a", "Open original website");
    original.href = listing.website;
    original.target = "_blank";
    original.rel = "noopener noreferrer";
    details.append(original);
  }
  if (repaired) {
    const restore = element("button", "Use original link");
    restore.type = "button";
    restore.addEventListener("click", () => {
      restoreOriginal(link, key);
      const next = render(listing, { ok: true, result }, key, link);
      host?.replaceWith(next);
      host = next;
    });
    details.append(document.createTextNode(" · "), restore);
  }
  if (result.sources.length) {
    const sources = element("ul");
    for (const source of result.sources) {
      const item = element("li");
      const sourceLink = element("a", source.title);
      sourceLink.href = source.url;
      sourceLink.target = "_blank";
      sourceLink.rel = "noopener noreferrer";
      sourceLink.className = "source-title";
      item.append(sourceLink, element("blockquote", source.excerpt), element("span", `Retrieved ${formatTime(source.retrievedAt)}`));
      sources.append(item);
    }
    details.append(element("p", "Sources:"), sources);
  }
  const attribution = result.searchAttribution;
  if (attribution?.renderedContent) {
    details.append(element("p", "Google Search attribution:"));
    const frame = document.createElement("iframe");
    frame.title = "Google Search attribution";
    frame.setAttribute("sandbox", "");
    // Provider HTML stays inside a scriptless, unique-origin sandbox.
    frame.srcdoc = attribution.renderedContent;
    details.append(frame);
  }
  card.append(details);
  root.append(style, card);
  return mount;
}

function requestCheck(listing: Listing): Promise<CheckReply> {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: "GENIE_CHECK", listing }, response => {
      if (chrome.runtime.lastError || !response || typeof response !== "object") {
        resolve({ ok: false, message: "Could not complete this check." });
        return;
      }
      resolve(response as CheckReply);
    });
  });
}

async function scan() {
  const detail = extractDetail(document, location.href);
  const right = document.querySelector(".resource-page__right");
  if (!detail || !right) {
    clearView();
    fingerprint = "";
    return;
  }
  const link = linkFor(right);
  const listing = originalListing(detail, link);
  const key = keyFor(listing);
  if (fingerprint === key && host?.isConnected && websiteLink === link) return;
  clearView();
  fingerprint = key;
  websiteLink = link;
  const prior = completed.get(key);
  if (prior) applyRepair(link, prior, key);
  host = prior
    ? render(listing, { ok: true, result: prior }, key, link)
    : render(listing, "checking", key, link);
  if (link) link.after(host);
  else right.prepend(host);
  if (prior) return;

  const version = ++requestVersion;
  const response = await requestCheck(listing);
  if (version !== requestVersion || fingerprint !== key || !host?.isConnected) return;
  if (response.ok) {
    completed.set(key, response.result);
    applyRepair(link, response.result, key);
  }
  const next = render(listing, response, key, link);
  host.replaceWith(next);
  host = next;
}

let timer: ReturnType<typeof setTimeout>;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => void scan(), 500);
}

new MutationObserver(records => {
  const relevant = records.some(record => record.type !== "childList" ||
    [...record.addedNodes, ...record.removedNodes].some(node =>
      !(node instanceof Element && node.id === hostId)));
  if (relevant || (host && !host.isConnected)) schedule();
}).observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: ["href"],
});

window.addEventListener("popstate", schedule);
let previousUrl = location.href;
setInterval(() => {
  if (location.href !== previousUrl) {
    previousUrl = location.href;
    fingerprint = "";
    schedule();
  }
}, 500);
schedule();
