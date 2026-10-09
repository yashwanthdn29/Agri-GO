import os
import unittest
from datetime import date, timedelta
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from main import agriculture_soil, configured_soil_health_profile, reported_market_crops
from market_intelligence import store_market_records


class AgricultureDataTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(
            self.engine,
            tables=[Base.metadata.tables["market_prices"]],
        )
        self.session = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    @patch("main.fetch_json")
    def test_soil_profile_converts_source_scales_and_returns_available_depths(self, fetch_json):
        fetch_json.return_value = {
            "properties": {
                "layers": [
                    {
                        "name": "clay",
                        "unit_measure": {"d_factor": 10, "target_units": "%"},
                        "depths": [
                            {"label": "0-5cm", "values": {"mean": 235}},
                            {"label": "5-15cm", "values": {"mean": 310}},
                        ],
                    },
                    {
                        "name": "phh2o",
                        "unit_measure": {"d_factor": 10, "target_units": "-"},
                        "depths": [
                            {"label": "0-5cm", "values": {"mean": 64}},
                        ],
                    },
                    {
                        "name": "soc",
                        "unit_measure": {"d_factor": 10, "target_units": "g/kg"},
                        "depths": [
                            {"label": "0-5cm", "values": {"mean": 78}},
                        ],
                    },
                ]
            }
        }

        result = agriculture_soil(12.522, 76.897)

        self.assertEqual(result["status"], "available")
        surface = result["profile"][0]
        self.assertEqual(surface["depth"], "0-5cm")
        self.assertEqual(surface["properties"]["clay"]["value"], 23.5)
        self.assertEqual(surface["properties"]["clay"]["unit"], "%")
        self.assertEqual(surface["properties"]["phh2o"]["value"], 6.4)
        self.assertEqual(surface["properties"]["soc"]["value"], 7.8)
        self.assertEqual(result["profile"][1]["properties"]["clay"]["value"], 31)
        params = parse_qs(urlparse(fetch_json.call_args.args[0]).query)
        self.assertIn("silt", params["property"])
        self.assertIn("30-60cm", params["depth"])

    @patch("main.fetch_json")
    def test_soilgrids_null_values_are_not_presented_as_a_profile(self, fetch_json):
        fetch_json.return_value = {
            "properties": {
                "layers": [
                    {
                        "name": "clay",
                        "unit_measure": {"d_factor": 10, "target_units": "%"},
                        "depths": [
                            {"label": "0-5cm", "values": {"mean": None}},
                        ],
                    }
                ]
            }
        }

        result = agriculture_soil(12.522, 76.897)

        self.assertEqual(result["status"], "unavailable")
        self.assertIsNone(result["value"])
        self.assertIn("no values", result["detail"])

    @patch.dict(
        os.environ,
        {
            "AGRI_SOIL_RESOURCE_ID": "soil-resource",
            "AGRI_SOIL_PH_FIELD": "soil_ph",
            "AGRI_SOIL_PH_UNIT": "pH",
            "AGRI_SOIL_N_FIELD": "available_n",
            "AGRI_SOIL_N_UNIT": "kg/ha",
            "AGRI_STATS_YEAR_FIELD": "year",
        },
    )
    @patch("main.get_agriculture_dataset")
    def test_configured_soil_health_data_is_returned_with_dataset_units(
        self, get_dataset
    ):
        get_dataset.return_value = [
            {"year": "2022", "soil_ph": "6.2", "available_n": "280"},
            {"year": "2024", "soil_ph": "6.7", "available_n": "315"},
        ]

        result = configured_soil_health_profile("Karnataka", "Mandya")

        get_dataset.assert_called_once_with("soil-resource", "Karnataka", "Mandya")
        self.assertEqual(result["status"], "available")
        self.assertEqual(result["year"], "2024")
        self.assertEqual(result["profile"][0]["properties"]["available_n"]["unit"], "kg/ha")
        self.assertIn("315 kg/ha", result["value"])

    def test_market_crop_reports_are_summarized_for_location_and_recent_window(self):
        today = date.today()
        store_market_records(
            self.session,
            [
                {
                    "commodity": "Tomato",
                    "state": "Karnataka",
                    "district": "Mandya",
                    "market": market,
                    "arrival_date": (today - timedelta(days=offset)).strftime("%d/%m/%Y"),
                    "modal_price": "2500",
                    "source": "MandiLens snapshot / AGMARKNET 2.0",
                }
                for market, offset in (("Mandya APMC", 2), ("Malavalli APMC", 4))
            ]
            + [
                {
                    "commodity": "Coconut",
                    "state": "Karnataka",
                    "district": "Mandya",
                    "market": "Mandya APMC",
                    "arrival_date": (today - timedelta(days=7)).strftime("%d/%m/%Y"),
                    "modal_price": "1800",
                    "source": "MandiLens snapshot / AGMARKNET 2.0",
                },
                {
                    "commodity": "Old crop",
                    "state": "Karnataka",
                    "district": "Mandya",
                    "market": "Mandya APMC",
                    "arrival_date": (today - timedelta(days=100)).strftime("%d/%m/%Y"),
                    "modal_price": "900",
                    "source": "MandiLens snapshot / AGMARKNET 2.0",
                },
                {
                    "commodity": "Other district crop",
                    "state": "Karnataka",
                    "district": "Mysuru",
                    "market": "Mysuru APMC",
                    "arrival_date": today.strftime("%d/%m/%Y"),
                    "modal_price": "1200",
                    "source": "MandiLens snapshot / AGMARKNET 2.0",
                },
            ],
        )

        result = reported_market_crops(self.session, "Karnataka", "Mandya")

        self.assertEqual(result["status"], "available")
        self.assertIn("Mandya", result["detail"])
        self.assertEqual(result["source"], "MandiLens snapshot / AGMARKNET 2.0")
        reports = {report["crop"]: report for report in result["value"]}
        self.assertEqual(set(reports), {"Tomato", "Coconut"})
        self.assertEqual(reports["Tomato"]["market_count"], 2)
        self.assertEqual(reports["Tomato"]["report_count"], 2)
        self.assertEqual(reports["Tomato"]["latest_report_date"], (today - timedelta(days=2)).isoformat())

    def test_market_crop_reports_explain_empty_or_missing_location_data(self):
        no_state = reported_market_crops(self.session, None, None)
        no_records = reported_market_crops(self.session, "Karnataka", "Mandya")

        self.assertEqual(no_state["status"], "unavailable")
        self.assertEqual(no_records["status"], "unavailable")
        self.assertIn("last 90 days", no_records["detail"])


if __name__ == "__main__":
    unittest.main()
