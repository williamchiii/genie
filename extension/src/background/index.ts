const API_URL = "http://127.0.0.1:8787/api/check";
const REQUEST_TIMEOUT_MS = 25_000;
const SHARED_RESULT_TTL_MS = 30 * 60 * 1000;

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
  addressMismatch?: boolean;
  cached: boolean;
  searchAttribution?: { renderedContent: string; queries: string[] } | null;
}

type CheckReply = { ok: true; result: CheckResult } | { ok: false; message: string };

interface StoredResult {
  result: CheckResult;
  savedAt: number;
}

function storageKey(listingId: string): string {
  return `genie-result:${listingId}`;
}

async function sharedResult(listingId: string): Promise<CheckResult | null> {
  const key = storageKey(listingId);
  const values = await chrome.storage.session.get(key);
  const stored = values[key] as StoredResult | undefined;
  if (!stored || !isCheckResult(stored.result) || Date.now() - stored.savedAt >= SHARED_RESULT_TTL_MS) {
    if (stored) await chrome.storage.session.remove(key);
    return null;
  }
  return stored.result;
}

async function saveSharedResult(result: CheckResult): Promise<void> {
  await chrome.storage.session.set({
    [storageKey(result.listingId)]: { result, savedAt: Date.now() } satisfies StoredResult,
  });
}

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
    && validSources && (result.addressMismatch === undefined || typeof result.addressMismatch === "boolean")
    && typeof result.cached === "boolean";
}

async function checkListing(listing: ListingRequest): Promise<CheckReply> {
  try {
    const previous = await sharedResult(listing.listingId);
    if (previous) return { ok: true, result: previous };
  } catch {
    // Session storage is an optimization. A storage error must not block a check.
  }
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
    try {
      await saveSharedResult(result);
    } catch {
      // The live response remains valid if session storage is unavailable.
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
