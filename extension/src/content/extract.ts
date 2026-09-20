export interface Listing {
  listingId: string;
  name: string;
  website: string | null;
  address: string | null;
  phone: string | null;
  serviceType: string | null;
}

const text = (node: Element | null | undefined): string | null =>
  node?.textContent?.replace(/\s+/g, " ").trim() || null;

function label(root: Element, value: string): Element | undefined {
  return Array.from(root.querySelectorAll("p")).find(node => text(node) === value);
}

function contactLink(root: Element, value: string): Element | null {
  // In both supplied pages, the label's wrapper immediately precedes its link.
  const sibling = label(root, value)?.parentElement?.nextElementSibling;
  return sibling?.matches("a") ? sibling : null;
}

function websiteUrl(link: Element | null): string | null {
  const raw = link?.getAttribute("href");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return ["https:", "http:"].includes(url.protocol) ? raw : null;
  } catch {
    return null;
  }
}

export function extractDetail(doc: Document, pageUrl: string): Listing | null {
  const id = new URL(pageUrl).pathname.match(/^\/resource\/([^/]+)\/?$/)?.[1];
  const left = doc.querySelector(".resource-page__left");
  const right = doc.querySelector(".resource-page__right");
  if (!id || !left || !right) return null;

  // The title is a direct paragraph in the row with the Print button.
  // Avoid the Back button, update date, trust badge, and visitor reviews.
  const titleRow = Array.from(left.children).find(child =>
    child.tagName === "DIV" && Array.from(child.querySelectorAll("button"))
      .some(button => text(button) === "Print"));
  const name = text(titleRow?.querySelector(":scope > p"));
  if (!name) return null;

  const addressRow = label(right, "Location and Directions")?.nextElementSibling;
  const address = addressRow
    ? Array.from(addressRow.querySelectorAll("p")).map(text).filter(Boolean).join(", ") || null
    : null;
  const services = label(left, "Services")?.nextElementSibling;
  const serviceType = services?.tagName === "DIV"
    ? Array.from(services.querySelectorAll(".pills")).map(text).filter(Boolean).join(", ") || null
    : null;

  return {
    listingId: id,
    name,
    website: websiteUrl(contactLink(right, "Website")),
    address,
    // Both supplied pages have a website href on the phone anchor. Read its text.
    phone: text(contactLink(right, "Phone")),
    serviceType,
  };
}
