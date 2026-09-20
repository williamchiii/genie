import asyncio
from time import monotonic
from collections import OrderedDict
from dataclasses import dataclass
from weakref import WeakKeyDictionary

from config import settings
from schemas.listing import ListingRequest
from schemas.result import CheckResult
from services.gemini import Verification, fallback, verify_listing
from services.link_checker import LinkCheck, check_link

# Process local and bounded. Restarting the server clears cached assessments.
_cache: OrderedDict[str, tuple[float, CheckResult]] = OrderedDict()


@dataclass
class Flight:
    task: asyncio.Task
    waiters: int = 0


class Coordinator:
    def __init__(self):
        self.concurrency = settings.max_concurrent_checks
        self.capacity = self.concurrency + settings.max_queued_checks
        self.slots = asyncio.Semaphore(self.concurrency)
        self.flights: dict[str, Flight] = {}


# Async primitives belong to an event loop. This also isolates test app lifespans.
_coordinators: WeakKeyDictionary = WeakKeyDictionary()


def coordinator() -> Coordinator:
    loop = asyncio.get_running_loop()
    if loop not in _coordinators:
        _coordinators[loop] = Coordinator()
    return _coordinators[loop]


async def close_checks() -> None:
    state = _coordinators.pop(asyncio.get_running_loop(), None)
    if state is None:
        return
    tasks = [flight.task for flight in state.flights.values()]
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    state.flights.clear()


def forget(state: Coordinator, key: str, task: asyncio.Task) -> None:
    flight = state.flights.get(key)
    if flight is not None and flight.task is task:
        del state.flights[key]
    # Consume failures even if every HTTP caller was cancelled meanwhile.
    if not task.cancelled():
        task.exception()


async def check_listing(listing: ListingRequest) -> CheckResult:
    # Pydantic already trims fields and normalizes URLs. Include all matching
    # details so listings at different branches do not share an assessment.
    key = listing.model_dump_json(exclude={"listingId"})
    cached = _cache.get(key)
    if cached is not None:
        expires, result = cached
        if expires > monotonic():
            _cache.move_to_end(key)
            return result.model_copy(update={"listingId": listing.listingId, "cached": True}, deep=True)
        del _cache[key]

    state = coordinator()
    flight = state.flights.get(key)
    if flight is None:
        if len(state.flights) >= state.capacity:
            return CheckResult(
                listingId=listing.listingId,
                reason="Genie is busy checking other listings. Please try again shortly.",
            )
        # There is no await between lookup and registration, so duplicate
        # requests on this loop cannot create multiple tasks for the same key.
        task = asyncio.create_task(run_verification(listing, key, state))
        flight = Flight(task)
        state.flights[key] = flight
        task.add_done_callback(lambda done: forget(state, key, done))
    flight.waiters += 1
    try:
        # One cancelled caller must not cancel work needed by another caller.
        result = await asyncio.shield(flight.task)
        return result.model_copy(update={"listingId": listing.listingId}, deep=True)
    finally:
        flight.waiters -= 1
        if flight.waiters == 0 and not flight.task.done():
            # No remaining consumers: stop queued/network work and free capacity.
            if state.flights.get(key) is flight:
                del state.flights[key]
            flight.task.cancel()
            await asyncio.gather(flight.task, return_exceptions=True)


async def run_verification(listing: ListingRequest, key: str, state: Coordinator) -> CheckResult:
    link = LinkCheck("unknown", "The website check did not complete.")

    async def pipeline() -> Verification:
        nonlocal link
        async with state.slots:
            link = await check_link(
                str(listing.website) if listing.website is not None else None,
                include_content=True,
            )
            return await verify_listing(listing, link)

    try:
        verification = await asyncio.wait_for(pipeline(), timeout=settings.check_timeout_seconds)
    except TimeoutError:
        return fallback(listing, link, "Verification reached its time limit while waiting or checking. Service activity remains uncertain.")
    result = verification.result
    # Provider failures, inaccessible evidence and incomplete requests are not cached.
    if verification.cacheable:
        _cache[key] = (monotonic() + settings.cache_ttl_seconds, result)
        _cache.move_to_end(key)
        while len(_cache) > settings.cache_max_entries:
            _cache.popitem(last=False)
    return result
