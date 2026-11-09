import hashlib
import json
import logging
import re
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from market_models import MarketPrice

logger = logging.getLogger(__name__)
MARKET_PRICE_SOURCE = "data.gov.in / AGMARKNET"


def _text(record: dict, field: str, *, required: bool = True) -> str | None:
    value = record.get(field)
    if value is None:
        if required:
            return None
        return ""
    text = str(value).strip()
    return text or (None if required else "")


def _price(record: dict, field: str) -> Decimal | None:
    value = record.get(field)
    if value in (None, ""):
        return None
    try:
        amount = Decimal(re.sub(r"[,\s]", "", str(value)))
    except InvalidOperation:
        return None
    return amount if amount.is_finite() and amount >= 0 else None


def _arrival_date(record: dict) -> date | None:
    value = _text(record, "arrival_date")
    if not value:
        return None
    for date_format in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(value, date_format).date()
        except ValueError:
            continue
    return None


def normalize_market_record(record: dict) -> dict | None:
    commodity = _text(record, "commodity")
    state = _text(record, "state")
    district = _text(record, "district")
    market = _text(record, "market")
    if not all((commodity, state, district, market)):
        return None

    min_price = _price(record, "min_price")
    max_price = _price(record, "max_price")
    modal_price = _price(record, "modal_price")
    representative_price = _price(record, "representative_price")
    if all(
        price is None
        for price in (min_price, max_price, modal_price, representative_price)
    ):
        return None
    if min_price is not None and max_price is not None and min_price > max_price:
        return None
    if (
        representative_price is not None
        and min_price is not None
        and max_price is not None
        and not min_price <= representative_price <= max_price
    ):
        return None

    normalized = {
        "commodity": commodity,
        "state": state,
        "district": district,
        "market": market,
        "variety": _text(record, "variety", required=False) or "",
        "arrival_date": _arrival_date(record),
        "min_price": min_price,
        "max_price": max_price,
        "modal_price": modal_price,
        "representative_price": representative_price,
        "unit": "Rs/quintal",
        "source": _text(record, "source", required=False) or MARKET_PRICE_SOURCE,
    }
    identity = {
        key: value.isoformat() if isinstance(value, date) else str(value or "")
        for key, value in normalized.items()
        if key in {"commodity", "state", "district", "market", "variety", "arrival_date"}
    }
    supplied_record_id = _text(record, "source_record_id")
    normalized["source_record_id"] = (
        supplied_record_id
        if supplied_record_id and re.fullmatch(r"[0-9a-f]{64}", supplied_record_id)
        else hashlib.sha256(
            json.dumps(identity, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
    )
    return normalized


def store_market_records(db: Session, records: list[dict]) -> int:
    now = datetime.now(timezone.utc)
    normalized_records = {}

    try:
        for record in records:
            normalized = normalize_market_record(record)
            if normalized is None:
                logger.warning("Skipping invalid AGMARKNET market record.")
                continue
            normalized_records[normalized["source_record_id"]] = normalized

        record_ids = list(normalized_records)
        existing_records = {}
        for offset in range(0, len(record_ids), 500):
            rows = (
                db.query(MarketPrice)
                .filter(MarketPrice.source_record_id.in_(record_ids[offset : offset + 500]))
                .all()
            )
            existing_records.update(
                (row.source_record_id, row)
                for row in rows
            )

        for record_id, normalized in normalized_records.items():
            existing = existing_records.get(record_id)
            if existing is None:
                db.add(MarketPrice(**normalized, last_seen_at=now))
                continue
            for field, value in normalized.items():
                setattr(existing, field, value)
            existing.last_seen_at = now
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise

    return len(normalized_records)
