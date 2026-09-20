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

const SPARKLE_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="#5B3FD9" stroke="none"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z"></path></svg>`;
const WARNING_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9A6A0F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3z"></path><line x1="12" y1="9" x2="12" y2="13"></line><circle cx="12" cy="16.5" r="0.6" fill="#9A6A0F" stroke="none"></circle></svg>`;
const CHECK_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1B8A5A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

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
  // The backend doesn't return a structured mismatch reason, only free text,
  // so this is a best-effort label, not a claim the backend guarantees.
  if (/\baddress\b/i.test(result.reason)) return "Check address";
  return "Uncertain";
}

function renderBadge(state: "checking" | CheckReply, inset?: { top: string; right: string; fontFamily: string }): HTMLElement {
  const host = element("span");
  host.setAttribute(badgeMark, "");
  const root = host.attachShadow({ mode: "open" });
  root.append(element("style", `
    :host { position:absolute; top:8px; right:8px; display:inline-flex; align-items:center;
      gap:3px; font:600 9px/1.3 system-ui,sans-serif; z-index:1; }
    .dot { width:6px; height:6px; border-radius:50%; flex:none; }
    .dot.gray { background:#94a3b8; }
    .dot.green { background:#1b8a5a; }
    .dot.red { background:#c9202b; }
    .icon { width:16px; height:16px; display:inline-flex; flex:none; }
    .icon svg { display:block; }
    .label.gray { color:#475569; }
    .label.green { color:#1b8a5a; }
    .label.purple { color:#6941e8; }
    .label.yellow { color:#96600b; }
    .label.red { color:#c9202b; }
  `));
  if (inset) {
    host.style.top = inset.top;
    host.style.right = inset.right;
    host.style.fontFamily = inset.fontFamily;
  }
  const color = badgeColor(state);
  const icons: Partial<Record<typeof color, string>> = { purple: SPARKLE_SVG, yellow: WARNING_SVG, green: CHECK_SVG };
  const dot = element("span");
  dot.setAttribute("aria-hidden", "true");
  const icon = icons[color];
  if (icon) {
    dot.className = "icon";
    dot.innerHTML = icon;
  } else {
    dot.className = `dot ${color}`;
  }
  const label = element("span", badgeLabel(state));
  label.className = `label ${color}`;
  root.append(dot, label);
  return host;
}

function clearCard(card: Element) {
  card.querySelectorAll(`[${badgeMark}]`).forEach(node => node.remove());
}

const completed = new Map<string, CheckReply>();
const requested = new Set<string>();

function paint(card: Element, state: "checking" | CheckReply) {
  clearCard(card);
  let inset: { top: string; right: string; fontFamily: string } | undefined;
  if (card instanceof HTMLElement) {
    if (!card.style.position) card.style.position = "relative";
    const style = getComputedStyle(card);
    inset = { top: style.paddingTop, right: style.paddingRight, fontFamily: style.fontFamily };
  }
  const badge = renderBadge(state, inset);
  card.prepend(badge);
}

async function process(card: Element, listing: Listing) {
  const key = keyFor(listing);
  const prior = completed.get(key);
  if (prior) {
    paint(card, prior);
    return;
  }
  paint(card, "checking");
  if (requested.has(key)) return;
  requested.add(key);
  const reply = await requestCheck(listing);
  completed.set(key, reply);
  requested.delete(key);
  // The card may have re-rendered (pagination, filter change) while the check ran.
  const stillPresent = document.contains(card);
  if (stillPresent) paint(card, reply);
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
