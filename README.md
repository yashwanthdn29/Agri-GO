# AgriGO

AgriGO is a React and TypeScript frontend with a FastAPI and PostgreSQL backend. Marketplace listings and orders are database-backed and broadcast change events over authenticated WebSockets. Weather comes from Open-Meteo; mandi prices come from the Government of India's data.gov.in feed.

## Project layout

- `frontend/`: React, TypeScript, Vite, and Tailwind CSS application.
- `backend/main.py`: FastAPI routes, including WebSocket change events and external data proxies.
- `backend/*_models.py`: PostgreSQL-backed users, profiles, crops, products, and orders.
- `frontend/src/api.ts`: shared authenticated HTTP client.
- `frontend/src/realtime.ts`: frontend subscriptions for live marketplace/order refreshes.
- `frontend/src/pages/AgricultureMap.tsx`: AgriGO's interactive India state and district map.
- `frontend/src/pages/MyFarm.tsx`: authenticated farmer workspace for a farm profile and crop-season records.
- `docker-compose.yml`: local PostgreSQL service with persistent storage.

## Run locally

1. Copy `backend/.env.example` to `backend/.env`, set the PostgreSQL values and a strong `SECRET_KEY`, then add `DATA_GOV_IN_API_KEY` and `GEMINI_API_KEY` to enable live mandi prices and the Gemini-powered assistant. Keep API keys in this backend-only environment file; do not place them in frontend code or share them in chat. Weather and air quality use Open-Meteo and do not need an API key.
2. Start PostgreSQL from the project root with `docker compose up -d postgres`.
3. In a terminal, install and run the backend from `backend/`:

   ```powershell
   cd backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install -r requirements.txt
   python -m alembic -c alembic.ini upgrade head
   uvicorn main:app --reload
   ```

4. In another terminal, run the frontend:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

The API is available at `http://localhost:8000`, with interactive docs at `/docs`. The frontend's Vite server forwards HTTP and WebSocket `/api` requests to it. `/api/health` checks the API. Weather, AQI, geocoding, and forecasts use Open-Meteo and refresh every 15 minutes; browser location can be used with permission, or a city can be searched. Market Intelligence first syncs the official AGMARKNET/data.gov.in API. If that feed does not return usable records, AgriGO imports the newest integrity-checked MandiLens snapshot of AGMARKNET 2.0 records from six South Indian states and Maharashtra; the snapshot is capped at 14 days old, and its source date and representative-price basis are shown. Scheduled checks use `MARKET_PRICE_REFRESH_INTERVAL_SECONDS` (default: 21,600 seconds), and the **Fetch latest data** button triggers a new check. MandiLens publishes its source manifest, per-file SHA-256 hashes, retrieval dates, provider/catalog URLs, and Government Open Data License (India) attribution; the dashboard does not label its representative prices as official modal prices. Neither source is advertised as real-time. Assistant answers use Gemini when `GEMINI_API_KEY` is configured; `GET /api/assistant/status` reports whether the key is configured and the selected model without returning the key. `GEMINI_MODEL` defaults to `gemini-3.8-flash`; set it in `backend/.env` if your key does not have access to that model. Scheme pages link to official portals because no documented live schemes API is configured.

Market Intelligence history begins with the first successful sync after the migration. Verified snapshot data can provide up to 90 recent days from its published date range; it does not claim to backfill dates outside that window. Seven- and 30-day averages, trend changes, and market comparisons use only actual sourced rows and remain unavailable when there is insufficient data. The Intelligence Lab's experimental time-trend baseline requires at least 30 distinct **official modal-price** dates for a selected commodity, uses a chronological held-out validation split, and shows a forecast only if it beats a last-reported-price baseline. Representative snapshot prices are not silently used to train that model. It is not a guaranteed price or a production-grade seasonal forecast. If neither the live API nor a fresh, integrity-verified snapshot is usable, the API reports the precise source/import status and does not generate fallback prices. `MARKET_PRICE_SYNC_LIMIT` controls how many source records a sync requests (default: 500; maximum: 10,000).

The agriculture map uses AgriGO's own Leaflet-based renderer with local state and district boundary files. The boundary data is derived from OpenStreetMap and is provided under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/); attribution and data notes are in [frontend/src/data/README.md](./frontend/src/data/README.md). The AGMARKNET field-measurement map uses Esri World Imagery satellite tiles, attributed in the map; Leaflet remains its interaction renderer for search, GPS, and boundary measurement. These imagery tiles require an internet connection. Location analysis uses Open-Meteo for weather and ISRIC SoilGrids for available modeled soil properties by depth. SoilGrids may return no data for a point; AgriGO reports this rather than filling gaps. An optional official data.gov.in soil-health dataset can be configured with `AGRI_SOIL_RESOURCE_ID`, the matching `AGRI_SOIL_*_FIELD` column names, units, and the shared state/district/year fields. Crop reports are summarized from saved AGMARKNET / verified AGMARKNET 2.0 mandi observations in the selected state/district from the latest 90 days; these indicate traded commodities, not a complete list of crops cultivated in the area. Crop-production datasets can separately be configured for a production-based crop list. Area, irrigation, production, holdings, and published crop advice use data.gov.in resource IDs and column names configured in `backend/.env`; use the matching resource and field names from each dataset's API documentation. Weather and gridded soil values are point estimates, not area-wide measurements. Village boundaries are not included, and map boundaries are visual references rather than official or survey-grade maps. Farmonaut's public materials describe satellite APIs, but AgriGO does not yet have a verified endpoint/authentication/response contract for the user's account; the map must not imply that Farmonaut imagery or crop-health indices are connected until that contract is confirmed and tested.

To enable agriculture area, irrigation, production, holdings, crop lists, published recommendations, and optional district soil-health measurements, set `DATA_GOV_IN_API_KEY` and the corresponding `AGRI_*_RESOURCE_ID` and `AGRI_*_VALUE_FIELD` entries in `backend/.env` using datasets from [data.gov.in](https://www.data.gov.in/). For soil-health records, set `AGRI_SOIL_RESOURCE_ID` and the `AGRI_SOIL_PH_FIELD`, `AGRI_SOIL_EC_FIELD`, `AGRI_SOIL_OC_FIELD`, `AGRI_SOIL_N_FIELD`, `AGRI_SOIL_P_FIELD`, `AGRI_SOIL_K_FIELD`, or `AGRI_SOIL_TEXTURE_FIELD` variables to the exact columns available in that dataset; set matching `AGRI_SOIL_*_UNIT` values from the source documentation. Set state/district/year field names when the dataset uses names other than the defaults. The app displays the configured source, unit, and year; it does not estimate missing statistics or generate crop advice in place of an official advisory.

## Public information and private workspaces

The home page, agriculture map, market prices, weather, government schemes, and crop-suitability prototype are available without signing in. Farmer dashboards, farm and crop records, listings, buyer requests, and farmer tools require a farmer account. Buyer dashboards, product browsing, farmer contacts, orders, and buyer tools require a buyer account. Role checks are applied to frontend routes, and private farm/marketplace APIs independently validate the access token and account role. Farm profiles and crop records are scoped to the authenticated farmer; farmer profiles and product listings are available only to authenticated buyers.

The private farm workspace stores the farmer's farm name, location, area, soil label, and crop/season entries in the existing `farmer_profiles` and `crops` tables. Summary figures are calculated from the farmer-entered records; they are not official agricultural statistics, and crop areas recorded over multiple seasons are not deduplicated.

## Data science and machine-learning status

AgriGO's Intelligence Lab provides descriptive analysis of sourced observations and an experimental, one-feature linear-regression time-trend baseline for stored AGMARKNET prices. It uses a chronological held-out evaluation and only publishes estimates when the model outperforms a last-reported-price baseline. This limited baseline does not model seasonality, weather, arrivals, policy changes, or market closures and is not a guaranteed price. Public agriculture indicators are shown with their configured data source and availability state. Weather is a modelled provider output, and SoilGrids is a gridded soil prediction. Crop suitability accepts NPK values entered from a field soil test and can load location-point temperature, humidity, and rainfall accumulated over the previous 30 completed days, plus available regional soil/crop/advisory context. Its transparent `if/else` rules remain a prototype, not machine learning; they are not validated in field trials and must not be used as sole planting or fertilizer advice. Location does not supply NPK readings, and AgriGO does not infer them from weather, SoilGrids, or satellite imagery. AgriGO does not currently include a trained disease-image classifier or crop model weights, so it must not present a disease scan or crop-recommendation prediction as a working deep-learning or trained crop model.

A responsible ML extension should start with a documented, licensed, representative dataset and exploratory data-quality analysis. For crop recommendations, establish a held-out baseline classifier, prevent leakage across regions/seasons, compare per-class precision/recall and macro-F1, and validate beyond the training source before serving predictions. For disease detection, collect or license field images across crops, stages, and conditions; keep near-duplicate images in the same split; report per-class recall and calibration; and return an uncertainty/consult-expert state when confidence is inadequate. Add inference only after the dataset, evaluation, model artifact, and API contract are checked into the project with provenance and reproducible training instructions.

Open-Meteo's public service has usage and licensing limits; review its current terms before commercial deployment. The in-memory WebSocket broadcaster is suitable for one backend process; multi-instance deployment requires a shared message broker.
