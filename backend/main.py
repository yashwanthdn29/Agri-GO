import json
import os
import asyncio
import logging
import re
from datetime import date, datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import aliased
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from auth import ALGORITHM, SECRET_KEY, create_access_token
from crop_models import Crop
from crop_schemas import CropCreate
from database import SessionLocal, get_db
from dependencies import get_current_user
from farmer_models import FarmerProfile
from farmer_schemas import FarmerProfileCreate
from models import User
from order_models import Order
from order_schemas import OrderCreate
from market_intelligence import MARKET_PRICE_SOURCE, store_market_records
from market_forecasting import forecast_market_prices
from market_models import MarketPrice
from market_snapshot import SNAPSHOT_SOURCE, fetch_verified_market_snapshot
from product_models import Product
from product_schemas import ProductCreate
from realtime import realtime_connections
from schemas import UserCreate, UserLogin
from security import hash_password, verify_password

logger = logging.getLogger(__name__)
app = FastAPI(title="AgriGO API")
app.state.market_price_sync_error = None
app.state.market_price_sync_detail = None
app.state.market_price_snapshot = None
app.state.market_price_sync_lock = asyncio.Lock()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AssistantMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class AssistantRequest(BaseModel):
    messages: list[AssistantMessage] = Field(min_length=1, max_length=20)


def gemini_configuration() -> dict[str, str | bool]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    configured = bool(api_key) and api_key.casefold() not in {
        "add-your-gemini-api-key",
        "your-gemini-api-key",
        "replace-me",
        "changeme",
    }
    return {
        "configured": configured,
        "model": os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip()
        or "gemini-3.8-flash",
    }


def market_context_for_assistant(db: Session, conversation: str) -> str | None:
    normalized_question = conversation.casefold()

    def mentioned_values(column) -> list[str]:
        values = [row[0] for row in db.query(column).distinct().all() if row[0]]
        return [
            value
            for value in values
            if re.search(
                rf"(?<!\w){re.escape(value.casefold())}(?!\w)",
                normalized_question,
            )
        ]

    commodities = mentioned_values(MarketPrice.commodity)
    locations = (
        (MarketPrice.state, mentioned_values(MarketPrice.state)),
        (MarketPrice.district, mentioned_values(MarketPrice.district)),
        (MarketPrice.market, mentioned_values(MarketPrice.market)),
    )
    market_intent = bool(
        commodities
        or re.search(r"\b(price|prices|mandi|market|rate|rates)\b", normalized_question)
    )
    if not market_intent:
        return None

    query = db.query(MarketPrice)
    if commodities:
        query = query.filter(MarketPrice.commodity.in_(commodities))
    for column, values in locations:
        if values:
            query = query.filter(column.in_(values))
    records = (
        query.order_by(MarketPrice.arrival_date.desc().nullslast())
        .limit(10)
        .all()
    )
    facts = [
        {
            "commodity": record.commodity,
            "market": record.market,
            "district": record.district,
            "state": record.state,
            "arrival_date": record.arrival_date.isoformat() if record.arrival_date else None,
            "min_price": float(record.min_price) if record.min_price is not None else None,
            "max_price": float(record.max_price) if record.max_price is not None else None,
            "modal_price": float(record.modal_price) if record.modal_price is not None else None,
            "reported_price": (
                float(record.modal_price)
                if record.modal_price is not None
                else float(record.representative_price)
                if record.representative_price is not None
                else None
            ),
            "price_basis": (
                "Official modal price"
                if record.modal_price is not None
                else "Representative market-day price"
                if record.representative_price is not None
                else "Price not reported"
            ),
            "unit": record.unit,
            "source": record.source,
        }
        for record in records
    ]
    if not facts:
        return (
            "Verified market-data lookup: no matching stored AGMARKNET observations "
            "are currently available for the question. Do not provide a price estimate."
        )
    return (
        "Verified market-data observations from AgriGO's PostgreSQL database. "
        "For market-price answers, use only these values; state the market, arrival "
        "date, price basis, unit, and source. Distinguish official modal prices from "
        "representative market-day snapshots. If the requested location is not covered, say so. "
        "These periodic reports are not real-time quotes:\n"
        + json.dumps(facts, ensure_ascii=False)
    )


def sync_market_prices_once() -> tuple[int, str, dict | None]:
    limit = int(os.getenv("MARKET_PRICE_SYNC_LIMIT", "500"))
    if not 1 <= limit <= 10000:
        raise ValueError("MARKET_PRICE_SYNC_LIMIT must be between 1 and 10000.")

    db = SessionLocal()
    try:
        try:
            data = fetch_agmarknet_data(None, None, limit=limit)
            records = data.get("records")
            if not isinstance(records, list):
                raise ValueError("AGMARKNET returned an invalid records collection.")
            stored = store_market_records(db, records)
            if stored:
                return stored, MARKET_PRICE_SOURCE, None
            logger.warning(
                "The live AGMARKNET API returned no valid observations; checking the verified snapshot."
            )
        except HTTPException as error:
            logger.warning(
                "The live AGMARKNET API is not serving this sync (%s); checking the verified snapshot.",
                error.detail,
            )

        recently_imported = (
            db.query(func.max(MarketPrice.last_seen_at))
            .filter(MarketPrice.source == SNAPSHOT_SOURCE)
            .scalar()
        )
        if recently_imported and (
            datetime.now(timezone.utc)
            - (
                recently_imported.replace(tzinfo=timezone.utc)
                if recently_imported.tzinfo is None
                else recently_imported
            )
        ) < timedelta(hours=12):
            report_date = (
                db.query(func.max(MarketPrice.arrival_date))
                .filter(MarketPrice.source == SNAPSHOT_SOURCE)
                .scalar()
            )
            return (
                db.query(MarketPrice)
                .filter(MarketPrice.source == SNAPSHOT_SOURCE)
                .count(),
                f"Verified AGMARKNET snapshot already stored through {report_date}.",
                app.state.market_price_snapshot,
            )

        snapshot_records, snapshot_metadata = fetch_verified_market_snapshot()
        stored = store_market_records(db, snapshot_records)
        snapshot_metadata["imported_records"] = stored
        detail = (
            f"Showing the verified AGMARKNET snapshot published "
            f"{snapshot_metadata['generated_at'][:10]}, with market reports "
            f"through {snapshot_metadata['as_of_date']}. Snapshot representative "
            "prices are identified separately from official modal prices."
        )
        return stored, detail, snapshot_metadata
    finally:
        db.close()


async def market_price_sync_worker() -> None:
    interval = int(os.getenv("MARKET_PRICE_REFRESH_INTERVAL_SECONDS", "21600"))
    if interval < 60:
        raise ValueError("MARKET_PRICE_REFRESH_INTERVAL_SECONDS must be at least 60.")

    while True:
        try:
            async with app.state.market_price_sync_lock:
                stored, detail, snapshot = await asyncio.to_thread(
                    sync_market_prices_once
                )
            app.state.market_price_sync_error = None
            app.state.market_price_sync_detail = detail
            if snapshot is not None:
                app.state.market_price_snapshot = snapshot
            logger.info("Stored %s market-price observations from %s.", stored, detail)
        except HTTPException as error:
            app.state.market_price_sync_error = error.detail
            app.state.market_price_sync_detail = None
            logger.error("AGMARKNET synchronization failed: %s", error)
        except SQLAlchemyError:
            app.state.market_price_sync_error = (
                "Market reports were retrieved, but could not be saved to the database."
            )
            logger.exception("AGMARKNET records could not be stored.")
        except ValueError as error:
            app.state.market_price_sync_error = str(error)
            app.state.market_price_sync_detail = None
            logger.error("AGMARKNET synchronization configuration is invalid: %s", error)
        except URLError:
            app.state.market_price_sync_error = (
                "Neither the live AGMARKNET API nor its verified published snapshot produced usable reports."
            )
            app.state.market_price_sync_detail = None
            logger.exception("AGMARKNET synchronization could not reach its provider.")

        await asyncio.sleep(interval)


@app.on_event("startup")
async def start_market_price_sync() -> None:
    app.state.market_price_sync_task = asyncio.create_task(market_price_sync_worker())


@app.on_event("shutdown")
async def stop_market_price_sync() -> None:
    task = getattr(app.state, "market_price_sync_task", None)
    if task is not None:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


def summarize_user(user: User) -> dict:
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}


def summarize_product(product: Product, db: Session) -> dict:
    farmer = db.query(User).filter(User.id == product.farmer_id).first()
    return {
        "id": product.id,
        "farmer_id": product.farmer_id,
        "farmer_name": farmer.name if farmer else "AgriGO Farmer",
        "product_name": product.product_name,
        "category": product.category,
        "quantity": product.quantity,
        "unit": product.unit,
        "price_per_unit": product.price_per_unit,
        "location": product.location,
        "status": product.status,
    }


def summarize_order(order: Order, db: Session) -> dict:
    product = db.query(Product).filter(Product.id == order.product_id).first()
    buyer = db.query(User).filter(User.id == order.buyer_id).first()
    farmer = (
        db.query(User).filter(User.id == product.farmer_id).first()
        if product
        else None
    )
    return {
        "id": order.id,
        "product_id": order.product_id,
        "product_name": product.product_name if product else "Product removed",
        "buyer_id": order.buyer_id,
        "buyer_name": buyer.name if buyer else "AgriGO Buyer",
        "farmer_id": farmer.id if farmer else None,
        "farmer_name": farmer.name if farmer else "AgriGO Farmer",
        "quantity": order.quantity,
        "total_price": order.total_price,
        "status": order.status,
        "created_at": order.created_at.isoformat() if order.created_at else None,
    }


def fetch_json(url: str) -> dict:
    request = Request(url, headers={"User-Agent": "AgriGO/1.0"})
    try:
        with urlopen(request, timeout=12) as response:
            return json.loads(response.read())
    except HTTPError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Agricultural data provider returned HTTP {error.code}.",
        ) from error
    except URLError as error:
        raise HTTPException(
            status_code=502,
            detail="Unable to reach the agricultural data provider from this server.",
        ) from error
    except (TimeoutError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=502,
            detail="The agricultural data provider timed out or returned invalid data.",
        ) from error


def weather_description(code: int) -> str:
    descriptions = {
        0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast",
        45: "fog", 48: "depositing rime fog", 51: "light drizzle",
        53: "moderate drizzle", 55: "dense drizzle", 56: "light freezing drizzle",
        57: "dense freezing drizzle", 61: "slight rain", 63: "moderate rain",
        65: "heavy rain", 66: "light freezing rain", 67: "heavy freezing rain",
        71: "slight snow", 73: "moderate snow", 75: "heavy snow", 77: "snow grains",
        80: "slight rain showers", 81: "moderate rain showers", 82: "violent rain showers",
        85: "slight snow showers", 86: "heavy snow showers", 95: "thunderstorm",
        96: "thunderstorm with slight hail", 99: "thunderstorm with heavy hail",
    }
    return descriptions.get(code, "conditions unavailable")


def weather_icon(code: int, is_day: bool) -> str:
    if code == 0:
        icon = "01"
    elif code == 1:
        icon = "02"
    elif code in {2, 3}:
        icon = "04"
    elif code in {45, 48}:
        icon = "50"
    elif code in {51, 53, 55, 56, 57, 80, 81, 82}:
        icon = "09"
    elif code in {61, 63, 65, 66, 67}:
        icon = "10"
    elif code in {71, 73, 75, 77, 85, 86}:
        icon = "13"
    else:
        icon = "11"
    return f"{icon}{'d' if is_day else 'n'}"


def local_time_to_timestamp(value: str, timezone_offset: int) -> int:
    local_time = datetime.fromisoformat(value).replace(tzinfo=timezone.utc)
    return int(local_time.timestamp() - timezone_offset)


@app.get("/")
def home():
    return {"message": "Welcome to AgriGO API"}


@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "AgriGO Backend"}


@app.get("/api/assistant/status")
def get_assistant_status():
    configuration = gemini_configuration()
    return {
        "provider": "Gemini",
        "configured": configuration["configured"],
        "model": configuration["model"],
    }


@app.post("/api/assistant")
def ask_assistant(
    request: AssistantRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if request.messages[-1].role != "user":
        raise HTTPException(status_code=422, detail="The latest message must be from the user.")
    if sum(len(message.content) for message in request.messages) > 16000:
        raise HTTPException(status_code=422, detail="Conversation is too long. Start a new chat.")

    configuration = gemini_configuration()
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not configuration["configured"]:
        raise HTTPException(
            status_code=503,
            detail="Configure GEMINI_API_KEY in backend/.env to enable the assistant.",
        )
    model = str(configuration["model"])
    instructions = (
        "You are AgriGO, a helpful conversational agriculture assistant. "
        "Use the conversation history to understand follow-up questions. Give "
        "clear, practical, appropriately detailed guidance, and ask a concise "
        "clarifying question when key details such as crop, location, season, "
        "or soil are missing. Adapt explanations for farmers and agricultural "
        "buyers. State uncertainty; do not claim to diagnose crop disease or "
        "replace local agricultural experts. Never invent current market prices, "
        "weather, scheme eligibility, or official rules. For market questions, "
        "use only verified market-data context appended below; if it says there "
        "are no matching observations, say so rather than estimating. For weather "
        "or schemes, direct users to AgriGO's sourced data pages or official "
        "sources. For pesticide or other "
        "chemical use, emphasize the locally approved product label, protective "
        "equipment, and local expert guidance. Prioritize safe, sustainable, "
        "location-appropriate advice."
    )
    conversation_text = "\n".join(
        message.content for message in request.messages[-5:]
    )
    market_context = market_context_for_assistant(db, conversation_text)
    if market_context:
        instructions += "\n\n" + market_context
    contents = [
        {
            "role": "model" if message.role == "assistant" else "user",
            "parts": [{"text": message.content.strip()}],
        }
        for message in request.messages
    ]
    payload = json.dumps(
        {
            "system_instruction": {"parts": [{"text": instructions}]},
            "contents": contents,
            "generationConfig": {"maxOutputTokens": 1000},
        }
    ).encode("utf-8")
    provider_request = Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
            "User-Agent": "AgriGO/1.0",
        },
        method="POST",
    )
    try:
        with urlopen(provider_request, timeout=30) as provider_response:
            response_data = json.loads(provider_response.read())
    except HTTPError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini assistant request failed (HTTP {error.code}). Check the API key, model, and quota.",
        ) from error
    except URLError as error:
        raise HTTPException(
            status_code=502,
            detail="Unable to reach the Gemini assistant provider from this server.",
        ) from error
    except (TimeoutError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=502,
            detail="Gemini timed out or returned an invalid response.",
        ) from error

    if not isinstance(response_data, dict):
        raise HTTPException(
            status_code=502,
            detail="Gemini returned an invalid response. Please try again.",
        )
    candidates = response_data.get("candidates", [])
    candidate = (
        candidates[0]
        if isinstance(candidates, list)
        and candidates
        and isinstance(candidates[0], dict)
        else {}
    )
    content = candidate.get("content")
    parts = content.get("parts", []) if isinstance(content, dict) else []
    answer = (
        "\n".join(
            part["text"]
            for part in parts
            if isinstance(part, dict) and isinstance(part.get("text"), str)
        ).strip()
        if isinstance(parts, list)
        else ""
    )
    if not answer:
        raise HTTPException(
            status_code=502,
            detail="Gemini did not return a text response. Please try again.",
        )
    return {"answer": answer, "model": model}


@app.get("/api/weather")
def get_weather(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
):
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "timezone": "auto",
        "forecast_days": 5,
        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,rain,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m",
        "hourly": "temperature_2m,apparent_temperature,precipitation_probability,rain,weather_code,is_day,visibility",
        "daily": "temperature_2m_max,temperature_2m_min,sunrise,sunset",
    }
    weather = fetch_json("https://api.open-meteo.com/v1/forecast?" + urlencode(params))
    air_quality = fetch_json(
        "https://air-quality-api.open-meteo.com/v1/air-quality?"
        + urlencode(
            {
                "latitude": latitude,
                "longitude": longitude,
                "timezone": "auto",
                "current": "us_aqi,pm10,pm2_5,ozone,nitrogen_dioxide",
            }
        )
    )
    current = weather.get("current") or {}
    hourly = weather.get("hourly") or {}
    daily = weather.get("daily") or {}
    pollution = air_quality.get("current") or {}
    timezone_offset = weather.get("utc_offset_seconds", 0)
    current_time = current.get("time") or datetime.now(timezone.utc).isoformat()
    hourly_times = hourly.get("time") or []
    current_index = hourly_times.index(current_time) if current_time in hourly_times else 0
    forecast_entries = []
    for index, local_time in enumerate(hourly_times):
        code = (hourly.get("weather_code") or [])[index]
        is_day = bool((hourly.get("is_day") or [])[index])
        forecast_entries.append(
            {
                "timestamp": local_time_to_timestamp(local_time, timezone_offset),
                "local_time": local_time,
                "temperature_c": (hourly.get("temperature_2m") or [])[index],
                "feels_like_c": (hourly.get("apparent_temperature") or [])[index],
                "condition": weather_description(code),
                "icon": weather_icon(code, is_day),
                "precipitation_probability": (hourly.get("precipitation_probability") or [])[index] or 0,
                "rain_mm": (hourly.get("rain") or [])[index] or 0,
            }
        )

    daily_sunrise = daily.get("sunrise") or [None]
    daily_sunset = daily.get("sunset") or [None]
    return {
        "source": "Open-Meteo",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "location": {
            "name": f"{latitude:.3f}, {longitude:.3f}",
            "state": None,
            "country": None,
            "latitude": weather.get("latitude", latitude),
            "longitude": weather.get("longitude", longitude),
            "timezone_offset_seconds": timezone_offset,
        },
        "current": {
            "observed_at": local_time_to_timestamp(current_time, timezone_offset),
            "temperature_c": current.get("temperature_2m"),
            "feels_like_c": current.get("apparent_temperature"),
            "minimum_c": (daily.get("temperature_2m_min") or [None])[0],
            "maximum_c": (daily.get("temperature_2m_max") or [None])[0],
            "humidity_percent": current.get("relative_humidity_2m"),
            "pressure_hpa": current.get("pressure_msl"),
            "condition": weather_description(current.get("weather_code", -1)),
            "description": weather_description(current.get("weather_code", -1)),
            "icon": weather_icon(current.get("weather_code", -1), bool(current.get("is_day", 1))),
            "wind_speed_mps": (current.get("wind_speed_10m") or 0) / 3.6,
            "wind_direction_degrees": current.get("wind_direction_10m"),
            "cloud_cover_percent": current.get("cloud_cover"),
            "visibility_m": (hourly.get("visibility") or [0])[current_index],
            "rain_1h_mm": current.get("rain") or 0,
            "sunrise": local_time_to_timestamp(daily_sunrise[0], timezone_offset) if daily_sunrise[0] else None,
            "sunset": local_time_to_timestamp(daily_sunset[0], timezone_offset) if daily_sunset[0] else None,
        },
        "air_quality": {
            "observed_at": local_time_to_timestamp(pollution.get("time", current_time), timezone_offset),
            "index": pollution.get("us_aqi"),
            "components_ug_m3": {
                "pm2_5": pollution.get("pm2_5"),
                "pm10": pollution.get("pm10"),
                "o3": pollution.get("ozone"),
                "no2": pollution.get("nitrogen_dioxide"),
            },
        },
        "forecast": forecast_entries,
    }


@app.get("/api/weather/search")
def search_weather_location(
    query: str = Query(min_length=2, max_length=100),
):
    data = fetch_json(
        "https://geocoding-api.open-meteo.com/v1/search?"
        + urlencode({"name": query.strip(), "count": 5, "language": "en", "format": "json"})
    )
    return {
        "locations": [
            {
                "name": location.get("name"),
                "state": location.get("admin1"),
                "district": location.get("admin2"),
                "country": location.get("country"),
                "latitude": location.get("latitude"),
                "longitude": location.get("longitude"),
            }
            for location in data.get("results", [])
        ]
    }


@app.get("/api/market-prices")
def get_market_prices(
    commodity: str | None = Query(default=None, max_length=80),
    state: str | None = Query(default=None, max_length=80),
    district: str | None = Query(default=None, max_length=80),
    limit: int = Query(default=100, ge=1, le=500),
):
    data = fetch_agmarknet_data(state, district, commodity, limit)
    return {
        "source": "data.gov.in / AGMARKNET",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "records": data.get("records", []),
        "total": data.get("total", 0),
    }


def fetch_agmarknet_data(
    state: str | None,
    district: str | None,
    commodity: str | None = None,
    limit: int = 100,
) -> dict:
    api_key = os.getenv("DATA_GOV_IN_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Configure DATA_GOV_IN_API_KEY in backend/.env to enable live mandi prices.",
        )
    params = {"api-key": api_key, "format": "json", "limit": limit}
    if commodity:
        params["filters[commodity]"] = commodity
    if state:
        params["filters[state]"] = state
    if district:
        params["filters[district]"] = district
    resource_id = os.getenv(
        "MARKET_PRICE_RESOURCE_ID",
        "9ef84268-d588-465a-a308-a864a43d0070",
    )
    endpoint = f"https://api.data.gov.in/resource/{resource_id}?{urlencode(params)}"
    return fetch_json(endpoint)


def filtered_market_prices(
    db: Session,
    commodity: str | None = None,
    state: str | None = None,
    district: str | None = None,
    market: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
):
    query = db.query(MarketPrice)
    for field, value in (
        (MarketPrice.commodity, commodity),
        (MarketPrice.state, state),
        (MarketPrice.district, district),
        (MarketPrice.market, market),
    ):
        if value:
            query = query.filter(field.ilike(value.strip()))
    if start_date:
        query = query.filter(MarketPrice.arrival_date >= start_date)
    if end_date:
        query = query.filter(MarketPrice.arrival_date <= end_date)
    actual_report = aliased(MarketPrice)
    has_actual_report = (
        db.query(actual_report.id)
        .filter(
            actual_report.source != SNAPSHOT_SOURCE,
            actual_report.modal_price.isnot(None),
            actual_report.commodity == MarketPrice.commodity,
            actual_report.state == MarketPrice.state,
            actual_report.district == MarketPrice.district,
            actual_report.market == MarketPrice.market,
            actual_report.arrival_date == MarketPrice.arrival_date,
        )
        .exists()
    )
    query = query.filter(
        or_(MarketPrice.source != SNAPSHOT_SOURCE, ~has_actual_report)
    )
    return query


def market_source_label(db: Session, query) -> str:
    sources = [
        row[0]
        for row in query.with_entities(MarketPrice.source)
        .distinct()
        .order_by(MarketPrice.source.asc())
        .all()
    ]
    return " · ".join(sources) if sources else MARKET_PRICE_SOURCE


def market_price_payload(record: MarketPrice) -> dict:
    return {
        "id": record.id,
        "commodity": record.commodity,
        "state": record.state,
        "district": record.district,
        "market": record.market,
        "variety": record.variety,
        "arrival_date": record.arrival_date.isoformat() if record.arrival_date else None,
        "min_price": float(record.min_price) if record.min_price is not None else None,
        "max_price": float(record.max_price) if record.max_price is not None else None,
        "modal_price": float(record.modal_price) if record.modal_price is not None else None,
        "representative_price": (
            float(record.representative_price)
            if record.representative_price is not None
            else None
        ),
        "reported_price": (
            float(record.modal_price)
            if record.modal_price is not None
            else float(record.representative_price)
            if record.representative_price is not None
            else None
        ),
        "price_basis": (
            "Official modal price"
            if record.modal_price is not None
            else "Representative market-day price"
            if record.representative_price is not None
            else "Price not reported"
        ),
        "unit": record.unit,
        "source": record.source,
        "last_seen_at": record.last_seen_at.isoformat(),
    }


def validate_market_date_range(
    start_date: date | None,
    end_date: date | None,
) -> None:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=422,
            detail="start_date must be on or before end_date.",
        )


@app.get("/api/market-intelligence/prices")
def get_market_intelligence_prices(
    commodity: str | None = Query(default=None, max_length=120),
    state: str | None = Query(default=None, max_length=120),
    district: str | None = Query(default=None, max_length=120),
    market: str | None = Query(default=None, max_length=160),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    validate_market_date_range(start_date, end_date)
    query = filtered_market_prices(
        db, commodity, state, district, market, start_date, end_date
    )
    total = query.count()
    records = (
        query.order_by(
            MarketPrice.arrival_date.desc().nullslast(),
            MarketPrice.commodity.asc(),
            MarketPrice.market.asc(),
        )
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "source": market_source_label(db, query),
        "total": total,
        "limit": limit,
        "offset": offset,
        "records": [market_price_payload(record) for record in records],
    }


@app.get("/api/market-intelligence/commodities")
def get_market_intelligence_commodities(
    state: str | None = Query(default=None, max_length=120),
    district: str | None = Query(default=None, max_length=120),
    db: Session = Depends(get_db),
):
    query = db.query(MarketPrice.commodity).distinct()
    if state:
        query = query.filter(MarketPrice.state.ilike(state.strip()))
    if district:
        query = query.filter(MarketPrice.district.ilike(district.strip()))
    return {
        "commodities": [
            row[0]
            for row in query.order_by(MarketPrice.commodity.asc()).all()
        ]
    }


@app.get("/api/market-intelligence/states")
def get_market_intelligence_states(db: Session = Depends(get_db)):
    return {
        "states": [
            row[0]
            for row in db.query(MarketPrice.state)
            .distinct()
            .order_by(MarketPrice.state.asc())
            .all()
        ]
    }


@app.get("/api/market-intelligence/districts")
def get_market_intelligence_districts(
    state: str | None = Query(default=None, max_length=120),
    db: Session = Depends(get_db),
):
    query = db.query(MarketPrice.district).distinct()
    if state:
        query = query.filter(MarketPrice.state.ilike(state.strip()))
    return {
        "districts": [
            row[0]
            for row in query.order_by(MarketPrice.district.asc()).all()
        ]
    }


@app.get("/api/market-intelligence/markets")
def get_market_intelligence_markets(
    commodity: str | None = Query(default=None, max_length=120),
    state: str | None = Query(default=None, max_length=120),
    district: str | None = Query(default=None, max_length=120),
    db: Session = Depends(get_db),
):
    query = db.query(MarketPrice.market).distinct()
    for field, value in (
        (MarketPrice.commodity, commodity),
        (MarketPrice.state, state),
        (MarketPrice.district, district),
    ):
        if value:
            query = query.filter(field.ilike(value.strip()))
    return {
        "markets": [row[0] for row in query.order_by(MarketPrice.market.asc()).all()]
    }


@app.get("/api/market-intelligence/trends")
def get_market_intelligence_trends(
    commodity: str | None = Query(default=None, max_length=120),
    state: str | None = Query(default=None, max_length=120),
    district: str | None = Query(default=None, max_length=120),
    market: str | None = Query(default=None, max_length=160),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    validate_market_date_range(start_date, end_date)
    query = filtered_market_prices(
        db, commodity, state, district, market, start_date, end_date
    )
    rows = (
        query.with_entities(
            MarketPrice.arrival_date,
            func.avg(
                func.coalesce(
                    MarketPrice.modal_price, MarketPrice.representative_price
                )
            ),
            func.count(MarketPrice.id),
        )
        .filter(
            MarketPrice.arrival_date.isnot(None),
            or_(
                MarketPrice.modal_price.isnot(None),
                MarketPrice.representative_price.isnot(None),
            ),
        )
        .group_by(MarketPrice.arrival_date)
        .order_by(MarketPrice.arrival_date.asc())
        .all()
    )
    return {
        "source": market_source_label(db, query),
        "points": [
            {
                "date": row[0].isoformat(),
                "average_reported_price": float(row[1]),
                "record_count": row[2],
            }
            for row in rows
        ],
    }


@app.get("/api/market-intelligence/forecast")
def get_market_intelligence_forecast(
    commodity: str = Query(min_length=1, max_length=120),
    state: str | None = Query(default=None, max_length=120),
    district: str | None = Query(default=None, max_length=120),
    market: str | None = Query(default=None, max_length=160),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    horizon_days: int = Query(default=7, ge=1, le=30),
    db: Session = Depends(get_db),
):
    validate_market_date_range(start_date, end_date)
    query = filtered_market_prices(
        db,
        commodity=commodity,
        state=state,
        district=district,
        market=market,
        start_date=start_date,
        end_date=end_date,
    )
    rows = (
        query.with_entities(MarketPrice.arrival_date, func.avg(MarketPrice.modal_price))
        .filter(
            MarketPrice.arrival_date.isnot(None),
            MarketPrice.modal_price.isnot(None),
        )
        .group_by(MarketPrice.arrival_date)
        .order_by(MarketPrice.arrival_date.asc())
        .all()
    )
    try:
        result = forecast_market_prices(
            [(row[0], float(row[1])) for row in rows],
            horizon_days=horizon_days,
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    result["selection"] = {
        "commodity": commodity,
        "state": state,
        "district": district,
        "market": market,
    }
    return result


@app.get("/api/market-intelligence/summary")
def get_market_intelligence_summary(
    commodity: str | None = Query(default=None, max_length=120),
    state: str | None = Query(default=None, max_length=120),
    district: str | None = Query(default=None, max_length=120),
    market: str | None = Query(default=None, max_length=160),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    validate_market_date_range(start_date, end_date)
    query = filtered_market_prices(
        db, commodity, state, district, market, start_date, end_date
    )
    latest_date = query.with_entities(func.max(MarketPrice.arrival_date)).scalar()
    overall = query.with_entities(
        func.min(MarketPrice.min_price),
        func.max(MarketPrice.max_price),
        func.avg(
            func.coalesce(MarketPrice.modal_price, MarketPrice.representative_price)
        ),
    ).one()
    latest = (
        query.filter(MarketPrice.arrival_date == latest_date)
        .order_by(MarketPrice.last_seen_at.desc())
        .first()
        if latest_date
        else None
    )

    def average_between(first_day: date, last_day: date) -> float | None:
        value = (
            query.filter(
                MarketPrice.arrival_date >= first_day,
                MarketPrice.arrival_date <= last_day,
                or_(
                    MarketPrice.modal_price.isnot(None),
                    MarketPrice.representative_price.isnot(None),
                ),
            )
            .with_entities(
                func.avg(
                    func.coalesce(
                        MarketPrice.modal_price, MarketPrice.representative_price
                    )
                )
            )
            .scalar()
        )
        return float(value) if value is not None else None

    reference_date = latest_date or datetime.now(timezone.utc).date()
    last_seven_start = reference_date - timedelta(days=6)
    previous_seven_start = reference_date - timedelta(days=13)
    average_7_day = average_between(last_seven_start, reference_date)
    previous_7_day = average_between(previous_seven_start, reference_date - timedelta(days=7))
    average_30_day = average_between(reference_date - timedelta(days=29), reference_date)
    change = None
    change_percent = None
    trend = "Insufficient data"
    if average_7_day is not None and previous_7_day not in (None, 0):
        change = average_7_day - previous_7_day
        change_percent = change / previous_7_day * 100
        trend = (
            "Increasing"
            if change_percent > 1
            else "Decreasing"
            if change_percent < -1
            else "Stable"
        )

    market_averages = (
        query.filter(
            MarketPrice.arrival_date >= last_seven_start,
            MarketPrice.arrival_date <= reference_date,
            or_(
                MarketPrice.modal_price.isnot(None),
                MarketPrice.representative_price.isnot(None),
            ),
        )
        .with_entities(
            MarketPrice.market,
            func.avg(
                func.coalesce(
                    MarketPrice.modal_price, MarketPrice.representative_price
                )
            ).label("average_reported_price"),
        )
        .group_by(MarketPrice.market)
        .order_by(
            func.avg(
                func.coalesce(
                    MarketPrice.modal_price, MarketPrice.representative_price
                )
            ).desc()
        )
        .all()
    )
    highest = market_averages[0] if market_averages else None
    lowest = market_averages[-1] if market_averages else None
    market_difference = (
        float(highest.average_reported_price - lowest.average_reported_price)
        if highest and lowest
        else None
    )

    return {
        "source": market_source_label(db, query),
        "reference_date": latest_date.isoformat() if latest_date else None,
        "latest_record": market_price_payload(latest) if latest else None,
        "minimum_price": float(overall[0]) if overall[0] is not None else None,
        "maximum_price": float(overall[1]) if overall[1] is not None else None,
        "average_reported_price": float(overall[2]) if overall[2] is not None else None,
        "average_7_day": average_7_day,
        "average_30_day": average_30_day,
        "price_change_7_day": change,
        "price_change_percent_7_day": change_percent,
        "trend": trend,
        "highest_price_market": (
            {"market": highest.market, "average_reported_price": float(highest.average_reported_price)}
            if highest
            else None
        ),
        "lowest_price_market": (
            {"market": lowest.market, "average_reported_price": float(lowest.average_reported_price)}
            if lowest
            else None
        ),
        "market_price_difference": market_difference,
        "market_average_period": (
            f"{last_seven_start.isoformat()} to {reference_date.isoformat()}"
            if market_averages
            else None
        ),
    }


@app.get("/api/market-intelligence/last-updated")
def get_market_intelligence_last_updated(db: Session = Depends(get_db)):
    last_updated = db.query(func.max(MarketPrice.last_seen_at)).scalar()
    latest_report_date = db.query(func.max(MarketPrice.arrival_date)).scalar()
    latest_source = (
        db.query(MarketPrice.source)
        .order_by(MarketPrice.last_seen_at.desc())
        .first()
    )
    sync_error = getattr(app.state, "market_price_sync_error", None)
    sync_detail = getattr(app.state, "market_price_sync_detail", None)
    return {
        "source": latest_source[0] if latest_source else MARKET_PRICE_SOURCE,
        "last_updated": last_updated.isoformat() if last_updated else None,
        "latest_report_date": latest_report_date.isoformat() if latest_report_date else None,
        "label": "Latest available market data",
        "status": "stale" if last_updated and sync_error else "unavailable" if sync_error else "available" if last_updated else "waiting",
        "detail": sync_error or sync_detail,
    }


@app.post("/api/market-intelligence/refresh")
async def refresh_market_intelligence():
    async with app.state.market_price_sync_lock:
        try:
            stored, detail, snapshot = await asyncio.to_thread(sync_market_prices_once)
        except HTTPException as error:
            app.state.market_price_sync_error = error.detail
            app.state.market_price_sync_detail = None
            raise
        except SQLAlchemyError as error:
            app.state.market_price_sync_error = (
                "Market reports were retrieved, but could not be saved to the database."
            )
            app.state.market_price_sync_detail = None
            logger.exception("Manual market-price refresh could not save reports.")
            raise HTTPException(status_code=503, detail=app.state.market_price_sync_error) from error
        except ValueError as error:
            app.state.market_price_sync_error = str(error)
            app.state.market_price_sync_detail = None
            raise HTTPException(status_code=503, detail=str(error)) from error
        app.state.market_price_sync_error = None
        app.state.market_price_sync_detail = detail
        if snapshot is not None:
            app.state.market_price_snapshot = snapshot
        return {
            "stored_records": stored,
            "source": snapshot["source"] if snapshot else MARKET_PRICE_SOURCE,
            "detail": detail,
            "snapshot": snapshot,
        }


def get_agriculture_dataset(
    resource_id: str,
    state: str | None,
    district: str | None,
) -> list[dict]:
    api_key = os.getenv("DATA_GOV_IN_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Configure DATA_GOV_IN_API_KEY to enable government agriculture statistics.",
        )

    params: dict[str, str | int] = {
        "api-key": api_key,
        "format": "json",
        "limit": 500,
    }
    state_field = os.getenv("AGRI_STATS_STATE_FIELD", "state")
    district_field = os.getenv("AGRI_STATS_DISTRICT_FIELD", "district")
    if state:
        params[f"filters[{state_field}]"] = state
    if district:
        params[f"filters[{district_field}]"] = district

    data = fetch_json(
        f"https://api.data.gov.in/resource/{resource_id}?{urlencode(params)}"
    )
    return data.get("records", [])


def metric_unavailable(detail: str) -> dict:
    return {"status": "unavailable", "value": None, "detail": detail}


def metric_error(error: Exception) -> dict:
    detail = error.detail if isinstance(error, HTTPException) else str(error)
    return {"status": "error", "value": None, "detail": detail}


def configured_agriculture_metric(
    resource_env: str,
    value_field_env: str,
    unit_env: str,
    state: str | None,
    district: str | None,
) -> dict:
    if not state:
        return metric_unavailable("Select a state or district for a location-specific statistic.")
    resource_id = os.getenv(resource_env)
    value_field = os.getenv(value_field_env)
    if not resource_id:
        return metric_unavailable(
            f"Configure {resource_env} with the matching data.gov.in resource ID."
        )
    if not value_field:
        return metric_unavailable(
            f"Configure {value_field_env} with the value column from that dataset."
        )

    records = get_agriculture_dataset(resource_id, state, district)
    if not records:
        return metric_unavailable("The selected location has no matching dataset records.")

    year_field = os.getenv("AGRI_STATS_YEAR_FIELD", "year")
    record = max(
        records,
        key=lambda row: str(row.get(year_field, "")),
    )
    value = record.get(value_field)
    if value in (None, ""):
        return metric_unavailable(
            f"The configured value column {value_field!r} was not present in the returned records."
        )
    return {
        "status": "available",
        "value": value,
        "unit": os.getenv(unit_env, ""),
        "year": record.get(year_field),
        "source": "data.gov.in",
        "resource_id": resource_id,
    }


def agriculture_weather(latitude: float, longitude: float) -> dict:
    weather = fetch_json(
        "https://api.open-meteo.com/v1/forecast?"
        + urlencode(
            {
                "latitude": latitude,
                "longitude": longitude,
                "timezone": "auto",
                "past_days": 31,
                "forecast_days": 1,
                "current": "temperature_2m,relative_humidity_2m",
                "daily": "precipitation_sum,temperature_2m_max,temperature_2m_min",
            }
        )
    )
    current = weather.get("current") or {}
    daily = weather.get("daily") or {}
    daily_dates = daily.get("time") or []
    precipitation = daily.get("precipitation_sum") or []
    local_today = str(current.get("time", ""))[:10]
    if not local_today:
        local_today = datetime.now(timezone.utc).date().isoformat()
    rainfall_values = [
        value
        for day, value in zip(daily_dates, precipitation)
        if day < local_today and isinstance(value, (int, float))
    ][-30:]

    return {
        "temperature": {
            "status": "available" if current.get("temperature_2m") is not None else "unavailable",
            "value": current.get("temperature_2m"),
            "unit": "°C",
            "source": "Open-Meteo",
            "period": "Current modeled temperature at the regional reference point",
        },
        "humidity": {
            "status": "available" if current.get("relative_humidity_2m") is not None else "unavailable",
            "value": current.get("relative_humidity_2m"),
            "unit": "%",
            "source": "Open-Meteo",
            "period": "Current modeled relative humidity at the regional reference point",
        },
        "rainfall": {
            "status": "available" if rainfall_values else "unavailable",
            "value": round(sum(rainfall_values), 1) if rainfall_values else None,
            "unit": "mm",
            "source": "Open-Meteo",
            "period": "Accumulated precipitation over the last 30 days",
        },
    }


def agriculture_soil(latitude: float, longitude: float) -> dict:
    data = fetch_json(
        "https://rest.isric.org/soilgrids/v2.0/properties/query?"
        + urlencode(
            {
                "lon": longitude,
                "lat": latitude,
                "property": ["clay", "sand", "silt", "soc", "phh2o"],
                "depth": ["0-5cm", "5-15cm", "15-30cm", "30-60cm"],
                "value": "mean",
            },
            doseq=True,
        )
    )
    properties = data.get("properties") or {}
    layers = properties.get("layers") or []
    property_labels = {
        "clay": "Clay",
        "sand": "Sand",
        "silt": "Silt",
        "soc": "Organic carbon",
        "phh2o": "pH",
    }
    profile_by_depth: dict[str, dict] = {}
    for soil_layer in layers:
        property_name = soil_layer.get("name")
        label = property_labels.get(property_name)
        if not label:
            continue
        unit_measure = soil_layer.get("unit_measure") or {}
        divisor = unit_measure.get("d_factor") or 1
        unit = unit_measure.get("target_units") or unit_measure.get("mapped_units") or ""
        for depth in soil_layer.get("depths", []):
            mean = (depth.get("values") or {}).get("mean")
            if not isinstance(mean, (int, float)) or not isinstance(divisor, (int, float)) or divisor <= 0:
                continue
            depth_label = depth.get("label")
            if not depth_label:
                continue
            profile_by_depth.setdefault(depth_label, {})[property_name] = {
                "label": label,
                "value": round(mean / divisor, 2),
                "unit": unit,
            }

    profile = [
        {"depth": depth, "properties": profile_by_depth[depth]}
        for depth in ("0-5cm", "5-15cm", "15-30cm", "30-60cm")
        if profile_by_depth.get(depth)
    ]
    surface = profile_by_depth.get("0-5cm", {})
    values = []
    for item in surface.values():
        suffix = f" {item['unit']}" if item["unit"] else ""
        values.append(f"{item['label']}: {item['value']}{suffix}")
    if not profile:
        return metric_unavailable(
            "ISRIC SoilGrids returned no values at this point. The selected location may not have grid coverage; configure a matching district soil-health dataset to show measured soil-test values."
        )
    return {
        "status": "available",
        "value": "; ".join(values),
        "profile": profile,
        "source": "ISRIC SoilGrids",
        "period": "Modelled soil properties by depth",
        "detail": "Gridded estimates at the selected reference point, not field measurements. Values are converted using the units and scale reported by SoilGrids.",
    }


def configured_soil_health_profile(
    state: str | None,
    district: str | None,
) -> dict:
    resource_id = os.getenv("AGRI_SOIL_RESOURCE_ID")
    if not resource_id:
        return metric_unavailable(
            "No AGRI_SOIL_RESOURCE_ID is configured for official district soil-health records."
        )

    fields = (
        ("AGRI_SOIL_PH_FIELD", "pH", "AGRI_SOIL_PH_UNIT"),
        ("AGRI_SOIL_EC_FIELD", "Electrical conductivity", "AGRI_SOIL_EC_UNIT"),
        ("AGRI_SOIL_OC_FIELD", "Organic carbon", "AGRI_SOIL_OC_UNIT"),
        ("AGRI_SOIL_N_FIELD", "Available nitrogen", "AGRI_SOIL_N_UNIT"),
        ("AGRI_SOIL_P_FIELD", "Available phosphorus", "AGRI_SOIL_P_UNIT"),
        ("AGRI_SOIL_K_FIELD", "Available potassium", "AGRI_SOIL_K_UNIT"),
        ("AGRI_SOIL_TEXTURE_FIELD", "Soil texture", ""),
    )
    configured = [
        (os.getenv(field_env), label, os.getenv(unit_env, "") if unit_env else "")
        for field_env, label, unit_env in fields
        if os.getenv(field_env)
    ]
    if not configured:
        return metric_unavailable(
            "Configure soil-health field names such as AGRI_SOIL_PH_FIELD or AGRI_SOIL_N_FIELD for the selected data.gov.in resource."
        )
    if not state:
        return metric_unavailable("Select a state or district for soil-health records.")

    records = get_agriculture_dataset(resource_id, state, district)
    year_field = os.getenv("AGRI_STATS_YEAR_FIELD", "year")
    latest = max(records, key=lambda row: str(row.get(year_field, "")), default=None)
    if latest is None:
        return metric_unavailable("No soil-health records matched the selected location.")

    measured = {}
    for field, label, unit in configured:
        value = latest.get(field)
        if value not in (None, ""):
            measured[field] = {
                "label": label,
                "value": value,
                "unit": unit,
            }
    if not measured:
        return metric_unavailable(
            "The matched soil-health record did not contain any configured measurement fields."
        )

    values = []
    for item in measured.values():
        suffix = f" {item['unit']}" if item["unit"] else ""
        values.append(f"{item['label']}: {item['value']}{suffix}")
    value = "; ".join(values)
    year = latest.get(year_field)
    return {
        "status": "available",
        "value": value,
        "profile": [{"depth": "Reported soil-health sample", "properties": measured}],
        "source": "data.gov.in · configured soil-health dataset",
        "resource_id": resource_id,
        "year": year,
        "period": f"Latest matching source record{f' · {year}' if year else ''}",
        "detail": "Reported dataset measurements for the selected administrative area; this is not a point sample at the map reference coordinate.",
    }


def reported_market_crops(
    db: Session,
    state: str | None,
    district: str | None,
) -> dict:
    if not state:
        return metric_unavailable("Select a state or district to find local mandi crop reports.")

    today = date.today()
    query = filtered_market_prices(db, state=state, district=district).filter(
        MarketPrice.arrival_date >= today - timedelta(days=90),
        MarketPrice.arrival_date <= today,
    )
    rows = (
        query.with_entities(
            MarketPrice.commodity,
            func.max(MarketPrice.arrival_date).label("latest_report_date"),
            func.count(MarketPrice.id).label("report_count"),
            func.count(func.distinct(MarketPrice.market)).label("market_count"),
        )
        .group_by(MarketPrice.commodity)
        .order_by(func.max(MarketPrice.arrival_date).desc(), MarketPrice.commodity.asc())
        .all()
    )
    if not rows:
        return metric_unavailable(
            "No saved mandi commodity reports matched this location in the last 90 days."
        )

    reports = [
        {
            "crop": row.commodity,
            "latest_report_date": row.latest_report_date.isoformat(),
            "report_count": row.report_count,
            "market_count": row.market_count,
        }
        for row in rows
    ]
    scope = f"{district}, {state}" if district else state
    return {
        "status": "available",
        "value": reports,
        "source": market_source_label(db, query),
        "period": "Saved mandi reports from the last 90 days",
        "detail": f"Observed commodity reports for {scope}. Mandi reports show commodities traded, not every crop cultivated in the area.",
    }


@app.get("/api/agriculture/snapshot")
def get_agriculture_snapshot(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    state: str | None = Query(default=None, min_length=1, max_length=100),
    district: str | None = Query(default=None, min_length=1, max_length=100),
    db: Session = Depends(get_db),
):
    jobs = {
        "agricultural_area": lambda: configured_agriculture_metric(
            "AGRI_AREA_RESOURCE_ID",
            "AGRI_AREA_VALUE_FIELD",
            "AGRI_AREA_UNIT",
            state,
            district,
        ),
        "irrigated_area": lambda: configured_agriculture_metric(
            "AGRI_IRRIGATION_RESOURCE_ID",
            "AGRI_IRRIGATION_VALUE_FIELD",
            "AGRI_IRRIGATION_UNIT",
            state,
            district,
        ),
        "crop_production": lambda: configured_agriculture_metric(
            "AGRI_PRODUCTION_RESOURCE_ID",
            "AGRI_PRODUCTION_VALUE_FIELD",
            "AGRI_PRODUCTION_UNIT",
            state,
            district,
        ),
        "farm_holdings": lambda: configured_agriculture_metric(
            "AGRI_CENSUS_RESOURCE_ID",
            "AGRI_CENSUS_VALUE_FIELD",
            "AGRI_CENSUS_UNIT",
            state,
            district,
        ),
        "soil_type": lambda: agriculture_soil(latitude, longitude),
        "weather": lambda: agriculture_weather(latitude, longitude),
    }

    results: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=len(jobs)) as executor:
        futures = {
            key: executor.submit(job)
            for key, job in jobs.items()
        }
        for key, future in futures.items():
            try:
                results[key] = future.result()
            except (HTTPException, TimeoutError, URLError, ValueError) as error:
                results[key] = metric_error(error)

    production_records: list[dict] = []
    market_crops = reported_market_crops(db, state, district)
    production_resource_id = os.getenv("AGRI_PRODUCTION_RESOURCE_ID")
    production_crop_field = os.getenv("AGRI_PRODUCTION_CROP_FIELD")
    production_value_field = os.getenv("AGRI_PRODUCTION_VALUE_FIELD")
    if not state:
        results["major_crops"] = metric_unavailable(
            "Select a state or district for location-specific crop records."
        )
    elif production_resource_id and production_crop_field and production_value_field:
        try:
            records = get_agriculture_dataset(production_resource_id, state, district)
            year_field = os.getenv("AGRI_STATS_YEAR_FIELD", "year")
            production_records = [
                {
                    "crop": record.get(production_crop_field),
                    "production": record.get(production_value_field),
                    "unit": os.getenv("AGRI_PRODUCTION_UNIT", "tonnes"),
                    "year": record.get(year_field),
                }
                for record in records
                if record.get(production_crop_field) not in (None, "")
                and record.get(production_value_field) not in (None, "")
            ]
            production_records.sort(
                key=lambda record: (
                    str(record.get("year", "")),
                    float(record["production"])
                    if str(record["production"]).replace(".", "", 1).isdigit()
                    else 0,
                ),
                reverse=True,
            )
            results["major_crops"] = {
                "status": "available" if production_records else "unavailable",
                "value": production_records[:5] or None,
                "source": "data.gov.in",
                "resource_id": production_resource_id,
                "detail": "Latest crop-production records in the configured dataset.",
            }
        except (HTTPException, TimeoutError, URLError, ValueError) as error:
            results["major_crops"] = metric_error(error)
    else:
        if market_crops["status"] == "available":
            commodities = list(
                dict.fromkeys(
                    record["crop"] for record in market_crops["value"]
                )
            )
            results["major_crops"] = {
                "status": "available",
                "value": commodities[:5],
                "source": market_crops["source"],
                "detail": market_crops["detail"],
            }
        else:
            try:
                market_data = fetch_agmarknet_data(state, district, limit=500)
                commodities = list(
                    dict.fromkeys(
                        record.get("commodity")
                        for record in market_data.get("records", [])
                        if record.get("commodity")
                    )
                )
                results["major_crops"] = {
                    "status": "available" if commodities else "unavailable",
                    "value": commodities[:5] or None,
                    "source": "data.gov.in / AGMARKNET",
                    "detail": "Commodities in recent mandi listings; this is not a production or acreage ranking.",
                } if commodities else metric_unavailable(
                    "No mandi commodity records matched the selected location."
                )
            except (HTTPException, TimeoutError, URLError, ValueError) as error:
                results["major_crops"] = metric_error(error)

    results["crop_reports"] = market_crops

    recommendation_resource = os.getenv("AGRI_ADVISORY_RESOURCE_ID")
    recommendation_field = os.getenv("AGRI_ADVISORY_VALUE_FIELD")
    if not state:
        results["crop_recommendation"] = metric_unavailable(
            "Select a state or district for location-specific crop advice."
        )
    elif recommendation_resource and recommendation_field:
        try:
            records = get_agriculture_dataset(recommendation_resource, state, district)
            year_field = os.getenv("AGRI_STATS_YEAR_FIELD", "year")
            latest = max(records, key=lambda row: str(row.get(year_field, "")), default=None)
            advisory = latest.get(recommendation_field) if latest else None
            results["crop_recommendation"] = (
                {
                    "status": "available",
                    "value": advisory,
                    "year": latest.get(year_field),
                    "source": "data.gov.in",
                    "resource_id": recommendation_resource,
                    "detail": "Published advisory from the configured dataset; check its season and issue date.",
                }
                if advisory
                else metric_unavailable("No published advisory matched this location.")
            )
        except (HTTPException, TimeoutError, URLError, ValueError) as error:
            results["crop_recommendation"] = metric_error(error)
    else:
        results["crop_recommendation"] = metric_unavailable(
            "No verified location-specific advisory dataset is configured."
        )

    weather = results.pop("weather")
    results["temperature"] = weather.get(
        "temperature",
        metric_unavailable("Temperature data is unavailable."),
    )
    results["humidity"] = weather.get(
        "humidity",
        metric_unavailable("Humidity data is unavailable."),
    )
    results["rainfall"] = weather.get(
        "rainfall",
        metric_unavailable("Rainfall data is unavailable."),
    )
    results["soil_type"].setdefault("detail", "Soil type unavailable.")
    soil_profile = results["soil_type"]
    if soil_profile["status"] != "available":
        try:
            configured_profile = configured_soil_health_profile(state, district)
        except (HTTPException, TimeoutError, URLError, ValueError) as error:
            configured_profile = metric_error(error)
        if configured_profile["status"] == "available":
            soil_profile = configured_profile
            results["soil_type"] = configured_profile
        elif soil_profile["status"] == "error":
            soil_profile = {
                **soil_profile,
                "source": "ISRIC SoilGrids",
                "detail": (
                    f"{soil_profile['detail']} "
                    f"District soil-health fallback: {configured_profile['detail']}"
                ),
            }
    results["soil_profile"] = soil_profile

    return {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "reference_point": {"latitude": latitude, "longitude": longitude},
        "location": {"state": state, "district": district},
        "metrics": results,
    }


@app.post("/api/register")
async def register_user(user: UserCreate, db: Session = Depends(get_db)):
    if user.role not in {"farmer", "buyer"}:
        raise HTTPException(status_code=422, detail="Role must be farmer or buyer")
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    new_user = User(
        name=user.name,
        email=user.email,
        password_hash=hash_password(user.password),
        role=user.role,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    if new_user.role == "farmer":
        await realtime_connections.publish("farmers.changed")
    return {"message": "User registered successfully", "user": summarize_user(new_user)}


@app.post("/api/login")
def login_user(user: UserLogin, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == user.email).first()
    if not existing_user or not verify_password(
        user.password,
        existing_user.password_hash,
    ):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {
        "message": "Login successful",
        "access_token": create_access_token(
            {"sub": str(existing_user.id), "role": existing_user.role}
        ),
        "token_type": "bearer",
        "user": summarize_user(existing_user),
    }


@app.get("/api/me")
def get_my_profile(current_user: User = Depends(get_current_user)):
    return summarize_user(current_user)


@app.post("/api/farmer/profile")
async def create_farmer_profile(
    profile: FarmerProfileCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "farmer":
        raise HTTPException(status_code=403, detail="Only farmers can create a profile")
    if db.query(FarmerProfile).filter(
        FarmerProfile.user_id == current_user.id
    ).first():
        raise HTTPException(status_code=400, detail="Farmer profile already exists")
    new_profile = FarmerProfile(user_id=current_user.id, **profile.model_dump())
    db.add(new_profile)
    db.commit()
    db.refresh(new_profile)
    await realtime_connections.publish("farmers.changed")
    return {
        "id": new_profile.id,
        "user_id": new_profile.user_id,
        "farm_name": new_profile.farm_name,
        "location": new_profile.location,
        "farm_size": new_profile.farm_size,
        "soil_type": new_profile.soil_type,
    }


@app.get("/api/farmers")
def get_farmers(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "buyer":
        raise HTTPException(status_code=403, detail="Only buyers can browse farmer profiles")

    farmer_rows = (
        db.query(User, FarmerProfile)
        .outerjoin(FarmerProfile, FarmerProfile.user_id == User.id)
        .filter(User.role == "farmer")
        .all()
    )
    farmers = []
    for user, profile in farmer_rows:
        products = (
            db.query(Product)
            .filter(
                Product.farmer_id == user.id,
                Product.status == "available",
            )
            .all()
        )
        farmers.append(
            {
                "id": user.id,
                "name": user.name,
                "farm_name": profile.farm_name if profile else None,
                "location": profile.location if profile else None,
                "products": [product.product_name for product in products],
            }
        )
    return {"farmers": farmers}


@app.get("/api/farmer/profile")
def get_farmer_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "farmer":
        raise HTTPException(status_code=403, detail="Only farmers can view this profile")
    profile = db.query(FarmerProfile).filter(
        FarmerProfile.user_id == current_user.id
    ).first()
    if profile is None:
        raise HTTPException(status_code=404, detail="Farmer profile not found")
    return {
        "id": profile.id,
        "user_id": profile.user_id,
        "farm_name": profile.farm_name,
        "location": profile.location,
        "farm_size": profile.farm_size,
        "soil_type": profile.soil_type,
    }


@app.get("/api/farmer/workspace")
def get_farmer_workspace(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "farmer":
        raise HTTPException(status_code=403, detail="Only farmers can view this workspace")

    profile = db.query(FarmerProfile).filter(
        FarmerProfile.user_id == current_user.id
    ).first()
    crops = (
        db.query(Crop)
        .filter(Crop.farmer_id == current_user.id)
        .order_by(Crop.id.desc())
        .all()
    )

    return {
        "profile": (
            {
                "id": profile.id,
                "farm_name": profile.farm_name,
                "location": profile.location,
                "farm_size": profile.farm_size,
                "soil_type": profile.soil_type,
            }
            if profile
            else None
        ),
        "crops": [
            {
                "id": crop.id,
                "crop_name": crop.crop_name,
                "area_cultivated": crop.area_cultivated,
                "season": crop.season,
                "status": crop.status,
            }
            for crop in crops
        ],
    }


@app.put("/api/farmer/profile")
async def save_farmer_profile(
    profile_data: FarmerProfileCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "farmer":
        raise HTTPException(status_code=403, detail="Only farmers can update a profile")

    profile = db.query(FarmerProfile).filter(
        FarmerProfile.user_id == current_user.id
    ).first()
    if profile is None:
        profile = FarmerProfile(user_id=current_user.id, **profile_data.model_dump())
        db.add(profile)
    else:
        for field, value in profile_data.model_dump().items():
            setattr(profile, field, value)

    db.commit()
    db.refresh(profile)
    await realtime_connections.publish("farmers.changed")
    return {
        "id": profile.id,
        "user_id": profile.user_id,
        "farm_name": profile.farm_name,
        "location": profile.location,
        "farm_size": profile.farm_size,
        "soil_type": profile.soil_type,
    }


@app.post("/api/farmer/crops")
def create_crop(
    crop_data: CropCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "farmer":
        raise HTTPException(status_code=403, detail="Only farmers can add crops")
    crop = Crop(farmer_id=current_user.id, **crop_data.model_dump())
    db.add(crop)
    db.commit()
    db.refresh(crop)
    return {"id": crop.id, "crop_name": crop.crop_name, "status": crop.status}


@app.get("/api/farmer/crops")
def get_my_crops(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "farmer":
        raise HTTPException(status_code=403, detail="Only farmers can view crops")
    crops = db.query(Crop).filter(Crop.farmer_id == current_user.id).all()
    return {
        "farmer_id": current_user.id,
        "total_crops": len(crops),
        "crops": [
            {
                "id": crop.id,
                "crop_name": crop.crop_name,
                "area_cultivated": crop.area_cultivated,
                "season": crop.season,
                "status": crop.status,
            }
            for crop in crops
        ],
    }


@app.post("/api/marketplace/products")
async def create_product(
    product_data: ProductCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "farmer":
        raise HTTPException(status_code=403, detail="Only farmers can list products")
    product = Product(farmer_id=current_user.id, **product_data.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    await realtime_connections.publish("products.changed")
    return {"product": summarize_product(product, db)}


@app.get("/api/marketplace/products")
def get_marketplace_products(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "buyer":
        raise HTTPException(status_code=403, detail="Only buyers can browse marketplace products")

    products = db.query(Product).filter(Product.status == "available").all()
    return {
        "total_products": len(products),
        "products": [summarize_product(product, db) for product in products],
    }


@app.get("/api/farmer/products")
def get_my_products(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "farmer":
        raise HTTPException(status_code=403, detail="Only farmers can view listings")
    products = db.query(Product).filter(Product.farmer_id == current_user.id).all()
    return {"products": [summarize_product(product, db) for product in products]}


@app.post("/api/orders")
async def create_order(
    order_data: OrderCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "buyer":
        raise HTTPException(status_code=403, detail="Only buyers can place orders")
    product = (
        db.query(Product)
        .filter(Product.id == order_data.product_id)
        .with_for_update()
        .first()
    )
    if product is None or product.status != "available":
        raise HTTPException(status_code=404, detail="Available product not found")
    if order_data.quantity <= 0 or order_data.quantity > product.quantity:
        raise HTTPException(status_code=400, detail="Requested quantity is unavailable")
    order = Order(
        buyer_id=current_user.id,
        product_id=product.id,
        quantity=order_data.quantity,
        total_price=order_data.quantity * product.price_per_unit,
        status="pending",
    )
    product.quantity -= order_data.quantity
    if product.quantity == 0:
        product.status = "sold"
    db.add(order)
    db.commit()
    db.refresh(order)
    await realtime_connections.publish("orders.changed")
    await realtime_connections.publish("products.changed")
    return {"order": summarize_order(order, db)}


@app.get("/api/orders")
def get_my_orders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    orders = db.query(Order).filter(Order.buyer_id == current_user.id).all()
    return {"orders": [summarize_order(order, db) for order in orders]}


@app.get("/api/farmer/orders")
def get_farmer_orders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "farmer":
        raise HTTPException(status_code=403, detail="Only farmers can view these orders")
    orders = (
        db.query(Order)
        .join(Product, Product.id == Order.product_id)
        .filter(Product.farmer_id == current_user.id)
        .all()
    )
    return {"orders": [summarize_order(order, db) for order in orders]}


@app.patch("/api/orders/{order_id}")
async def update_order_status(
    order_id: int,
    status_data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "farmer":
        raise HTTPException(status_code=403, detail="Only farmers can update orders")
    status = status_data.get("status")
    if status not in {"accepted", "rejected", "completed"}:
        raise HTTPException(status_code=422, detail="Invalid order status")
    order = (
        db.query(Order)
        .join(Product, Product.id == Order.product_id)
        .filter(Order.id == order_id, Product.farmer_id == current_user.id)
        .with_for_update()
        .first()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != "pending":
        raise HTTPException(status_code=409, detail="Order is no longer pending")
    if status == "rejected":
        product = (
            db.query(Product)
            .filter(Product.id == order.product_id)
            .with_for_update()
            .first()
        )
        if product:
            product.quantity += order.quantity
            product.status = "available"
    order.status = status
    db.commit()
    db.refresh(order)
    await realtime_connections.publish("orders.changed")
    if status == "rejected":
        await realtime_connections.publish("products.changed")
    return {"order": summarize_order(order, db)}


@app.websocket("/api/realtime")
async def realtime(websocket: WebSocket, db: Session = Depends(get_db)):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, TypeError, ValueError):
        await websocket.close(code=1008)
        return
    if db.query(User).filter(User.id == user_id).first() is None:
        await websocket.close(code=1008)
        return
    await realtime_connections.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        realtime_connections.disconnect(websocket)