// Runs in the page's own JS context (world: MAIN), before the app's bundle,
// so it can observe the response of the search results API the app already
// calls. This avoids reconstructing that request's filters/geolocation/paging
// ourselves, which would risk drifting from what the user is actually seeing.
const SEARCH_PATH = "/api/resource/search";

const OriginalXHR = window.XMLHttpRequest;

function PatchedXHR(this: unknown) {
  const xhr = new OriginalXHR();
  const originalOpen = xhr.open.bind(xhr);
  let url: string | null = null;
  xhr.open = function (method: string, requestUrl: string | URL, ...rest: unknown[]) {
    url = String(requestUrl);
    // @ts-expect-error passthrough to the native overload
    return originalOpen(method, requestUrl, ...rest);
  };
  xhr.addEventListener("load", () => {
    try {
      if (!url || !new URL(url, location.origin).pathname.startsWith(SEARCH_PATH)) return;
      const body: unknown =
        xhr.responseType === "" || xhr.responseType === "text"
          ? JSON.parse(xhr.responseText)
          : xhr.response;
      const results = (body as { payload?: { results?: unknown } } | null)?.payload?.results;
      if (Array.isArray(results)) {
        window.postMessage({ source: "genie-search-intercept", results }, "*");
      }
    } catch {
      // Not the response shape we expect; ignore silently, never break the page's own request.
    }
  });
  return xhr;
}
PatchedXHR.prototype = OriginalXHR.prototype;
// @ts-expect-error intentional global override, restricted to this content script's isolated realm
window.XMLHttpRequest = PatchedXHR;
