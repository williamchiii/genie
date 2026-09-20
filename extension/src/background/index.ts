const API_URL = "http://127.0.0.1:8787/api/check";
const REQUEST_TIMEOUT_MS = 25_000;

interface ListingRequest {
  listingId: string;
  name: string;
  website: string | null;
  address: string | null;
  phone: string | null;
  serviceType: string | null;
}

interface Source {
  title: string;
  url: string;
  excerpt: string;
  retrievedAt: string;
}

export interface CheckResult {
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

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isCheckResult(value: unknown): value is CheckResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<CheckResult>;
  const validStatus = ["active", "closed", "uncertain"].includes(result.status ?? "");
  const validLinkState = ["working", "redirected", "broken", "stale", "unknown"].includes(result.linkState ?? "");
  const validSources = Array.isArray(result.sources) && result.sources.every(source =>
    source && typeof source === "object"
    && typeof (source as Source).title === "string"
    && isHttpUrl((source as Source).url)
    && typeof (source as Source).excerpt === "string"
    && typeof (source as Source).retrievedAt === "string");
  return typeof result.listingId === "string"
    && ["live", "mock"].includes(result.mode ?? "")
    && validStatus && typeof result.reason === "string"
    && (result.checkedAt === null || typeof result.checkedAt === "string")
    && validLinkState && (result.replacementUrl === null || isHttpUrl(result.replacementUrl))
    && validSources && typeof result.cached === "boolean";
}

async function checkListing(listing: ListingRequest): Promise<CheckReply> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(listing),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, message: "Could not complete this check." };
    const result: unknown = await response.json();
    if (!isCheckResult(result) || result.listingId !== listing.listingId) {
      return { ok: false, message: "Could not complete this check." };
    }
    return { ok: true, result };
  } catch {
    return { ok: false, message: "Could not complete this check." };
  } finally {
    clearTimeout(timeout);
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!message || typeof message !== "object" || (message as { type?: unknown }).type !== "GENIE_CHECK") return;
  const listing = (message as { listing?: ListingRequest }).listing;
  if (!listing || typeof listing.listingId !== "string" || typeof listing.name !== "string") {
    sendResponse({ ok: false, message: "Could not complete this check." } satisfies CheckReply);
    return;
  }
  void checkListing(listing).then(sendResponse);
  return true;
});
