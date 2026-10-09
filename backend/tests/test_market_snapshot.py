import hashlib
import json
import unittest
from datetime import date, datetime, timezone
from unittest.mock import patch

from market_snapshot import (
    SNAPSHOT_LICENSE,
    SNAPSHOT_SOURCE_PROVIDER,
    fetch_verified_market_snapshot,
)


class MarketSnapshotTests(unittest.TestCase):
    def make_manifest_and_partition(self):
        as_of = date.today()
        partition_body = json.dumps(
            {
                "schemaVersion": 2,
                "state": "Karnataka",
                "commodity": "Tomato",
                "markets": [
                    {
                        "market_id": "16-101",
                        "state": "Karnataka",
                        "market": "Test Mandi",
                        "district": "Mandya",
                    }
                ],
                "observations": [
                    {
                        "market_id": "16-101",
                        "date": as_of.isoformat(),
                        "min_price": 900,
                        "representative_price": 1200,
                        "max_price": 1500,
                    }
                ],
            },
            separators=(",", ":"),
        ).encode()
        relative_url = "/data/karnataka/tomato.json"
        manifest = {
            "schemaVersion": 2,
            "source": {
                "provider": SNAPSHOT_SOURCE_PROVIDER,
                "license": SNAPSHOT_LICENSE,
                "apiUrl": "https://api.agmarknet.gov.in/v1",
                "catalogUrl": "https://www.data.gov.in/catalog/current-daily-price-various-commodities-various-markets-mandi",
                "licenseUrl": "https://www.data.gov.in/godl",
                "endorsement": False,
            },
            "meta": {
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "dateRange": [as_of.isoformat(), as_of.isoformat()],
            },
            "partitions": [
                {
                    "url": relative_url,
                    "sha256": hashlib.sha256(partition_body).hexdigest(),
                    "state": "Karnataka",
                    "commodity": "Tomato",
                }
            ],
        }
        return manifest, relative_url, partition_body

    def test_import_checks_provenance_integrity_and_preserves_representative_basis(self):
        manifest, relative_url, partition_body = self.make_manifest_and_partition()

        def get_bytes(url: str) -> bytes:
            if url.endswith("/manifest.json"):
                return json.dumps(manifest).encode()
            if url.endswith(relative_url):
                return partition_body
            raise AssertionError(f"Unexpected snapshot request: {url}")

        with patch("market_snapshot._get_bytes", side_effect=get_bytes):
            records, metadata = fetch_verified_market_snapshot()

        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["representative_price"], "1200.0")
        self.assertIsNone(records[0]["modal_price"])
        self.assertEqual(records[0]["source"], "MandiLens snapshot / AGMARKNET 2.0")
        self.assertEqual(metadata["license"], SNAPSHOT_LICENSE)
        self.assertEqual(metadata["as_of_date"], date.today().isoformat())

    def test_import_rejects_a_partition_that_does_not_match_manifest_hash(self):
        manifest, relative_url, _ = self.make_manifest_and_partition()

        def get_bytes(url: str) -> bytes:
            if url.endswith("/manifest.json"):
                return json.dumps(manifest).encode()
            if url.endswith(relative_url):
                return b'{"unverified":true}'
            raise AssertionError(f"Unexpected snapshot request: {url}")

        with patch("market_snapshot._get_bytes", side_effect=get_bytes):
            with self.assertRaisesRegex(ValueError, "fully integrity-checked"):
                fetch_verified_market_snapshot()


if __name__ == "__main__":
    unittest.main()
