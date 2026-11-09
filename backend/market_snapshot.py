import hashlib
import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

SNAPSHOT_SOURCE = "MandiLens snapshot / AGMARKNET 2.0"
SNAPSHOT_MANIFEST_URL = (
    "https://raw.githubusercontent.com/heybadrinath/MandiLens/main/"
    "apps/web/public/data/manifest.json"
)
SNAPSHOT_DATA_BASE_URL = (
    "https://raw.githubusercontent.com/heybadrinath/MandiLens/main/"
    "apps/web/public"
)
SNAPSHOT_LICENSE = "Government Open Data License - India"
SNAPSHOT_SOURCE_PROVIDER = (
    "Directorate of Marketing and Inspection, Ministry of Agriculture and "
    "Farmers Welfare, Government of India"
)
MAX_SNAPSHOT_AGE_DAYS = 14
HISTORY_DAYS_TO_IMPORT = 90


def _get_bytes(url: str) -> bytes:
    request = Request(
        url,
        headers={
            "User-Agent": "AgriGO/1.0 market-data-sync",
            "Accept": "application/json",
        },
    )
    with urlopen(request, timeout=30) as response:
        return response.read()


def _parse_snapshot_partition(partition: dict, cutoff: date, as_of: date) -> list[dict]:
    relative_url = partition.get("url")
    expected_hash = partition.get("sha256")
    if (
        not isinstance(relative_url, str)
        or not relative_url.startswith("/data/")
        or ".." in relative_url.split("/")
        or not isinstance(expected_hash, str)
    ):
        raise ValueError("The market snapshot manifest contains an invalid partition.")

    body = _get_bytes(SNAPSHOT_DATA_BASE_URL + relative_url)
    if hashlib.sha256(body).hexdigest() != expected_hash:
        raise ValueError(f"Market snapshot integrity check failed for {relative_url}.")

    document = json.loads(body)
    if (
        not isinstance(document, dict)
        or document.get("schemaVersion") != 2
        or document.get("state") != partition.get("state")
        or document.get("commodity") != partition.get("commodity")
        or not isinstance(document.get("markets"), list)
        or not isinstance(document.get("observations"), list)
    ):
        raise ValueError(f"Market snapshot schema validation failed for {relative_url}.")

    markets = {
        str(market.get("market_id")): market
        for market in document["markets"]
        if isinstance(market, dict) and market.get("market_id") is not None
    }
    normalized_records = []
    for observation in document["observations"]:
        if not isinstance(observation, dict):
            continue
        try:
            arrival_date = date.fromisoformat(observation["date"])
            market = markets[str(observation["market_id"])]
        except (KeyError, TypeError, ValueError):
            continue
        if arrival_date < cutoff or arrival_date > as_of:
            continue
        if not all(
            isinstance(market.get(field), str) and market[field].strip()
            for field in ("market", "district")
        ):
            continue

        representative = observation.get("representative_price")
        if representative is None:
            representative = observation.get("modal_price")
        if representative is None:
            continue
        try:
            representative_price = float(representative)
            minimum = float(observation["min_price"])
            maximum = float(observation["max_price"])
        except (KeyError, TypeError, ValueError):
            continue
        if (
            minimum < 0
            or representative_price < minimum
            or maximum < representative_price
            or not all(
                value < float("inf")
                for value in (minimum, representative_price, maximum)
            )
        ):
            continue

        identity = (
            f"mandilens:v2:{market['market_id']}:"
            f"{document['commodity']}:{arrival_date.isoformat()}"
        )
        normalized_records.append(
            {
                "commodity": document["commodity"],
                "state": document["state"],
                "district": market["district"],
                "market": market["market"],
                "variety": "Market-day aggregate",
                "arrival_date": arrival_date.isoformat(),
                "min_price": str(minimum),
                "max_price": str(maximum),
                "modal_price": None,
                "representative_price": str(representative_price),
                "unit": "Rs/quintal",
                "source": SNAPSHOT_SOURCE,
                "source_record_id": hashlib.sha256(identity.encode("utf-8")).hexdigest(),
            }
        )
    return normalized_records


def fetch_verified_market_snapshot() -> tuple[list[dict], dict]:
    try:
        manifest = json.loads(_get_bytes(SNAPSHOT_MANIFEST_URL))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        raise ValueError("The published AGMARKNET snapshot manifest could not be verified.") from error

    if not isinstance(manifest, dict) or manifest.get("schemaVersion") != 2:
        raise ValueError("The published AGMARKNET snapshot has an unsupported manifest.")
    source = manifest.get("source")
    meta = manifest.get("meta")
    partitions = manifest.get("partitions")
    if (
        not isinstance(source, dict)
        or source.get("provider") != SNAPSHOT_SOURCE_PROVIDER
        or source.get("license") != SNAPSHOT_LICENSE
        or source.get("apiUrl") != "https://api.agmarknet.gov.in/v1"
        or source.get("endorsement") is not False
        or not isinstance(meta, dict)
        or not isinstance(partitions, list)
        or not partitions
    ):
        raise ValueError("The published AGMARKNET snapshot failed source and license validation.")

    try:
        generated_at = datetime.fromisoformat(meta["generatedAt"])
        date_range = meta["dateRange"]
        as_of = date.fromisoformat(date_range[1])
    except (KeyError, TypeError, ValueError, IndexError) as error:
        raise ValueError("The published AGMARKNET snapshot has invalid date metadata.") from error
    if generated_at.tzinfo is None:
        raise ValueError("The published AGMARKNET snapshot timestamp has no timezone.")
    age = datetime.now(timezone.utc) - generated_at.astimezone(timezone.utc)
    if age < timedelta(days=-1) or age > timedelta(days=MAX_SNAPSHOT_AGE_DAYS):
        raise ValueError(
            "The published AGMARKNET snapshot is outside the 14-day freshness window."
        )
    if not isinstance(date_range, list) or len(date_range) != 2:
        raise ValueError("The published AGMARKNET snapshot has an invalid date range.")

    cutoff = as_of - timedelta(days=HISTORY_DAYS_TO_IMPORT - 1)
    records = []
    errors = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [
            executor.submit(_parse_snapshot_partition, partition, cutoff, as_of)
            for partition in partitions
            if isinstance(partition, dict)
        ]
        for future in as_completed(futures):
            try:
                records.extend(future.result())
            except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, ValueError) as error:
                errors.append(error)
    if errors:
        logger.error(
            "Verified market snapshot import failed for %s of %s partitions.",
            len(errors),
            len(futures),
        )
        raise ValueError(
            "The published AGMARKNET snapshot could not be fully integrity-checked."
        ) from errors[0]
    if not records:
        raise ValueError(
            "The verified AGMARKNET snapshot contains no valid observations in its recent history."
        )

    details = {
        "source": SNAPSHOT_SOURCE,
        "provider": SNAPSHOT_SOURCE_PROVIDER,
        "license": SNAPSHOT_LICENSE,
        "license_url": source["licenseUrl"],
        "catalog_url": source["catalogUrl"],
        "api_url": source["apiUrl"],
        "generated_at": generated_at.astimezone(timezone.utc).isoformat(),
        "as_of_date": as_of.isoformat(),
        "history_start_date": cutoff.isoformat(),
        "record_count": len(records),
        "snapshot_url": SNAPSHOT_MANIFEST_URL,
        "endorsement": False,
    }
    return records, details
