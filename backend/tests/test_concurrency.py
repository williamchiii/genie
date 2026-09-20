import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from config import settings
from schemas.listing import ListingRequest
from schemas.result import CheckResult
from services import checks
from services.gemini import Verification
from services.link_checker import LinkCheck


def listing(identifier='one', name='Test Pantry'):
    return ListingRequest(listingId=identifier, name=name, website=None, address=None, phone=None, serviceType=None)


def result(item):
    return Verification(CheckResult(listingId=item.listingId, reason='Controlled test result.'), cacheable=False)


class ConcurrencyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        checks._cache.clear()
        await checks.close_checks()
        self.network = patch('services.checks.check_link', AsyncMock(return_value=LinkCheck('unknown', 'Test')))
        self.fetch = self.network.start()
        self.addCleanup(self.network.stop)
        self.tasks = []

    async def asyncTearDown(self):
        for task in self.tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        await checks.close_checks()

    def start(self, item):
        task = asyncio.create_task(checks.check_listing(item))
        self.tasks.append(task)
        return task

    async def test_duplicate_burst_shares_work_and_keeps_caller_ids(self):
        entered, release = asyncio.Event(), asyncio.Event()
        async def verify(item, link):
            entered.set()
            await release.wait()
            return result(item)
        with patch('services.checks.verify_listing', side_effect=verify) as provider:
            first = self.start(listing('first'))
            await entered.wait()
            others = [self.start(listing(str(i))) for i in range(8)]
            await asyncio.sleep(0)
            self.assertEqual(len(checks.coordinator().flights), 1)
            release.set()
            results = await asyncio.gather(first, *others)
            self.assertEqual(provider.await_count, 1)
            self.assertEqual(self.fetch.await_count, 1)
            self.assertEqual([r.listingId for r in results], ['first', *map(str, range(8))])
            self.assertTrue(all(not r.cached for r in results))
            results[0].reason = 'Changed by caller'
            self.assertNotEqual(results[1].reason, results[0].reason)
            self.assertFalse(checks.coordinator().flights)

    async def test_distinct_listings_obey_concurrency_limit(self):
        active = peak = 0
        full, release = asyncio.Event(), asyncio.Event()
        async def verify(item, link):
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            if active == 2:
                full.set()
            try:
                await release.wait()
                return result(item)
            finally:
                active -= 1
        with patch.object(settings, 'max_concurrent_checks', 2), patch('services.checks.verify_listing', side_effect=verify) as provider:
            tasks = [self.start(listing(str(i), f'Pantry {i}')) for i in range(6)]
            await full.wait()
            self.assertEqual(provider.await_count, 2)
            release.set()
            await asyncio.gather(*tasks)
            self.assertEqual(peak, 2)
            self.assertEqual(provider.await_count, 6)

    async def test_different_locations_do_not_share_a_check(self):
        async def verify(item, link):
            await asyncio.sleep(0)
            return result(item)
        with patch('services.checks.verify_listing', side_effect=verify) as provider:
            a = listing('a').model_copy(update={'address': '1 Main Street'})
            b = listing('b').model_copy(update={'address': '2 Main Street'})
            await asyncio.gather(self.start(a), self.start(b))
            self.assertEqual(provider.await_count, 2)

    async def test_overflow_is_uncertain_but_duplicate_can_join(self):
        entered, release = asyncio.Event(), asyncio.Event()
        async def verify(item, link):
            entered.set()
            await release.wait()
            return result(item)
        with patch.object(settings, 'max_concurrent_checks', 1), patch.object(settings, 'max_queued_checks', 1), patch('services.checks.verify_listing', side_effect=verify) as provider:
            first = self.start(listing('a', 'A'))
            await entered.wait()
            second = self.start(listing('b', 'B'))
            await asyncio.sleep(0)
            duplicate = self.start(listing('a-copy', 'A'))
            overflow = await checks.check_listing(listing('c', 'C'))
            self.assertEqual(overflow.status, 'uncertain')
            self.assertIn('busy', overflow.reason)
            self.assertIsNone(overflow.checkedAt)
            self.assertFalse(checks._cache)
            release.set()
            results = await asyncio.gather(first, second, duplicate)
            self.assertEqual(results[-1].listingId, 'a-copy')
            self.assertEqual(provider.await_count, 2)

    async def test_cancelling_one_waiter_does_not_cancel_shared_work(self):
        entered, release = asyncio.Event(), asyncio.Event()
        async def verify(item, link):
            entered.set()
            await release.wait()
            return result(item)
        with patch('services.checks.verify_listing', side_effect=verify) as provider:
            first = self.start(listing('a'))
            await entered.wait()
            second = self.start(listing('b'))
            await asyncio.sleep(0)
            first.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await first
            self.assertFalse(second.done())
            release.set()
            self.assertEqual((await second).listingId, 'b')
            self.assertEqual(provider.await_count, 1)

    async def test_last_waiter_cancellation_cleans_up_and_allows_retry(self):
        entered, cancelled = asyncio.Event(), asyncio.Event()
        async def verify(item, link):
            entered.set()
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()
        with patch('services.checks.verify_listing', side_effect=verify):
            task = self.start(listing())
            await entered.wait()
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            self.assertTrue(cancelled.is_set())
            self.assertFalse(checks.coordinator().flights)
        with patch('services.checks.verify_listing', AsyncMock(return_value=result(listing()))):
            self.assertEqual((await checks.check_listing(listing())).listingId, 'one')

    async def test_queue_wait_uses_deadline_and_makes_no_network_call(self):
        with patch.object(settings, 'max_concurrent_checks', 1), patch.object(settings, 'check_timeout_seconds', 0.02):
            state = checks.coordinator()
            await state.slots.acquire()
            try:
                with patch('services.checks.verify_listing', AsyncMock()) as provider:
                    response = await checks.check_listing(listing())
                    self.assertEqual(response.status, 'uncertain')
                    self.assertIn('time limit', response.reason)
                    self.assertIsNone(response.checkedAt)
                    self.fetch.assert_not_awaited()
                    provider.assert_not_awaited()
            finally:
                state.slots.release()
            self.assertFalse(state.flights)

    async def test_shared_failure_does_not_poison_retry(self):
        entered, release = asyncio.Event(), asyncio.Event()
        async def fail(item, link):
            entered.set()
            await release.wait()
            raise RuntimeError('Controlled failure')
        with patch('services.checks.verify_listing', side_effect=fail) as provider:
            first = self.start(listing('a'))
            await entered.wait()
            second = self.start(listing('b'))
            await asyncio.sleep(0)
            release.set()
            results = await asyncio.gather(first, second, return_exceptions=True)
            self.assertTrue(all(isinstance(r, RuntimeError) for r in results))
            self.assertEqual(provider.await_count, 1)
            self.assertFalse(checks.coordinator().flights)
        with patch('services.checks.verify_listing', AsyncMock(return_value=result(listing()))):
            self.assertEqual((await checks.check_listing(listing())).status, 'uncertain')

    async def test_shutdown_cancels_active_and_queued_work(self):
        entered = asyncio.Event()
        async def verify(item, link):
            entered.set()
            await asyncio.Event().wait()
        with patch.object(settings, 'max_concurrent_checks', 1), patch('services.checks.verify_listing', side_effect=verify):
            first = self.start(listing('a', 'A'))
            await entered.wait()
            second = self.start(listing('b', 'B'))
            await asyncio.sleep(0)
            await checks.close_checks()
            results = await asyncio.gather(first, second, return_exceptions=True)
            self.assertTrue(all(isinstance(r, asyncio.CancelledError) for r in results))


if __name__ == '__main__':
    unittest.main()
