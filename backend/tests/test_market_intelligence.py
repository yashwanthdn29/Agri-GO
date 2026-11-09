import unittest
from datetime import date, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from main import (
    market_context_for_assistant,
    get_market_intelligence_prices,
    get_market_intelligence_summary,
    get_market_intelligence_trends,
)
from market_intelligence import store_market_records


class MarketIntelligenceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine, tables=[Base.metadata.tables["market_prices"]])
        self.session = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    @staticmethod
    def record(
        arrival_date: date,
        modal_price: int,
        market: str = "Mandya APMC",
        commodity: str = "Tomato",
    ) -> dict:
        return {
            "state": "Karnataka",
            "district": "Mandya",
            "market": market,
            "commodity": commodity,
            "variety": "Local",
            "arrival_date": arrival_date.strftime("%d/%m/%Y"),
            "min_price": str(modal_price - 20),
            "max_price": str(modal_price + 20),
            "modal_price": str(modal_price),
        }

    def test_duplicate_sync_updates_same_source_observation(self):
        report_day = date.today()
        first = self.record(report_day, 1500)
        corrected = self.record(report_day, 1600)

        self.assertEqual(store_market_records(self.session, [first]), 1)
        self.assertEqual(store_market_records(self.session, [corrected]), 1)

        response = get_market_intelligence_prices(
            commodity=None,
            state=None,
            district=None,
            market=None,
            start_date=None,
            end_date=None,
            limit=100,
            offset=0,
            db=self.session,
        )
        self.assertEqual(response["total"], 1)
        self.assertEqual(response["records"][0]["modal_price"], 1600.0)

    def test_filters_and_date_range_only_return_matching_records(self):
        today = date.today()
        store_market_records(
            self.session,
            [
                self.record(today, 1500),
                self.record(today, 1900, market="Mysuru APMC"),
                self.record(today, 6000, commodity="Onion"),
                self.record(today - timedelta(days=20), 1100),
            ],
        )

        response = get_market_intelligence_prices(
            commodity="Tomato",
            state="Karnataka",
            district="Mandya",
            market="Mandya APMC",
            start_date=today - timedelta(days=1),
            end_date=today,
            limit=100,
            offset=0,
            db=self.session,
        )
        self.assertEqual(response["total"], 1)
        self.assertEqual(response["records"][0]["market"], "Mandya APMC")

    def test_trend_and_summary_use_only_recorded_observations(self):
        today = date.today()
        previous_week = [
            self.record(today - timedelta(days=offset), 1000)
            for offset in range(7, 14)
        ]
        current_week = [
            self.record(today - timedelta(days=offset), 1500)
            for offset in range(7)
        ]
        store_market_records(self.session, previous_week + current_week)

        summary = get_market_intelligence_summary(
            commodity="Tomato",
            state=None,
            district=None,
            market=None,
            start_date=None,
            end_date=None,
            db=self.session,
        )
        trends = get_market_intelligence_trends(
            commodity="Tomato",
            state=None,
            district=None,
            market=None,
            start_date=None,
            end_date=None,
            db=self.session,
        )

        self.assertEqual(summary["average_7_day"], 1500)
        self.assertEqual(summary["average_30_day"], 1250)
        self.assertEqual(summary["trend"], "Increasing")
        self.assertEqual(len(trends["points"]), 14)

    def test_empty_store_returns_no_invented_prices_or_trends(self):
        summary = get_market_intelligence_summary(
            commodity=None,
            state=None,
            district=None,
            market=None,
            start_date=None,
            end_date=None,
            db=self.session,
        )
        trends = get_market_intelligence_trends(
            commodity=None,
            state=None,
            district=None,
            market=None,
            start_date=None,
            end_date=None,
            db=self.session,
        )

        self.assertIsNone(summary["latest_record"])
        self.assertIsNone(summary["average_7_day"])
        self.assertEqual(summary["trend"], "Insufficient data")
        self.assertEqual(trends["points"], [])

    def test_representative_snapshot_price_is_not_mislabeled_as_modal(self):
        record = {
            "state": "Karnataka",
            "district": "Mandya",
            "market": "Mandya APMC",
            "commodity": "Tomato",
            "variety": "Market-day aggregate",
            "arrival_date": date.today().isoformat(),
            "min_price": "1000",
            "max_price": "1400",
            "modal_price": None,
            "representative_price": "1200",
            "source": "MandiLens snapshot / AGMARKNET 2.0",
        }
        self.assertEqual(store_market_records(self.session, [record]), 1)

        response = get_market_intelligence_prices(
            commodity=None,
            state=None,
            district=None,
            market=None,
            start_date=None,
            end_date=None,
            limit=100,
            offset=0,
            db=self.session,
        )

        stored = response["records"][0]
        self.assertIsNone(stored["modal_price"])
        self.assertEqual(stored["representative_price"], 1200.0)
        self.assertEqual(stored["reported_price"], 1200.0)
        self.assertEqual(stored["price_basis"], "Representative market-day price")

    def test_assistant_context_contains_only_matching_reported_market_data(self):
        store_market_records(
            self.session,
            [
                self.record(date.today(), 1500),
                self.record(date.today(), 6000, market="Mysuru APMC", commodity="Onion"),
            ],
        )

        context = market_context_for_assistant(
            self.session,
            "What is the latest tomato price in Mandya?",
        )

        self.assertIsNotNone(context)
        self.assertIn("Mandya APMC", context)
        self.assertIn('"modal_price": 1500.0', context)
        self.assertNotIn("Mysuru APMC", context)
        self.assertNotIn('"modal_price": 6000.0', context)


if __name__ == "__main__":
    unittest.main()
