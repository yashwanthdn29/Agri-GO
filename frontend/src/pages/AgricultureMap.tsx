import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api";
import {
  GeoJSON,
  MapContainer,
  TileLayer,
  useMap,
} from "react-leaflet";
import {
  geoJSON,
  type PathOptions,
} from "leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import statesBoundaryUrl from "../data/india-states.geojson?url";
import districtsBoundaryUrl from "../data/india-districts.geojson?url";
import "leaflet/dist/leaflet.css";
import "./AgricultureMap.css";

type AdministrativeProperties = {
  name: string;
  state?: string;
  code?: string;
};

type BoundaryFeature = Feature<Geometry, AdministrativeProperties>;
type BoundaryCollection = FeatureCollection<Geometry, AdministrativeProperties>;

type CropRecord = {
  crop: string;
  production: string | number;
  unit?: string;
  year?: string | number;
};

type SnapshotMetric = {
  status: "available" | "unavailable" | "error";
  value: string | number | string[] | CropRecord[] | null;
  unit?: string;
  source?: string;
  period?: string;
  year?: string | number;
  detail?: string;
};

type AgricultureSnapshot = {
  fetched_at: string;
  reference_point: { latitude: number; longitude: number };
  location: { state: string | null; district: string | null };
  metrics: Record<string, SnapshotMetric>;
};

const indicators: {
  key: string;
  label: string;
  icon: string;
}[] = [
  { key: "agricultural_area", label: "Agricultural area", icon: "▧" },
  { key: "irrigated_area", label: "Irrigated area", icon: "≈" },
  { key: "major_crops", label: "Major crops", icon: "⌁" },
  { key: "soil_type", label: "Soil profile", icon: "◒" },
  { key: "rainfall", label: "Rainfall", icon: "☂" },
  { key: "temperature", label: "Temperature", icon: "°" },
  { key: "humidity", label: "Humidity", icon: "◌" },
  { key: "farm_holdings", label: "Farm holdings", icon: "⌂" },
  { key: "crop_production", label: "Crop production", icon: "↗" },
  { key: "crop_recommendation", label: "Crop recommendation", icon: "✳" },
];

function metricValue(metric: SnapshotMetric | undefined): string {
  if (!metric || metric.value === null) return "Unavailable";
  if (Array.isArray(metric.value)) {
    if (metric.value.every((record) => typeof record === "string")) {
      return metric.value.join(" · ");
    }
    return metric.value
      .map((record) => {
        if (typeof record === "string") return record;
        const value = Number(record.production);
        const amount = Number.isFinite(value)
          ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(value)
          : record.production;
        return `${record.crop}: ${amount}${record.unit ? ` ${record.unit}` : ""}`;
      })
      .join(" · ");
  }
  const value =
    typeof metric.value === "number"
      ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(metric.value)
      : metric.value;
  return [value, metric.unit].filter(Boolean).join(" ");
}

async function loadBoundaries(url: string): Promise<BoundaryCollection> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Boundary data request failed (${response.status}).`);
  }

  const data: unknown = await response.json();
  if (
    typeof data !== "object" ||
    data === null ||
    !("features" in data) ||
    !Array.isArray(data.features)
  ) {
    throw new Error("Boundary data has an invalid GeoJSON structure.");
  }

  return data as BoundaryCollection;
}

function MapFocus({
  feature,
  maxZoom,
}: {
  feature: BoundaryFeature | BoundaryCollection | null;
  maxZoom: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!feature) return;
    const bounds = geoJSON(feature).getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [28, 28], maxZoom });
    }
  }, [feature, map, maxZoom]);

  return null;
}

export default function AgricultureMap() {
  const [states, setStates] = useState<BoundaryCollection | null>(null);
  const [districts, setDistricts] = useState<BoundaryCollection | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [boundaryError, setBoundaryError] = useState<string | null>(null);
  const [loadingStates, setLoadingStates] = useState(true);
  const [districtLoadAttempt, setDistrictLoadAttempt] = useState(0);
  const [snapshotResult, setSnapshotResult] = useState<{
    key: string;
    data: AgricultureSnapshot;
  } | null>(null);
  const [snapshotFailure, setSnapshotFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [snapshotRefresh, setSnapshotRefresh] = useState(0);

  useEffect(() => {
    let active = true;

    void loadBoundaries(statesBoundaryUrl)
      .then((data) => {
        if (active) setStates(data);
      })
      .catch((error: unknown) => {
        if (active) {
          setBoundaryError(
            error instanceof Error ? error.message : "Could not load map boundaries.",
          );
        }
      })
      .finally(() => {
        if (active) setLoadingStates(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedState || districts) return;
    let active = true;

    void loadBoundaries(districtsBoundaryUrl)
      .then((data) => {
        if (active) setDistricts(data);
      })
      .catch((error: unknown) => {
        if (active) {
          setBoundaryError(
            error instanceof Error ? error.message : "Could not load district boundaries.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, [selectedState, districts, districtLoadAttempt]);

  const selectedStateFeature = useMemo(
    () =>
      states?.features.find(
        (feature) => feature.properties.name === selectedState,
      ) ?? null,
    [selectedState, states],
  );

  const visibleDistricts = useMemo<BoundaryCollection | null>(() => {
    if (!districts || !selectedState) return null;
    return {
      type: "FeatureCollection",
      features: districts.features.filter(
        (feature) => feature.properties.state === selectedState,
      ),
    };
  }, [districts, selectedState]);

  const selectedDistrictFeature = useMemo(
    () =>
      visibleDistricts?.features.find(
        (feature) => feature.properties.name === selectedDistrict,
      ) ?? null,
    [selectedDistrict, visibleDistricts],
  );

  const referencePoint = useMemo(() => {
    const feature = selectedDistrictFeature ?? selectedStateFeature;
    if (!feature) return { latitude: 22.5, longitude: 79 };
    const center = geoJSON(feature).getBounds().getCenter();
    return { latitude: center.lat, longitude: center.lng };
  }, [selectedDistrictFeature, selectedStateFeature]);

  const snapshotKey = [
    referencePoint.latitude,
    referencePoint.longitude,
    selectedState ?? "",
    selectedDistrict ?? "",
    snapshotRefresh,
  ].join("|");
  const snapshot =
    snapshotResult?.key === snapshotKey ? snapshotResult.data : null;
  const snapshotError =
    snapshotFailure?.key === snapshotKey ? snapshotFailure.message : null;
  const snapshotLoading = !snapshot && !snapshotError;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      latitude: String(referencePoint.latitude),
      longitude: String(referencePoint.longitude),
    });
    if (selectedState) params.set("state", selectedState);
    if (selectedDistrict) params.set("district", selectedDistrict);

    void apiRequest<AgricultureSnapshot>(
      `/api/agriculture/snapshot?${params.toString()}`,
      { signal: controller.signal },
    )
      .then((data) => setSnapshotResult({ key: snapshotKey, data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setSnapshotFailure({
          key: snapshotKey,
          message:
            error instanceof Error
              ? error.message
              : "Unable to load regional agriculture data.",
        });
      });

    return () => controller.abort();
  }, [
    referencePoint.latitude,
    referencePoint.longitude,
    selectedDistrict,
    selectedState,
    snapshotKey,
  ]);

  function selectState(name: string) {
    setSelectedState(name);
    setSelectedDistrict(null);
    setBoundaryError(null);
    if (!districts) setDistrictLoadAttempt((attempt) => attempt + 1);
  }

  function selectDistrict(name: string) {
    setSelectedDistrict(name);
  }

  function showIndia() {
    setSelectedState(null);
    setSelectedDistrict(null);
    setBoundaryError(null);
  }

  const locationName = selectedDistrict ?? selectedState ?? "India";
  const loadingDistricts = Boolean(selectedState && !districts && !boundaryError);
  const stateFeaturesForMap = useMemo<BoundaryCollection | null>(() => {
    if (!states || !selectedState) return states;
    return {
      type: "FeatureCollection",
      features: states.features.filter(
        (feature) => feature.properties.name === selectedState,
      ),
    };
  }, [selectedState, states]);

  const stateStyle: PathOptions = {
    color: "#536c4c",
    weight: 1.5,
    fillColor: "#c8d8ad",
    fillOpacity: 0.7,
  };

  const districtStyle = (feature?: BoundaryFeature): PathOptions => ({
    color: feature?.properties.name === selectedDistrict ? "#284c38" : "#71856a",
    weight: feature?.properties.name === selectedDistrict ? 2.5 : 1,
    fillColor: feature?.properties.name === selectedDistrict ? "#97b77b" : "#e4eadb",
    fillOpacity: feature?.properties.name === selectedDistrict ? 0.82 : 0.56,
  });

  return (
    <main className="agri-map-page">
      <div className="agri-map-page__inner">
        <header className="agri-map-heading">
          <div>
            <p className="agri-map-eyebrow">FIELD INTELLIGENCE</p>
            <h1>Agriculture map</h1>
            <p className="agri-map-heading__description">
              Explore India by state and district. Select a region to focus the
              map and view the data currently available for it.
            </p>
          </div>
          <div className="agri-map-heading__coverage">
            <span className="agri-map-heading__coverage-mark" aria-hidden="true">
              ●
            </span>
            {selectedState
              ? `${visibleDistricts?.features.length ?? "—"} district boundaries`
              : `${states?.features.length ?? "—"} state & UT boundaries`}
          </div>
        </header>

        <nav className="agri-map-breadcrumb" aria-label="Map location">
          <button
            type="button"
            className={!selectedState ? "is-current" : ""}
            aria-current={!selectedState ? "location" : undefined}
            onClick={showIndia}
          >
            India
          </button>
          {selectedState && (
            <>
              <span aria-hidden="true">/</span>
              <button
                type="button"
                className={!selectedDistrict ? "is-current" : ""}
                aria-current={!selectedDistrict ? "location" : undefined}
                onClick={() => selectState(selectedState)}
              >
                {selectedState}
              </button>
            </>
          )}
          {selectedDistrict && (
            <>
              <span aria-hidden="true">/</span>
              <span className="agri-map-breadcrumb__current">
                {selectedDistrict}
              </span>
            </>
          )}
        </nav>

        <section
          className="agri-map-layout"
          aria-label="Agriculture map and regional data"
        >
          <div className="agri-map-card">
            <div className="agri-map-card__heading">
              <div>
                <p className="agri-map-eyebrow">INTERACTIVE MAP</p>
                <h2>{locationName}</h2>
              </div>
              {selectedState && (
                <button
                  className="agri-map-reset"
                  type="button"
                  onClick={showIndia}
                >
                  View all India <span aria-hidden="true">↗</span>
                </button>
              )}
            </div>

            <div className="agri-map-canvas">
              {loadingStates ? (
                <div className="agri-map-message" role="status">
                  Loading state boundaries…
                </div>
              ) : boundaryError && !states ? (
                <div className="agri-map-message agri-map-message--error" role="alert">
                  {boundaryError}
                </div>
              ) : states && (
                <MapContainer
                  center={[22.5, 79]}
                  zoom={4}
                  minZoom={3}
                  scrollWheelZoom
                  className="agri-map-leaflet"
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
                  />
                  {stateFeaturesForMap && (
                    <GeoJSON
                      key={`states-${selectedState ?? "all"}`}
                      data={stateFeaturesForMap}
                      style={stateStyle}
                      onEachFeature={(feature, layer) => {
                        const properties = feature.properties as AdministrativeProperties;
                        layer.bindTooltip(properties.name, {
                          permanent: !selectedState,
                          direction: "center",
                          className: "agri-map-label",
                        });
                        if (!selectedState) {
                          layer.on("click", () => selectState(properties.name));
                        }
                      }}
                    />
                  )}
                  {visibleDistricts && (
                    <GeoJSON
                      key={`districts-${selectedState}`}
                      data={visibleDistricts}
                      style={(feature) =>
                        districtStyle(feature as BoundaryFeature | undefined)
                      }
                      onEachFeature={(feature, layer) => {
                        const properties = feature.properties as AdministrativeProperties;
                        layer.bindTooltip(properties.name, {
                          sticky: true,
                          className: "agri-map-label",
                        });
                        layer.on("click", () => selectDistrict(properties.name));
                      }}
                    />
                  )}
                  <MapFocus
                    feature={
                      selectedDistrictFeature ??
                      selectedStateFeature ??
                      (selectedState ? null : states)
                    }
                    maxZoom={selectedDistrict ? 9 : selectedState ? 7 : 5}
                  />
                </MapContainer>
              )}
              {loadingDistricts && (
                <div className="agri-map-loading" role="status">
                  Loading district boundaries…
                </div>
              )}
              {boundaryError && states && (
                <div className="agri-map-loading agri-map-loading--error" role="alert">
                  <span>{boundaryError}</span>
                  {selectedState && !districts && (
                    <button
                      type="button"
                      onClick={() => {
                        setBoundaryError(null);
                        setDistrictLoadAttempt((attempt) => attempt + 1);
                      }}
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="agri-map-card__footer">
              <span>
                Boundary shapes are visual references, not official or
                survey-grade maps.
              </span>
              <span>© OpenStreetMap contributors</span>
            </div>
          </div>

          <aside
            className="agri-map-data-card"
            aria-labelledby="regional-data-title"
          >
            <div className="agri-map-data-card__heading">
              <div>
                <p className="agri-map-eyebrow">REGIONAL SNAPSHOT</p>
                <h2 id="regional-data-title">{locationName}</h2>
              </div>
              <span className="agri-map-data-card__status">
                {snapshotLoading
                  ? "Updating"
                  : snapshotError
                    ? "Source unavailable"
                    : "Live sources"}
              </span>
            </div>

            <p className="agri-map-data-card__notice">
              Weather and soil values use the selected region’s reference point.
              Census and crop statistics need configured government datasets;
              unverified estimates are never substituted.
            </p>
            <button
              className="agri-map-data-card__refresh"
              type="button"
              disabled={snapshotLoading}
              onClick={() => setSnapshotRefresh((value) => value + 1)}
            >
              {snapshotLoading ? "Refreshing sources…" : "Refresh regional data"}
            </button>

            <dl className="agri-map-indicators">
              {indicators.map((indicator) => (
                <div className="agri-map-indicator" key={indicator.label}>
                  <dt>
                    <span aria-hidden="true">{indicator.icon}</span>
                    {indicator.label}
                  </dt>
                  <dd
                    className={`agri-map-indicator__value agri-map-indicator__value--${snapshot?.metrics[indicator.key]?.status ?? "loading"}`}
                  >
                    {snapshotLoading && !snapshot
                      ? "Loading…"
                      : metricValue(snapshot?.metrics[indicator.key])}
                    {snapshot?.metrics[indicator.key]?.year
                      ? ` (${snapshot.metrics[indicator.key].year})`
                      : ""}
                  </dd>
                  {snapshot?.metrics[indicator.key]?.detail && (
                    <p className="agri-map-indicator__detail">
                      {snapshot.metrics[indicator.key].detail}
                    </p>
                  )}
                  {snapshot?.metrics[indicator.key]?.source && (
                    <p className="agri-map-indicator__source">
                      Source: {snapshot.metrics[indicator.key].source}
                      {snapshot.metrics[indicator.key].period
                        ? ` · ${snapshot.metrics[indicator.key].period}`
                        : ""}
                    </p>
                  )}
                </div>
              ))}
            </dl>
            {snapshotError && (
              <div className="agri-map-snapshot-error" role="alert">
                <span>{snapshotError}</span>
                <button
                  type="button"
                  onClick={() => setSnapshotRefresh((value) => value + 1)}
                >
                  Retry
                </button>
              </div>
            )}
            <p className="agri-map-snapshot-footnote">
              Rainfall and temperature are modelled at a representative point;
              soil profile is a gridded prediction, not a field test. Statistics
              and advice show their publication year when supplied by the
              dataset.
              {snapshot?.fetched_at
                ? ` Last checked ${new Date(snapshot.fetched_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
                : ""}
            </p>
          </aside>
        </section>

        <p className="agri-map-source-note">
          State and district boundary geometry is derived from OpenStreetMap.
          Village-level boundaries and indicators are not available here. This
          is not an official Government of India or survey-grade map.{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            OpenStreetMap data terms
          </a>
        </p>
      </div>
    </main>
  );
}
