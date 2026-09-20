import { extractDetail, type Listing } from "./extract";

const hostId = "genie-detail-preview";
let fingerprint = "";
let host: HTMLElement | null = null;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, value: string) {
  const node = document.createElement(tag);
  node.textContent = value;
  return node;
}

function render(listing: Listing): HTMLElement {
  const mount = document.createElement("section");
  mount.id = hostId;
  mount.setAttribute("aria-label", "Genie demo preview");
  const root = mount.attachShadow({ mode: "open" });
  const style = element("style", `
    :host { display:block; margin:20px 0; color:#172033; font:15px/1.5 system-ui,sans-serif; }
    article { border:1px solid #cbd5e1; border-top:4px solid #2563eb; border-radius:12px;
      padding:20px; background:#fff; box-shadow:0 4px 18px #1720330d; overflow-wrap:anywhere; }
    h2 { font-size:20px; margin:0 0 8px; } p { margin:8px 0; }
    .demo { color:#92400e; background:#fffbeb; padding:8px 12px; border-radius:6px; }
    .status { font-weight:700; color:#475569; }
    summary { cursor:pointer; color:#1d4ed8; padding:8px 0; }
    summary:focus-visible { outline:2px solid #1d4ed8; outline-offset:3px; }
    pre { white-space:pre-wrap; overflow-wrap:anywhere; font:12px/1.6 monospace;
      padding:12px; background:#f1f5f9; border-radius:6px; }
  `);
  const card = document.createElement("article");
  const demo = element("p", "Demo data, not a live check.");
  demo.className = "demo";
  const status = element("p", "? Uncertain · Not checked");
  status.className = "status";
  const details = document.createElement("details");
  details.append(element("summary", "View extracted listing details"),
    element("pre", JSON.stringify(listing, null, 2)));
  card.append(element("h2", "Genie"), demo, element("p", listing.name), status,
    element("p", "Listing details are ready. No live verification has run, and no website link has been changed."),
    details);
  root.append(style, card);
  return mount;
}

function scan() {
  const listing = extractDetail(document, location.href);
  if (!listing) {
    host?.remove();
    host = null;
    fingerprint = "";
    return;
  }
  const next = JSON.stringify(listing);
  if (fingerprint === next && host?.isConnected) return;
  host?.remove();
  host = render(listing);
  document.querySelector(".resource-page__right")!.prepend(host);
  fingerprint = next;
}

let timer: ReturnType<typeof setTimeout>;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(scan, 500);
}

new MutationObserver(records => {
  // Shadow DOM isolates the preview's contents. Ignore inserting/removing its host.
  const changed = records.some(record => record.type !== "childList" ||
    [...record.addedNodes, ...record.removedNodes].some(node =>
      !(node instanceof Element && node.id === hostId)));
  if (changed || (host && !host.isConnected)) schedule();
}).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true,
  attributeFilter: ["href"] });
window.addEventListener("popstate", schedule);
// pushState navigation can change the URL without a DOM mutation.
let previousUrl = location.href;
setInterval(() => {
  if (location.href !== previousUrl) {
    previousUrl = location.href;
    host?.remove();
    host = null;
    fingerprint = "";
    schedule();
  }
}, 500);
schedule();
