import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { apiRequest } from "../api";
import {
  Circle,
  MapContainer,
  Marker,
  Polygon,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";
import "./AgmarknetMap.css";

function calculatePolygonAreaSqM(points: LatLngTuple[]): number {
  if (points.length < 3) return 0;

  const earthRadius = 6371000;
  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const lat1 = (current[0] * Math.PI) / 180;
    const lat2 = (next[0] * Math.PI) / 180;
    const lng1 = (current[1] * Math.PI) / 180;
    const lng2 = (next[1] * Math.PI) / 180;

    area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  return Math.abs((area * earthRadius * earthRadius) / 2);
}

type BoundaryMode = "tap" | "circle" | null;

type MapLocation = {
  name: string;
  state?: string;
  country?: string;
  latitude: number;
  longitude: number;
};

function FarmMeasurementTool({
  mode,
  onMapClick,
}: {
  mode: BoundaryMode;
  onMapClick: (point: LatLngTuple) => void;
}) {
  useMapEvents({
    click(event) {
      if (!mode) return;
      onMapClick([event.latlng.lat, event.latlng.lng]);
    },
  });

  return null;
}

function MapFocus({ location }: { location: MapLocation | null }) {
  const map = useMap();

  useEffect(() => {
    if (location) map.flyTo([location.latitude, location.longitude], 14);
  }, [location, map]);

  return null;
}

export default function AgmarknetMap() {
  const [boundaryMode, setBoundaryMode] = useState<BoundaryMode>(null);
  const [farmPoints, setFarmPoints] = useState<LatLngTuple[]>([]);
  const [circleCenter, setCircleCenter] = useState<LatLngTuple | null>(null);
  const [circleRadius, setCircleRadius] = useState(250);
  const [mapSearch, setMapSearch] = useState("");
  const [searchResults, setSearchResults] = useState<MapLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const [mapError, setMapError] = useState("");
  const [focusedLocation, setFocusedLocation] = useState<MapLocation | null>(null);

  const farmAreaSqM =
    boundaryMode === "circle" || circleCenter
      ? Math.PI * circleRadius * circleRadius
      : calculatePolygonAreaSqM(farmPoints);

  const farmAreaHectares = farmAreaSqM / 10000;
  const farmAreaAcres = farmAreaSqM / 4046.86;

  function handleMapClick(point: LatLngTuple) {
    if (boundaryMode === "tap") {
      setFarmPoints((current) => [...current, point]);
    } else if (boundaryMode === "circle") {
      setCircleCenter(point);
      setBoundaryMode(null);
    }
  }

  function clearMeasurement() {
    setFarmPoints([]);
    setCircleCenter(null);
    setBoundaryMode(null);
  }

  async function searchLocations(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mapSearch.trim().length < 2) {
      setMapError("Enter at least two characters to search for a location.");
      return;
    }
    setSearching(true);
    setMapError("");
    setSearchResults([]);
    try {
      const params = new URLSearchParams({ query: mapSearch.trim() });
      const result = await apiRequest<{ locations: MapLocation[] }>(
        `/api/weather/search?${params}`,
      );
      setSearchResults(result.locations);
      if (result.locations.length === 0) {
        setMapError("No matching locations were found.");
      }
    } catch (reason) {
      setMapError(
        reason instanceof Error ? reason.message : "Location search is unavailable.",
      );
    } finally {
      setSearching(false);
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMapError("This browser does not provide location services.");
      return;
    }
    setMapError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = {
          name: "Current location",
          latitude: coords.latitude,
          longitude: coords.longitude,
        };
        setFocusedLocation(location);
        setMapSearch(location.name);
        setSearchResults([]);
      },
      (error) => {
        setMapError(
          error.code === error.PERMISSION_DENIED
            ? "Allow location access in your browser to use GPS."
            : "Could not determine your current location. Try searching for a place.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  const polygonPath = farmPoints.length > 0 ? [...farmPoints, farmPoints[0]] : [];

  return (
    <main className="agmarknet-page">
      <header className="agmarknet-header">
        <div>
          <p className="agmarknet-eyebrow">FIELD TOOLS</p>
          <h1>Farm map &amp; boundary tools</h1>
          <p className="agmarknet-description">
            Satellite imagery from Esri. Search a place or use GPS, then sketch a field
            boundary to estimate its area.
          </p>
        </div>
      </header>

      <section className="agmarknet-controls">
        <button
          type="button"
          className={boundaryMode === "tap" ? "farm-toggle" : "clear-button"}
          onClick={() => {
            setCircleCenter(null);
            setFarmPoints([]);
            setBoundaryMode((current) => current === "tap" ? null : "tap");
          }}
        >
          {boundaryMode === "tap" ? "Stop tap boundary" : "Tap to outline"}
        </button>

        <button
          type="button"
          className={boundaryMode === "circle" || circleCenter ? "farm-toggle" : "clear-button"}
          onClick={() => {
            setFarmPoints([]);
            setCircleCenter(null);
            setBoundaryMode((current) => current === "circle" ? null : "circle");
          }}
        >
          Circle boundary
        </button>

        <label className="agmarknet-radius-control">
          Circle radius: {circleRadius} m
          <input
            type="range"
            min="50"
            max="5000"
            step="50"
            value={circleRadius}
            onChange={(event) => setCircleRadius(Number(event.target.value))}
            aria-label="Circle boundary radius in metres"
          />
        </label>

        <button type="button" className="clear-button" onClick={useCurrentLocation}>
          Use GPS
        </button>

        <button type="button" className="clear-button" onClick={clearMeasurement}>
          Clear boundary
        </button>

        <form className="agmarknet-search" onSubmit={searchLocations}>
          <input
            value={mapSearch}
            onChange={(event) => {
              setMapSearch(event.target.value);
              setSearchResults([]);
            }}
            placeholder="Search city, district, or town"
            aria-label="Search map location"
          />
          <button type="submit" disabled={searching}>
            {searching ? "Searching…" : "Search"}
          </button>
        </form>

        {searchResults.length > 0 && (
          <div className="agmarknet-search-results">
            {searchResults.map((location) => (
              <button
                key={`${location.latitude}-${location.longitude}`}
                type="button"
                onClick={() => {
                  setFocusedLocation(location);
                  setMapSearch(location.name);
                  setSearchResults([]);
                  setMapError("");
                }}
              >
                {[location.name, location.state, location.country].filter(Boolean).join(", ")}
              </button>
            ))}
          </div>
        )}
        {mapError && <p className="agmarknet-map-error" role="alert">{mapError}</p>}
      </section>

      <section className="agmarknet-grid">
        <div className="agmarknet-map-panel">
          <MapContainer center={[13.08, 77.59]} zoom={7} scrollWheelZoom className="agmarknet-map">
            <TileLayer
              attribution='Imagery &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics, and the GIS User Community'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />

            {focusedLocation && (
              <>
                <MapFocus location={focusedLocation} />
                <Marker position={[focusedLocation.latitude, focusedLocation.longitude]} />
              </>
            )}

            {polygonPath.length > 0 && (
              <Polygon positions={polygonPath} pathOptions={{ color: "#16a34a", fillColor: "#86efac", fillOpacity: 0.4 }} />
            )}

            {circleCenter && (
              <Circle
                center={circleCenter}
                radius={circleRadius}
                pathOptions={{ color: "#047857", fillColor: "#6ee7b7", fillOpacity: 0.25 }}
              />
            )}

            <FarmMeasurementTool mode={boundaryMode} onMapClick={handleMapClick} />
          </MapContainer>
        </div>

        <aside className="agmarknet-sidebar">
          <div className="summary-card">
            <h2>Farm area</h2>
            {circleCenter ? (
              <>
                <div className="metric-row">
                  <span>Area</span>
                  <strong>{farmAreaHectares.toFixed(2)} ha</strong>
                </div>
                <div className="metric-row">
                  <span>Radius</span>
                  <strong>{circleRadius} m</strong>
                </div>
                <div className="metric-row">
                  <span>Acres</span>
                  <strong>{farmAreaAcres.toFixed(2)} ac</strong>
                </div>
              </>
            ) : farmPoints.length < 3 ? (
              <p>
                {boundaryMode === "tap"
                  ? "Tap at least three points on the map to outline a field."
                  : boundaryMode === "circle"
                    ? "Tap the map to place the centre of a circular boundary."
                    : "Choose tap outline or circle boundary to measure a field."}
              </p>
            ) : (
              <>
                <div className="metric-row">
                  <span>Area</span>
                  <strong>{farmAreaHectares.toFixed(2)} ha</strong>
                </div>
                <div className="metric-row">
                  <span>Acres</span>
                  <strong>{farmAreaAcres.toFixed(2)} ac</strong>
                </div>
                <div className="metric-row">
                  <span>Sq m</span>
                  <strong>{farmAreaSqM.toFixed(0)} m²</strong>
                </div>
              </>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
