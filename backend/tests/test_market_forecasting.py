import unittest
from datetime import date, timedelta

from main import get_market_intelligence_forecast
from market_forecasting import forecast_market_prices
from market_intelligence import store_market_records
from database import Base
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


class MarketForecastingTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine, tables=[Base.metadata.tables["market_prices"]])
        self.session = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    @staticmethod
    def increasing_series(size: int = 40) -> list[tuple[date, float]]:
        first_day = date(2025, 1, 1)
        return [
            (first_day + timedelta(days=offset), 1000.0 + offset * 10)
            for offset in range(size)
        ]

    def test_insufficient_history_never_returns_forecast_points(self):
        result = forecast_market_prices(self.increasing_series(29))

        self.assertEqual(result["status"], "insufficient_history")
        self.assertEqual(result["points"], [])
        self.assertIsNone(result["validation_mae"])

    def test_forecast_requires_beating_held_out_persistence_baseline(self):
        result = forecast_market_prices(self.increasing_series())

        self.assertEqual(result["status"], "available")
        self.assertEqual(result["validation_days"], 8)
        self.assertLess(result["validation_mae"], result["persistence_baseline_mae"])
        self.assertEqual(len(result["points"]), 7)
        self.assertEqual(result["points"][0]["modal_price"], 1400.0)
        self.assertEqual(result["as_of_date"], "2025-02-09")

    def test_flat_history_does_not_publish_a_forecast_that_cannot_beat_baseline(self):
        observations = [
            (date(2025, 1, 1) + timedelta(days=offset), 1000.0)
            for offset in range(40)
        ]

        result = forecast_market_prices(observations)

        self.assertEqual(result["status"], "baseline_not_better")
        self.assertEqual(result["points"], [])
        self.assertEqual(result["validation_mae"], result["persistence_baseline_mae"])

    def test_horizon_is_bounded(self):
        with self.assertRaises(ValueError):
            forecast_market_prices(self.increasing_series(), horizon_days=31)

    def test_api_forecast_uses_selected_commodity_and_real_stored_rows(self):
        records = [
            {
                "state": "Karnataka",
                "district": "Mandya",
                "market": "Mandya APMC",
                "commodity": "Tomato",
                "variety": "Local",
                "arrival_date": day.strftime("%d/%m/%Y"),
                "min_price": str(price - 10),
                "max_price": str(price + 10),
                "modal_price": str(price),
            }
            for day, price in self.increasing_series()
        ]
        store_market_records(self.session, records)
        store_market_records(
            self.session,
            [
                {
                    "state": "Karnataka",
                    "district": "Mandya",
                    "market": "Mandya APMC",
                    "commodity": "Onion",
                    "variety": "Local",
                    "arrival_date": day.strftime("%d/%m/%Y"),
                    "min_price": "100",
                    "max_price": "120",
                    "modal_price": "110",
                }
                for day, _ in self.increasing_series()
            ],
        )

        result = get_market_intelligence_forecast(
            commodity="Tomato",
            state="Karnataka",
            district="Mandya",
            market=None,
            start_date=None,
            end_date=None,
            horizon_days=7,
            db=self.session,
        )

        self.assertEqual(result["selection"]["commodity"], "Tomato")
        self.assertEqual(result["observed_days"], 40)
        self.assertEqual(result["status"], "available")
        self.assertEqual(len(result["points"]), 7)


if __name__ == "__main__":
    unittest.main()
