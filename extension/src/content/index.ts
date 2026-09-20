import { extractDetail, type Listing } from "./extract";

const hostId = "genie-detail-preview";
let fingerprint = "";
let host: HTMLElement | null = null;
let styledLink: Element | null = null;
let styledHeading: Element | null = null;
let styledTitle: Element | null = null;

function clearPreview() {
  styledLink?.classList.remove("genie-demo-broken-link", "genie-demo-fixed-link");
  styledHeading?.classList.remove("genie-demo-fixed-heading", "genie-demo-uncertain-heading");
  styledTitle?.classList.remove("genie-demo-uncertain-title");
  styledTitle = null;
  styledHeading = null;
  styledLink = null;
  host?.remove();
  host = null;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, value: string) {
  const node = document.createElement(tag);
  node.textContent = value;
  return node;
}

function render(listing: Listing, broken: boolean, fixed: boolean, uncertain: boolean): HTMLElement {
  const mount = document.createElement("section");
  mount.id = hostId;
  mount.setAttribute("aria-label", "Genie demo preview");
  // Scope this rule to the single marked website anchor, never the phone link.
  mount.append(element("style", `
    a.genie-demo-broken-link {
      color:#929baa !important; text-decoration:line-through !important;
      text-decoration-thickness:1px !important;
    }
    a.genie-demo-broken-link:focus-visible { outline:2px solid #2563eb; outline-offset:3px; }
    a.genie-demo-fixed-link { color:#2359b8 !important; font-weight:600 !important; }
    .genie-demo-fixed-heading { align-items:baseline; }
    .genie-demo-fixed-heading::after { content:'✦ GENIE'; margin-left:auto;
      color:#6941e8; background:#f1ecff; padding:3px 10px; border-radius:20px;
      font:700 10px/1.5 system-ui,sans-serif; letter-spacing:.3px; }
    .genie-demo-uncertain-heading { align-items:baseline; gap:6px; flex-wrap:wrap; }
    .genie-demo-uncertain-heading::after { content:'⚠ GENIE · UNCERTAIN'; margin-left:auto;
      color:#96600b; background:#fff3da; padding:3px 9px; border-radius:20px;
      font:700 10px/1.5 system-ui,sans-serif; }
    .genie-demo-uncertain-title::after { content:'●'; color:#bc7c19;
      font-size:17px; margin-left:12px; vertical-align:middle; }
  `));
  const root = mount.attachShadow({ mode: "open" });
  const style = element("style", `
    :host { display:block; margin:6px 0 0; color:#172033;
      font:13px/1.5 "Atkinson Hyperlegible",system-ui,sans-serif; }
    article { overflow-wrap:anywhere; }
    p { margin:6px 0; }
    .demo { color:#64748b; font-size:12px; }
    .status { display:inline-flex; align-items:center; gap:6px; margin:0;
      color:#475569; background:#f1f5f9; padding:3px 10px; border-radius:6px; }
    .broken { color:#c9202b; background:#fcebed; }
    .fixed { color:#18754b; background:#e6f5eb; }
    .sr-only { position:absolute; width:1px; height:1px; overflow:hidden;
      clip-path:inset(50%); white-space:nowrap; }
    .uncertain-box { margin:8px 0; padding:12px; border:1px solid #f5dfb1;
      border-radius:8px; background:#fffbf2; color:#78613d; }
    .actions { display:flex; gap:18px; align-items:center; margin:8px 0 12px; }
    .suggest { border:1px solid #d7deea; padding:4px 10px; border-radius:6px;
      color:#24334b; background:#fff; text-decoration:none; }
    .dismiss { color:#64748b; text-decoration:none; }
    form { margin:12px 0; } label { display:block; margin-bottom:6px; }
    input { box-sizing:border-box; width:100%; border:1px solid #d7deea;
      border-radius:6px; padding:8px; margin-bottom:8px; font:inherit; }
    [hidden] { display:none !important; }
    .explanation { margin:12px 0; padding:12px; border:1px solid #ede7ff;
      border-radius:8px; background:#faf8ff; color:#50516c; }
    .explanation h3 { margin:0 0 6px; font-size:12px; color:#6941e8; }
    .explanation a, button { color:#6941e8; text-decoration:underline; }
    button { border:0; background:none; padding:0; cursor:pointer; font:inherit; }
    button:focus-visible, a:focus-visible { outline:2px solid #6941e8; outline-offset:3px; }
    .icon { font-size:15px; line-height:1; }
    summary { cursor:pointer; color:#475569; padding:4px 0; font-size:12px; }
    summary:focus-visible { outline:2px solid #1d4ed8; outline-offset:3px; }
    pre { white-space:pre-wrap; overflow-wrap:anywhere; font:12px/1.6 monospace;
      padding:12px; background:#f1f5f9; border-radius:6px; }
  `);
  const card = document.createElement("article");
  const demo = element("p", "Demo data, not a live check.");
  demo.className = "demo";
  const status = element("p", "");
  status.className = broken ? "status broken" : fixed ? "status fixed" : "status";
  const icon = element("span", broken ? "⚠" : fixed ? "✓" : "?");
  icon.className = "icon";
  icon.setAttribute("aria-hidden", "true");
  status.append(icon, document.createTextNode(broken ? "Link unreachable" : fixed ? "Updated link by Genie" : "Link not checked"));
  if (uncertain) {
    status.className = "sr-only";
    status.textContent = "Genie: Uncertain. Demo data, not a live check.";
  }
  const details = document.createElement("details");
  details.append(element("summary", "Genie details"),
    element("p", broken
      ? "Broken-link appearance preview. No live check has run. A failed website link does not mean the service is closed."
      : "No live check has run. Service status is uncertain."),
    element("p", "Service status: Uncertain · Not checked"),
    element("pre", JSON.stringify(listing, null, 2)));
  card.append(status, demo);
  if (uncertain) {
    const panel = element("div", "");
    const explanation = element("p", "The site didn't respond, but Genie couldn't confidently match a replacement, so the original link stays.");
    explanation.className = "uncertain-box";
    const actions = element("div", "");
    actions.className = "actions";
    const suggest = element("button", "Suggest a link");
    suggest.type = "button";
    suggest.className = "suggest";
    const dismiss = element("button", "Dismiss");
    dismiss.type = "button";
    dismiss.className = "dismiss";
    const reopen = element("button", "Show Genie details");
    reopen.type = "button";
    reopen.hidden = true;
    const form = document.createElement("form");
    form.hidden = true;
    const label = element("label", "Suggested website (demo only)");
    label.htmlFor = "genie-suggestion";
    const input = document.createElement("input");
    input.id = "genie-suggestion";
    input.type = "url";
    input.required = true;
    input.placeholder = "https://example.org";
    const save = element("button", "Save in preview");
    save.type = "submit";
    save.className = "suggest";
    const feedback = element("p", "Suggestions stay in this preview and are not sent or applied.");
    feedback.setAttribute("role", "status");
    form.append(label, input, save, feedback);
    suggest.setAttribute("aria-expanded", "false");
    suggest.addEventListener("click", () => {
      form.hidden = !form.hidden;
      suggest.setAttribute("aria-expanded", String(!form.hidden));
      if (!form.hidden) input.focus();
    });
    input.addEventListener("input", () => input.setCustomValidity(""));
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (!/^https?:\/\//i.test(input.value.trim())) {
        input.setCustomValidity("Use an http:// or https:// website URL.");
        input.reportValidity();
        return;
      }
      feedback.textContent = "Saved in this preview only. The original website is unchanged; nothing was submitted.";
    });
    dismiss.addEventListener("click", () => {
      panel.hidden = true;
      reopen.hidden = false;
      reopen.focus();
    });
    reopen.addEventListener("click", () => {
      panel.hidden = false;
      reopen.hidden = true;
      suggest.focus();
    });
    actions.append(suggest, dismiss);
    panel.append(explanation, actions, form);
    card.append(panel, reopen);
  }
  if (fixed && listing.website) {
    const explanation = element("section", "");
    explanation.className = "explanation";
    const heading = element("h3", "ⓘ Why Genie changed this");
    const message = element("p", "This previews a repaired link for Released. Its existing website is used for the demo; no broken link or replacement has been verified.");
    const original = element("a", "View original");
    original.href = listing.website;
    original.target = "_blank";
    original.rel = "noopener noreferrer";
    const restore = element("button", "Restore");
    restore.type = "button";
    restore.setAttribute("aria-label", "Restore original appearance in demo");
    let restored = false;
    restore.addEventListener("click", () => {
      restored = !restored;
      styledLink?.classList.toggle("genie-demo-fixed-link", !restored);
      styledHeading?.classList.toggle("genie-demo-fixed-heading", !restored);
      status.className = restored ? "status" : "status fixed";
      status.textContent = restored ? "Original link · Not checked" : "✓ Updated link by Genie";
      heading.textContent = restored ? "Original appearance restored" : "ⓘ Why Genie changed this";
      restore.textContent = restored ? "Preview updated state" : "Restore";
      restore.setAttribute("aria-label", restored ? "Preview updated link appearance" : "Restore original appearance in demo");
    });
    explanation.append(heading, message, original, document.createTextNode(" · "), restore);
    card.append(explanation);
  }
  card.append(details);
  root.append(style, card);
  return mount;
}

function scan() {
  const listing = extractDetail(document, location.href);
  if (!listing) {
    clearPreview();
    fingerprint = "";
    return;
  }
  const next = JSON.stringify(listing);
  const right = document.querySelector(".resource-page__right")!;
  const websiteLabel = Array.from(right.querySelectorAll("p"))
    .find(node => node.textContent?.trim() === "Website");
  const candidate = websiteLabel?.parentElement?.nextElementSibling;
  const link = candidate?.matches("a") ? candidate : null;
  if (fingerprint === next && host?.isConnected && styledLink === link) return;
  clearPreview();
  // Explicit S4P mock only: never infer broken status for another organization.
  const broken = listing.listingId === "6731049ac332c8ac3a1c250f" &&
    listing.website === "https://www.strivinghome.org/synergy/home-synergy";
  const uncertain = listing.name === "Released" &&
    /^https:\/\/releasedreentry\.org\/?$/.test(listing.website ?? "");
  const fixed = false; // Repaired-link design retained; Released currently previews uncertainty.
  host = render(listing, broken, fixed, uncertain);
  styledLink = link;
  if (broken) link?.classList.add("genie-demo-broken-link");
  if (fixed) {
    link?.classList.add("genie-demo-fixed-link");
    styledHeading = websiteLabel?.parentElement ?? null;
    styledHeading?.classList.add("genie-demo-fixed-heading");
  }
  if (uncertain) {
    styledHeading = websiteLabel?.parentElement ?? null;
    styledHeading?.classList.add("genie-demo-uncertain-heading");
    const left = document.querySelector(".resource-page__left");
    const titleRow = left && Array.from(left.children).find(child =>
      child.tagName === "DIV" && Array.from(child.querySelectorAll("button"))
        .some(button => button.textContent?.trim() === "Print"));
    styledTitle = titleRow?.querySelector(":scope > p") ?? null;
    styledTitle?.classList.add("genie-demo-uncertain-title");
  }
  if (link) link.after(host);
  else right.prepend(host);
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
    clearPreview();
    fingerprint = "";
    schedule();
  }
}, 500);
schedule();
