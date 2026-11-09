import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from fastapi import HTTPException

from main import app, fetch_agriculture_news, get_agriculture_news


class FakeFeedResponse:
    def __init__(self, body: bytes):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self, size: int) -> bytes:
        return self.body[:size]


class AgricultureNewsTests(unittest.TestCase):
    def setUp(self):
        self.previous_news = app.state.agriculture_news
        self.previous_fetched_at = app.state.agriculture_news_fetched_at

    def tearDown(self):
        app.state.agriculture_news = self.previous_news
        app.state.agriculture_news_fetched_at = self.previous_fetched_at

    @patch("main.urlopen")
    def test_feed_returns_agriculture_stories_and_requests_india_news(self, urlopen):
        urlopen.return_value = FakeFeedResponse(
            b"""<?xml version="1.0"?>
            <rss><channel>
              <item>
                <title>Farmers welcome new crop support scheme</title>
                <link>https://news.example/agriculture</link>
                <source>Example News</source>
                <pubDate>Thu, 29 Oct 2026 10:00:00 GMT</pubDate>
              </item>
              <item>
                <title>National sports update</title>
                <link>https://news.example/sports</link>
              </item>
            </channel></rss>"""
        )

        stories = fetch_agriculture_news()

        self.assertEqual(len(stories), 1)
        self.assertEqual(stories[0]["source"], "Example News")
        self.assertEqual(stories[0]["published_at"], "2026-10-29T10:00:00+00:00")
        params = parse_qs(urlparse(urlopen.call_args.args[0].full_url).query)
        self.assertIn("India", params["q"][0])
        self.assertEqual(params["gl"], ["IN"])

    @patch("main.fetch_agriculture_news")
    def test_recent_feed_is_served_from_cache(self, fetch_news):
        cached_news = {
            "source": "Google News RSS",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "is_stale": False,
            "stories": [],
        }
        app.state.agriculture_news = cached_news
        app.state.agriculture_news_fetched_at = datetime.now(timezone.utc)

        result = get_agriculture_news()

        self.assertEqual(result, cached_news)
        fetch_news.assert_not_called()

    @patch("main.fetch_agriculture_news", side_effect=HTTPException(502, "Feed offline"))
    def test_failed_refresh_returns_existing_stories_as_stale(self, fetch_news):
        app.state.agriculture_news = {
            "source": "Google News RSS",
            "fetched_at": "2026-10-29T10:00:00+00:00",
            "is_stale": False,
            "stories": [{"title": "Farmers update"}],
        }
        app.state.agriculture_news_fetched_at = datetime(2026, 10, 29, tzinfo=timezone.utc)

        result = get_agriculture_news()

        self.assertTrue(result["is_stale"])
        self.assertEqual(result["stories"][0]["title"], "Farmers update")
        fetch_news.assert_called_once()


if __name__ == "__main__":
    unittest.main()
