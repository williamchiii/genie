import time
from collections import OrderedDict

from config import settings
from schemas.listing import ListingRequest
from schemas.result import CheckResult
from services.link_checker import check_link

# Process local and bounded. A server restart clears cached link observations.
_cache: OrderedDict[str, tuple[float, CheckResult]] = OrderedDict()


async def check_listing(listing: ListingRequest) -> CheckResult:
    key = listing.model_dump_json(exclude={"listingId"})
    now = time.monotonic()
    cached = _cache.get(key)
    if cached is not None:
        expires, result = cached
        if expires > now:
            _cache.move_to_end(key)
            return result.model_copy(update={"listingId": listing.listingId, "cached": True}, deep=True)
        del _cache[key]

    link = await check_link(str(listing.website) if listing.website is not None else None)
    result = CheckResult(
        listingId=listing.listingId,
        reason=link.reason,
        checkedAt=link.checked_at,
        linkState=link.state,
    )
    # Never keep transient failures or blocked requests for 30 minutes.
    if link.state in {"working", "redirected", "broken"}:
        _cache[key] = (time.monotonic() + settings.cache_ttl_seconds, result)
        _cache.move_to_end(key)
        while len(_cache) > settings.cache_max_entries:
            _cache.popitem(last=False)
    return result
