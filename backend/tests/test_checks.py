import asyncio
import json
import socket
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient
from pydantic import ValidationError

from config import settings
from main import app
from schemas.listing import ListingRequest
from schemas.result import CheckResult
from services import checks
from services.link_checker import LinkCheck, check_link, public_address, UnsafeDestination

FIXTURE = json.loads((Path(__file__).resolve().parents[2] / 'docs/fixtures/s4p-listing.json').read_text())


class LinkTests(unittest.IsolatedAsyncioTestCase):
    async def run_response(self, handler):
        with patch('services.link_checker.public_address', AsyncMock(return_value='93.184.216.34')):
            return await check_link('https://example.org/old', transport=httpx.MockTransport(handler))

    async def test_http_classifications(self):
        for code, state in [(200, 'working'), (404, 'broken'), (410, 'broken'), (403, 'unknown'), (429, 'unknown'), (503, 'unknown')]:
            with self.subTest(code=code):
                result = await self.run_response(lambda request: httpx.Response(code))
                self.assertEqual(result.state, state)
                self.assertIsNotNone(result.checked_at)

    async def test_redirects_use_checked_ip_host_and_tls_name(self):
        requests = []
        def respond(request):
            requests.append(request)
            self.assertEqual(request.url.host, '93.184.216.34')
            self.assertEqual(request.headers['host'], 'example.org')
            self.assertEqual(request.extensions['sni_hostname'], 'example.org')
            return httpx.Response(302, headers={'Location': '/new'}) if request.url.path == '/old' else httpx.Response(200)
        result = await self.run_response(respond)
        self.assertEqual(result.state, 'redirected')
        self.assertEqual(len(requests), 2)

    async def test_private_addresses_and_credentials_are_not_fetched(self):
        def unexpected(request):
            self.fail('Unsafe destination was fetched')
        for url in ['http://127.0.0.1/', 'http://10.0.0.1/', 'http://169.254.169.254/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://224.0.0.1/', 'https://user:password@example.org/', 'http://example.org:8080/']:
            with self.subTest(url=url):
                result = await check_link(url, transport=httpx.MockTransport(unexpected))
                self.assertEqual(result.state, 'unknown')
                self.assertIsNone(result.checked_at)

    async def test_redirect_to_private_host_is_blocked(self):
        count = 0
        def respond(request):
            nonlocal count
            count += 1
            return httpx.Response(302, headers={'Location': 'http://127.0.0.1/private'})
        result = await check_link('https://93.184.216.34/', transport=httpx.MockTransport(respond))
        self.assertEqual(result.state, 'unknown')
        self.assertEqual(count, 1)

    async def test_dns_with_private_answer_is_rejected(self):
        answers = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, '', ('93.184.216.34', 443)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, '', ('127.0.0.1', 443)),
        ]
        loop = asyncio.get_running_loop()
        with patch.object(loop, 'getaddrinfo', AsyncMock(return_value=answers)):
            with self.assertRaises(UnsafeDestination):
                await public_address(httpx.URL('https://example.org'))

    async def test_missing_url_timeout_and_redirect_loop(self):
        self.assertEqual((await check_link(None)).state, 'unknown')
        def timeout(request):
            raise httpx.ReadTimeout('private exception details')
        result = await self.run_response(timeout)
        self.assertEqual(result.state, 'unknown')
        self.assertIsNone(result.checked_at)
        self.assertNotIn('private exception details', result.reason)
        result = await self.run_response(lambda request: httpx.Response(302, headers={'Location': '/old'}))
        self.assertEqual(result.state, 'unknown')

    async def test_total_deadline_and_redirect_limit(self):
        async def slow(request):
            await asyncio.sleep(1)
            return httpx.Response(200)
        with patch.object(settings, 'link_timeout_seconds', 0.01):
            result = await self.run_response(slow)
        self.assertEqual(result.state, 'unknown')
        calls = 0
        def redirect(request):
            nonlocal calls
            calls += 1
            return httpx.Response(302, headers={'Location': f'/hop{calls}'})
        with patch.object(settings, 'max_redirects', 2):
            result = await self.run_response(redirect)
        self.assertEqual(result.state, 'unknown')
        self.assertEqual(calls, 3)


class CacheTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        checks._cache.clear()
        self.listing = ListingRequest.model_validate(FIXTURE)

    async def test_cache_preserves_check_time_and_echoes_new_id(self):
        observation = LinkCheck('broken', 'HTTP 404 does not prove closure.', datetime.now(timezone.utc))
        with patch('services.checks.check_link', AsyncMock(return_value=observation)) as fetch:
            first = await checks.check_listing(self.listing)
            second = await checks.check_listing(self.listing.model_copy(update={'listingId': 'new-card'}))
            self.assertEqual(fetch.await_count, 1)
        self.assertFalse(first.cached)
        self.assertTrue(second.cached)
        self.assertEqual(second.listingId, 'new-card')
        self.assertEqual(first.checkedAt, second.checkedAt)
        self.assertEqual(first.status, 'uncertain')
        self.assertIsNone(first.replacementUrl)

    async def test_unknown_is_not_cached(self):
        with patch('services.checks.check_link', AsyncMock(return_value=LinkCheck('unknown', 'Timed out.'))) as fetch:
            await checks.check_listing(self.listing)
            await checks.check_listing(self.listing)
            self.assertEqual(fetch.await_count, 2)

    async def test_cache_expires_and_is_bounded(self):
        observation = LinkCheck('working', 'HTTP only.', datetime.now(timezone.utc))
        with patch('services.checks.check_link', AsyncMock(return_value=observation)) as fetch:
            with patch('services.checks.time.monotonic', return_value=0):
                await checks.check_listing(self.listing)
            with patch('services.checks.time.monotonic', return_value=settings.cache_ttl_seconds + 1):
                await checks.check_listing(self.listing)
            self.assertEqual(fetch.await_count, 2)
            with patch.object(settings, 'cache_max_entries', 1):
                await checks.check_listing(self.listing.model_copy(update={'name': 'Other service'}))
            self.assertEqual(len(checks._cache), 1)


class ApiTests(unittest.TestCase):
    def setUp(self):
        checks._cache.clear()

    def test_api_reports_link_failure_without_claiming_service_closed(self):
        observation = LinkCheck('broken', 'HTTP 404 does not prove closure.', datetime.now(timezone.utc))
        with patch('services.checks.check_link', AsyncMock(return_value=observation)):
            with TestClient(app) as client:
                response = client.post('/api/check', json=FIXTURE)
                self.assertEqual(response.status_code, 200)
                result = CheckResult.model_validate(response.json())
                self.assertEqual(result.linkState, 'broken')
                self.assertEqual(result.status, 'uncertain')
                self.assertIsNone(result.replacementUrl)
                self.assertEqual(client.get('/health').json(), {'ok': True})

    def test_validation_and_internal_errors_keep_contract(self):
        with TestClient(app, raise_server_exceptions=False) as client:
            for kwargs in [{'json': {}}, {'content': '{', 'headers': {'Content-Type': 'application/json'}}]:
                response = client.post('/api/check', **kwargs)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()['error']['code'], 'INVALID_REQUEST')
            with patch('main.run_check', AsyncMock(side_effect=RuntimeError('secret detail'))):
                response = client.post('/api/check', json=FIXTURE)
                self.assertEqual(response.status_code, 500)
                self.assertEqual(response.json()['error']['code'], 'INTERNAL_ERROR')
                self.assertNotIn('secret detail', response.text)

    def test_response_rejects_classifications_without_evidence(self):
        for status in ['active', 'closed']:
            with self.assertRaises(ValidationError):
                CheckResult(listingId='test', status=status, reason='Unsupported')
        with self.assertRaises(ValidationError):
            CheckResult(listingId='test', reason='Unsupported', replacementUrl='https://example.org/')


if __name__ == '__main__':
    unittest.main()
