// Badges results on the search/results list page. Relies on searchIntercept.ts
// (a separate MAIN-world content script) to observe the page's own search API
// response via window.postMessage, since the rendered cards expose no website,
// phone, or ID in their markup to scrape directly.
const RESULTS_SELECTOR = ".search-page__results";
const CARD_SELECTOR = ".card";
const badgeMark = "data-genie-search-badge";

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
}

type CheckReply = { ok: true; result: CheckResult } | { ok: false; message: string };

interface Listing {
  listingId: string;
  name: string;
  website: string | null;
  address: string | null;
  phone: string | null;
  serviceType: string | null;
}

interface SearchApiResult {
  _id: string;
  name: string;
  website?: string;
  phone?: { countryCode?: string; number?: string };
  address?: { street?: string; city?: string; state?: string; zipCode?: string };
  services?: { title?: string }[];
  tags?: string[];
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function normalizeWebsite(raw: string | undefined | null): string | null {
  if (!raw?.trim()) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function formatPhone(phone: SearchApiResult["phone"]): string | null {
  if (!phone?.number) return null;
  return phone.countryCode ? `+${phone.countryCode} ${phone.number}` : phone.number;
}

function formatAddress(address: SearchApiResult["address"]): string | null {
  if (!address) return null;
  const region = [address.state, address.zipCode].filter(Boolean).join(" ");
  const parts = [address.street, address.city, region].filter(part => part && part.length > 0);
  return parts.length ? parts.join(", ") : null;
}

function serviceType(item: SearchApiResult): string | null {
  const titles = (item.services ?? []).map(service => service.title).filter((title): title is string => Boolean(title));
  if (titles.length) return titles.join(", ");
  return item.tags?.length ? item.tags.join(", ") : null;
}

function toListing(item: SearchApiResult): Listing {
  return {
    listingId: item._id,
    name: item.name,
    website: normalizeWebsite(item.website),
    address: formatAddress(item.address),
    phone: formatPhone(item.phone),
    serviceType: serviceType(item),
  };
}

function keyFor(listing: Listing): string {
  return JSON.stringify(listing);
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

function formatTime(value: string | null): string {
  if (!value) return "Not checked";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Not checked" : date.toLocaleString();
}

// Matches the integration contract's indicator rules: red is reserved for
// Confirmed closed and must never be inferred from link health alone.
function badgeColor(state: "checking" | CheckReply): "gray" | "green" | "purple" | "yellow" | "red" {
  if (state === "checking") return "gray";
  if (!state.ok) return "yellow";
  const result = state.result;
  if (result.status === "closed") return "red";
  if (result.status === "active" && result.replacementUrl) return "purple";
  if (result.status === "active") return "green";
  return "yellow";
}

function badgeLabel(state: "checking" | CheckReply): string {
  if (state === "checking") return "Checking…";
  if (!state.ok) return "Uncertain";
  const result = state.result;
  if (result.status === "closed") return "Confirmed closed";
  if (result.status === "active" && result.replacementUrl) return "Updated link by Genie";
  if (result.status === "active") return "Active";
  return "Uncertain";
}

function renderBadge(state: "checking" | CheckReply): HTMLElement {
  const host = element("span");
  host.setAttribute(badgeMark, "");
  const root = host.attachShadow({ mode: "open" });
  root.append(element("style", `
    :host { display:inline-flex; align-items:center; gap:5px; margin-left:8px;
      vertical-align:middle; font:600 11px/1.4 system-ui,sans-serif; }
    .dot { width:9px; height:9px; border-radius:50%; flex:none; }
    .dot.gray { background:#94a3b8; }
    .dot.green { background:#1b8a5a; }
    .dot.purple { background:#6941e8; }
    .dot.yellow { background:#b7791f; }
    .dot.red { background:#c9202b; }
    .label.gray { color:#475569; }
    .label.green { color:#1b8a5a; }
    .label.purple { color:#6941e8; }
    .label.yellow { color:#96600b; }
    .label.red { color:#c9202b; }
  `));
  const color = badgeColor(state);
  const dot = element("span");
  dot.className = `dot ${color}`;
  dot.setAttribute("aria-hidden", "true");
  const label = element("span", badgeLabel(state));
  label.className = `label ${color}`;
  root.append(dot, label);
  return host;
}

function renderDetails(listing: Listing, result: CheckResult): HTMLElement {
  const host = element("div");
  host.setAttribute(badgeMark, "details");
  const root = host.attachShadow({ mode: "open" });
  root.append(element("style", `
    :host { display:block; margin-top:4px; font:12px/1.5 system-ui,sans-serif; color:#334155; }
    details { margin:0; } summary { cursor:pointer; color:#334155; }
    p { margin:3px 0; } a { color:#1d4ed8; }
    ul { margin:4px 0; padding-left:18px; } .source-title { font-weight:600; }
    blockquote { margin:2px 0 6px; padding-left:8px; border-left:2px solid #cbd5e1; color:#475569; }
  `));
  const details = element("details");
  details.append(element("summary", "Genie details"));
  details.append(element("p", result.reason));
  details.append(element("p", `Original link: ${result.linkState}`));
  details.append(element("p", `Checked: ${formatTime(result.checkedAt)}`));
  if (listing.website) {
    const link = element("a", "Open original website");
    link.href = listing.website;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    details.append(link);
  }
  if (result.sources.length) {
    const list = element("ul");
    for (const source of result.sources) {
      const item = element("li");
      const sourceLink = element("a", source.title);
      sourceLink.href = source.url;
      sourceLink.target = "_blank";
      sourceLink.rel = "noopener noreferrer";
      sourceLink.className = "source-title";
      item.append(sourceLink, element("blockquote", source.excerpt));
      list.append(item);
    }
    details.append(element("p", "Sources:"), list);
  }
  root.append(details);
  return host;
}

function clearCard(card: Element) {
  card.querySelectorAll(`[${badgeMark}]`).forEach(node => node.remove());
}

function titleRow(card: Element): Element | null {
  return card.querySelector(".card__header") ?? card.querySelector(".card_left")?.firstElementChild ?? null;
}

const completed = new Map<string, CheckReply>();
const requested = new Set<string>();

function paint(card: Element, listing: Listing, state: "checking" | CheckReply) {
  clearCard(card);
  const heading = titleRow(card);
  const badge = renderBadge(state);
  if (heading) heading.append(badge);
  else card.prepend(badge);
  if (state !== "checking" && state.ok) {
    const details = renderDetails(listing, state.result);
    heading?.after(details);
  }
}

async function process(card: Element, listing: Listing) {
  const key = keyFor(listing);
  const prior = completed.get(key);
  if (prior) {
    paint(card, listing, prior);
    return;
  }
  paint(card, listing, "checking");
  if (requested.has(key)) return;
  requested.add(key);
  const reply = await requestCheck(listing);
  completed.set(key, reply);
  requested.delete(key);
  // The card may have re-rendered (pagination, filter change) while the check ran.
  const stillPresent = document.contains(card);
  if (stillPresent) paint(card, listing, reply);
}

let latestResults: SearchApiResult[] = [];

function scan() {
  const container = document.querySelector(RESULTS_SELECTOR);
  if (!container || latestResults.length === 0) return;
  const cards = Array.from(container.querySelectorAll(CARD_SELECTOR));
  const count = Math.min(cards.length, latestResults.length);
  // Top of the page first: the backend serves requests roughly in submission order.
  for (let i = 0; i < count; i++) {
    const listing = toListing(latestResults[i]);
    if (!listing.name) continue;
    void process(cards[i], listing);
  }
}

let timer: ReturnType<typeof setTimeout>;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(scan, 300);
}

window.addEventListener("message", event => {
  if (event.source !== window) return;
  const data = event.data as { source?: string; results?: unknown } | undefined;
  if (!data || data.source !== "genie-search-intercept" || !Array.isArray(data.results)) return;
  latestResults = data.results as SearchApiResult[];
  schedule();
});

new MutationObserver(records => {
  const relevant = records.some(record =>
    [...record.addedNodes, ...record.removedNodes].some(
      node => !(node instanceof Element && node.hasAttribute(badgeMark)),
    ));
  if (relevant) schedule();
}).observe(document.body, { childList: true, subtree: true });
