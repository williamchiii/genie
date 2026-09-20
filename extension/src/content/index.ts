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
  addressMismatch?: boolean;
  cached: boolean;
  searchAttribution?: { renderedContent: string; queries: string[] } | null;
}

type CheckReply = { ok: true; result: CheckResult } | { ok: false; message: string };

let fingerprint = "";
let host: HTMLElement | null = null;
let websiteLink: HTMLAnchorElement | null = null;
let websiteHeading: Element | null = null;
let listingTitle: Element | null = null;
let replacementLink: HTMLAnchorElement | null = null;
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

function headingFor(right: Element): Element | null {
  const label = Array.from(right.querySelectorAll("p"))
    .find(node => node.textContent?.trim() === "Website");
  return label?.parentElement ?? null;
}

function titleFor(doc: Document): Element | null {
  const left = doc.querySelector(".resource-page__left");
  const titleRow = left && Array.from(left.children).find(child =>
    child.tagName === "DIV" && Array.from(child.querySelectorAll("button"))
      .some(button => button.textContent?.trim() === "Print"));
  return titleRow?.querySelector(":scope > p") ?? null;
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
  websiteLink?.classList.remove("genie-updated-link", "genie-link-unreachable");
  websiteHeading?.classList.remove("genie-repaired-heading", "genie-active-heading", "genie-unreachable-heading", "genie-uncertain-heading", "genie-address-mismatch-heading", "genie-closed-heading");
  listingTitle?.classList.remove("genie-uncertain-title", "genie-closed-title");
  websiteLink = null;
  websiteHeading = null;
  listingTitle = null;
  replacementLink = null;
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
  if (hasVerifiedRepair(result)) return "repair";
  if (result.linkState === "broken" || result.linkState === "stale") return "broken";
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
  const existing = replacementFor(link);
  const replacement = existing ?? document.createElement("a");
  replacement.dataset.genieReplacement = "true";
  replacement.className = "genie-replacement-link";
  replacement.href = result.replacementUrl;
  replacement.target = "_blank";
  replacement.rel = "noopener noreferrer";
  replacement.textContent = result.replacementUrl;
  replacement.setAttribute("aria-label", `Updated link by Genie: ${result.replacementUrl}`);
  if (!existing) link.after(replacement);
  replacementLink = replacement;
  return true;
}

function restoreOriginal(link: HTMLAnchorElement | null, key: string) {
  const original = link?.dataset.genieOriginalHref;
  if (!link || !isHttpUrl(original)) return;
  replacementFor(link)?.remove();
  replacementLink = null;
  link.classList.remove("genie-updated-link", "genie-link-unreachable");
  restored.add(key);
}

function hasAddressMismatch(result: CheckResult): boolean {
  return result.status === "uncertain" && result.addressMismatch === true;
}

function replacementFor(link: HTMLAnchorElement | null): HTMLAnchorElement | null {
  const sibling = link?.nextElementSibling;
  return sibling instanceof HTMLAnchorElement && sibling.dataset.genieReplacement === "true"
    ? sibling
    : null;
}

function applyListingTreatment(result: CheckResult, key: string) {
  websiteLink?.classList.remove("genie-updated-link", "genie-link-unreachable");
  websiteHeading?.classList.remove("genie-repaired-heading", "genie-active-heading", "genie-unreachable-heading", "genie-uncertain-heading", "genie-address-mismatch-heading", "genie-closed-heading");
  listingTitle?.classList.remove("genie-uncertain-title", "genie-closed-title");
  if (hasVerifiedRepair(result) && !restored.has(key)) {
    websiteLink?.classList.add("genie-link-unreachable");
    websiteHeading?.classList.add("genie-repaired-heading");
    return;
  }
  if (hasVerifiedRepair(result) && restored.has(key)) return;
  replacementFor(websiteLink)?.remove();
  replacementLink = null;
  if (result.status === "closed") {
    websiteHeading?.classList.add("genie-closed-heading");
    listingTitle?.classList.add("genie-closed-title");
    return;
  }
  if (result.linkState === "broken" || result.linkState === "stale") {
    websiteLink?.classList.add("genie-link-unreachable");
    websiteHeading?.classList.add("genie-unreachable-heading");
    return;
  }
  if (result.status === "uncertain" || result.linkState === "unknown") {
    websiteHeading?.classList.add(hasAddressMismatch(result) ? "genie-address-mismatch-heading" : "genie-uncertain-heading");
    listingTitle?.classList.add("genie-uncertain-title");
    return;
  }
  if (result.status === "active" && ["working", "redirected"].includes(result.linkState)) {
    websiteHeading?.classList.add("genie-active-heading");
  }
}

function headlineFor(result: CheckResult, key: string): string {
  if (hasVerifiedRepair(result) && !restored.has(key)) return "";
  if (hasVerifiedRepair(result) && restored.has(key)) return "Original link restored";
  if (result.status === "closed") return "● Confirmed not working";
  if (result.linkState === "broken" || result.linkState === "stale") return "● Link confirmed not working";
  if (result.status === "uncertain" || result.linkState === "unknown") return "";
  return "";
}

function render(listing: Listing, state: "checking" | CheckReply, key: string, link: HTMLAnchorElement | null): HTMLElement {
  const mount = document.createElement("section");
  mount.id = hostId;
  mount.setAttribute("aria-label", "Genie listing check");
  mount.append(element("style", `
    a.genie-link-unreachable { color:#929baa !important; text-decoration:line-through !important; text-decoration-thickness:1px !important; }
    a.genie-link-unreachable:focus-visible, a.genie-replacement-link:focus-visible { outline:2px solid #2563eb; outline-offset:3px; }
    a.genie-replacement-link { display:block; box-sizing:border-box; width:100%; max-width:100%; margin-top:4px; color:#6941e8 !important; font-weight:600 !important; overflow-wrap:anywhere; word-break:break-word; }
    .genie-repaired-heading, .genie-active-heading, .genie-unreachable-heading, .genie-uncertain-heading, .genie-address-mismatch-heading, .genie-closed-heading { align-items:baseline; gap:6px; flex-wrap:wrap; }
    .genie-repaired-heading::after { content:'✦ GENIE · LINK UPDATED'; margin-left:auto; color:#6941e8; font:700 10px/1.5 system-ui,sans-serif; letter-spacing:.3px; }
    .genie-active-heading::after { content:'✓ SERVICE ACTIVE'; margin-left:auto; color:#18754b; font:700 10px/1.5 system-ui,sans-serif; letter-spacing:.3px; }
    .genie-unreachable-heading::after { content:'LINK NOT WORKING'; margin-left:auto; color:#c9202b; font:700 10px/1.5 system-ui,sans-serif; letter-spacing:.3px; }
    .genie-uncertain-heading::after { content:'⚠ GENIE · UNCERTAIN'; margin-left:auto; color:#96600b; font:700 10px/1.5 system-ui,sans-serif; letter-spacing:.3px; }
    .genie-address-mismatch-heading::after { content:'⚠ ADDRESS MISMATCH'; margin-left:auto; color:#96600b; font:700 10px/1.5 system-ui,sans-serif; letter-spacing:.3px; }
    .genie-closed-heading::after { content:'GENIE · NOT WORKING'; margin-left:auto; color:#c9202b; font:700 10px/1.5 system-ui,sans-serif; letter-spacing:.3px; }
    .genie-uncertain-title::after { content:'●'; color:#bc7c19; font-size:17px; margin-left:12px; vertical-align:middle; }
    .genie-closed-title::after { content:'●'; color:#c9202b; font-size:17px; margin-left:12px; vertical-align:middle; }
  `));
  const root = mount.attachShadow({ mode: "open" });
  const style = element("style", `
    :host { display:block; margin:10px 0 0; color:#172033; font:13px/1.5 system-ui,sans-serif; }
    article { padding:5px 0; overflow-wrap:anywhere; }
    article.active .headline { color:#18754b; }
    article.repair .headline { color:#6941e8; }
    article.broken .headline, article.closed .headline { color:#c9202b; }
    article.uncertain .headline { color:#96600b; }
    p { margin:0; } .headline { font-weight:700; } .muted { color:#475569; }
    details { display:block; margin-top:7px; } summary { cursor:pointer; color:#334155; }
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
    card.hidden = true;
    root.append(style, card);
    return mount;
  }
  const result = state.result;

  const repaired = hasVerifiedRepair(result) && !restored.has(key);
  card.className = statusClass(result);
  const headlineText = headlineFor(result, key);
  if (headlineText) {
    const headline = element("p", headlineText);
    headline.className = "headline";
    card.append(headline);
  }
  const details = element("details");
  details.append(element("summary", "View Genie details"));
  details.append(element("p", result.reason));
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
      applyListingTreatment(result, key);
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
  websiteHeading = headingFor(right);
  listingTitle = titleFor(document);
  const prior = completed.get(key);
  if (prior) {
    applyRepair(link, prior, key);
    applyListingTreatment(prior, key);
  }
  host = prior
    ? render(listing, { ok: true, result: prior }, key, link)
    : render(listing, "checking", key, link);
  const mountAfter = replacementFor(link) ?? link;
  if (mountAfter) mountAfter.after(host);
  else right.prepend(host);
  if (prior) return;

  const version = ++requestVersion;
  const response = await requestCheck(listing);
  if (version !== requestVersion || fingerprint !== key || !host?.isConnected) return;
  if (response.ok) {
    completed.set(key, response.result);
    applyRepair(link, response.result, key);
    applyListingTreatment(response.result, key);
  } else {
    websiteHeading?.classList.add("genie-uncertain-heading");
    listingTitle?.classList.add("genie-uncertain-title");
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
