import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from main import agriculture_weather


class AgricultureWeatherTests(unittest.TestCase):
    @patch("main.fetch_json")
    def test_weather_includes_current_humidity_and_recent_completed_day_rainfall(self, fetch_json):
        fetch_json.return_value = {
            "current": {
                "time": "2026-10-09T12:00",
                "temperature_2m": 27.5,
                "relative_humidity_2m": 68,
            },
            "daily": {
                "time": ["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"],
                "precipitation_sum": [4.2, 5.3, 100, 200],
            },
        }

        result = agriculture_weather(12.52, 76.9)

        self.assertEqual(result["temperature"]["value"], 27.5)
        self.assertEqual(result["humidity"]["value"], 68)
        self.assertEqual(result["humidity"]["unit"], "%")
        self.assertEqual(result["humidity"]["source"], "Open-Meteo")
        self.assertEqual(result["rainfall"]["value"], 9.5)
        request = parse_qs(urlparse(fetch_json.call_args.args[0]).query)
        self.assertIn("relative_humidity_2m", request["current"][0])

    @patch("main.fetch_json")
    def test_missing_humidity_is_reported_as_unavailable(self, fetch_json):
        fetch_json.return_value = {
            "current": {"time": "2026-10-09T12:00", "temperature_2m": 27.5},
            "daily": {"time": [], "precipitation_sum": []},
        }

        result = agriculture_weather(12.52, 76.9)

        self.assertEqual(result["humidity"]["status"], "unavailable")
        self.assertIsNone(result["humidity"]["value"])
        self.assertEqual(result["rainfall"]["status"], "unavailable")


if __name__ == "__main__":
    unittest.main()
