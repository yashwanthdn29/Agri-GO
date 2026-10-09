import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "./api";
type WeatherLocation = {
  name: string;
  state?: string;
  country?: string;
  latitude: number;
  longitude: number;
};

type ForecastPoint = {
  timestamp: number;
  local_time: string;
  temperature_c: number;
  feels_like_c: number;
  condition: string;
  icon: string;
  precipitation_probability: number;
  rain_mm: number;
};

type WeatherData = {
  source: string;
  fetched_at: string;
  location: WeatherLocation & { timezone_offset_seconds: number };
  current: {
    observed_at: number;
    temperature_c: number;
    feels_like_c: number;
    minimum_c: number;
    maximum_c: number;
    humidity_percent: number;
    pressure_hpa: number;
    condition: string;
    description: string;
    icon: string;
    wind_speed_mps: number;
    wind_direction_degrees: number;
    cloud_cover_percent: number;
    visibility_m: number;
    rain_1h_mm: number;
    sunrise: number;
    sunset: number;
  };
  air_quality: {
    observed_at: number;
    index: number | null;
    components_ug_m3: Record<string, number>;
  };
  forecast: ForecastPoint[];
};

const LOCATION_STORAGE_KEY = "agrigoWeatherLocation";

function getSavedLocation(): WeatherLocation | null {
  try {
    const saved = localStorage.getItem(LOCATION_STORAGE_KEY);
    if (!saved) return null;
    const location = JSON.parse(saved) as WeatherLocation;
    return Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
      ? location
      : null;
  } catch {
    return null;
  }
}

function getDailyForecast(forecast: ForecastPoint[], timezoneOffset: number) {
  const days = new Map<string, {
    date: string;
    minimum: number;
    maximum: number;
    rainChance: number;
    rain: number;
    condition: string;
    icon: string;
  }>();

  for (const point of forecast) {
    const localDate = new Date((point.timestamp + timezoneOffset) * 1000)
      .toISOString()
      .slice(0, 10);
    const day = days.get(localDate);
    if (day) {
      day.minimum = Math.min(day.minimum, point.temperature_c);
      day.maximum = Math.max(day.maximum, point.temperature_c);
      day.rainChance = Math.max(day.rainChance, point.precipitation_probability);
      day.rain += point.rain_mm;
    } else {
      days.set(localDate, {
        date: localDate,
        minimum: point.temperature_c,
        maximum: point.temperature_c,
        rainChance: point.precipitation_probability,
        rain: point.rain_mm,
        condition: point.condition,
        icon: point.icon,
      });
    }
  }
  return [...days.values()];
}

function WeatherPanel({ compact = false }: { compact?: boolean }) {
  const [location, setLocation] = useState<WeatherLocation | null>(getSavedLocation);
  const [search, setSearch] = useState(() => getSavedLocation()?.name ?? "");
  const [suggestions, setSuggestions] = useState<WeatherLocation[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!location) return;
    let active = true;
    const refresh = async () => {
      setLoading(true);
      const params = new URLSearchParams({
        latitude: String(location.latitude),
        longitude: String(location.longitude),
      });
      try {
        const data = await apiRequest<WeatherData>(`/api/weather?${params}`);
        if (active) {
          setWeather(data);
          setError("");
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Weather data is unavailable.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [location, refreshKey]);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2 || location?.name === query) return;

    let active = true;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ query });
        const result = await apiRequest<{ locations: WeatherLocation[] }>(
          `/api/weather/search?${params}`,
        );
        if (active) {
          setSuggestions(result.locations);
          setError(result.locations.length === 0 ? "No matching locations found." : "");
        }
      } catch (reason) {
        if (active) {
          setSuggestions([]);
          setError(reason instanceof Error ? reason.message : "Location search failed.");
        }
      } finally {
        if (active) setSearching(false);
      }
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search, location]);

  async function searchLocations(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (search.trim().length < 2) {
      setError("Enter a city or town name to search.");
      return;
    }
    setSearching(true);
    setError("");
    setSuggestions([]);
    try {
      const params = new URLSearchParams({ query: search.trim() });
      const result = await apiRequest<{ locations: WeatherLocation[] }>(
        `/api/weather/search?${params}`,
      );
      setSuggestions(result.locations);
      if (result.locations.length === 0) setError("No matching locations found.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Location search failed.");
    } finally {
      setSearching(false);
    }
  }

  function selectLocation(nextLocation: WeatherLocation) {
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(nextLocation));
    setLocation(nextLocation);
    setSearch(nextLocation.name);
    setSuggestions([]);
    setWeather(null);
    setLoading(true);
    setError("");
  }

  const aqi = weather?.air_quality.index ?? null;
  const aqiLabel = aqi === null
    ? "Unavailable"
    : aqi <= 50
      ? "Good"
      : aqi <= 100
        ? "Moderate"
        : aqi <= 150
          ? "Sensitive groups"
          : aqi <= 200
            ? "Unhealthy"
            : aqi <= 300
              ? "Very unhealthy"
              : "Hazardous";
  const aqiStyle = aqi === null
    ? "bg-gray-100 text-gray-700"
    : aqi <= 50
      ? "bg-emerald-100 text-emerald-800"
      : aqi <= 100
        ? "bg-lime-100 text-lime-900"
        : aqi <= 150
          ? "bg-amber-100 text-amber-900"
          : aqi <= 200
            ? "bg-orange-100 text-orange-900"
            : "bg-rose-100 text-rose-900";
  const dailyForecast = weather
    ? getDailyForecast(weather.forecast, weather.location.timezone_offset_seconds)
    : [];
  const locationLabel = location
    ? [location.name, location.state, location.country].filter(Boolean).join(", ")
    : weather?.location.name;
  const rainExpected = weather?.forecast.slice(0, 8).some(
    (point) => point.precipitation_probability >= 60 || point.rain_mm >= 1,
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">
            Local weather
          </p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">
            {locationLabel || "Choose your location"}
          </h2>
          {weather && (
            <p className="mt-1 text-sm text-slate-500">
              Open-Meteo · fetched {new Date(weather.fetched_at).toLocaleTimeString()}
            </p>
          )}
        </div>
        {weather && (
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setRefreshKey((current) => current + 1);
            }}
            disabled={loading}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? "Updating..." : "Refresh"}
          </button>
        )}
      </div>

      <div className="mt-4">
        <form onSubmit={searchLocations} className="flex min-w-0 gap-2">
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setSuggestions([]);
              setSearching(false);
              setError("");
            }}
            placeholder="Search city or town"
            aria-label="Search weather by city"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-700"
          />
          <button
            type="submit"
            disabled={searching}
            className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </form>
      </div>

      {suggestions.length > 0 && (
        <div className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200">
          {suggestions.map((suggestion) => (
            <button
              key={`${suggestion.latitude}-${suggestion.longitude}`}
              type="button"
              onClick={() => selectLocation(suggestion)}
              className="block w-full px-4 py-3 text-left text-sm text-slate-800 hover:bg-emerald-50"
            >
              {[suggestion.name, suggestion.state, suggestion.country].filter(Boolean).join(", ")}
            </button>
          ))}
        </div>
      )}

      {error && <p role="alert" className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
      {!weather && !error && !loading && (
        <p className="mt-5 text-sm text-slate-600">
          Search for a city to see current conditions and forecasts.
        </p>
      )}
      {loading && !weather && <p className="mt-5 text-sm text-slate-500">Loading local conditions...</p>}

      {weather && (
        <>
          <div className="mt-5 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <div className="flex items-center gap-4 rounded-lg bg-emerald-50 p-4">
              {weather.current.icon && (
                <img
                  src={`https://openweathermap.org/img/wn/${weather.current.icon}@2x.png`}
                  alt={weather.current.description}
                  width="80"
                  height="80"
                />
              )}
              <div>
                <p className="text-4xl font-bold text-slate-900">{Math.round(weather.current.temperature_c)}°C</p>
                <p className="mt-1 capitalize text-slate-700">{weather.current.description}</p>
                <p className="mt-1 text-sm text-slate-500">
                  Feels like {Math.round(weather.current.feels_like_c)}° · H {Math.round(weather.current.maximum_c)}° / L {Math.round(weather.current.minimum_c)}°
                </p>
              </div>
            </div>
            <div className={`rounded-lg p-4 ${aqiStyle}`}>
              <p className="text-sm font-semibold">Air quality · US AQI</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-bold">{aqi || "--"}</span>
                <span className="font-semibold">{aqiLabel}</span>
              </div>
              <p className="mt-1 text-xs">US AQI scale; not the Indian CPCB AQI scale.</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <WeatherMetric label="Humidity" value={`${weather.current.humidity_percent}%`} />
            <WeatherMetric label="Wind" value={`${weather.current.wind_speed_mps} m/s`} />
            <WeatherMetric label="Rain · 1h" value={`${weather.current.rain_1h_mm} mm`} />
            <WeatherMetric label="Pressure" value={`${weather.current.pressure_hpa} hPa`} />
          </div>

          {compact ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <p className="text-sm text-slate-600">
                {rainExpected ? "Rain possible in the next 24 hours." : "No significant rain indicated in the next 24 hours."}
              </p>
              <Link to="/weather" className="text-sm font-semibold text-emerald-800 underline">
                Forecast & air details
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <WeatherMetric label="Cloud cover" value={`${weather.current.cloud_cover_percent}%`} />
                <WeatherMetric label="Visibility" value={`${(weather.current.visibility_m / 1000).toFixed(1)} km`} />
                <WeatherMetric label="Wind direction" value={`${weather.current.wind_direction_degrees}°`} />
                <WeatherMetric label="Sunrise" value={formatClock(weather.current.sunrise)} />
                <WeatherMetric label="Sunset" value={formatClock(weather.current.sunset)} />
                <WeatherMetric label="Observed" value={new Date(weather.current.observed_at * 1000).toLocaleTimeString()} />
              </div>

              <div className="mt-6 border-t border-slate-200 pt-5">
                <h3 className="font-bold text-slate-900">Air pollutants</h3>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <WeatherMetric label="PM2.5" value={pollutant(weather.air_quality.components_ug_m3.pm2_5)} />
                  <WeatherMetric label="PM10" value={pollutant(weather.air_quality.components_ug_m3.pm10)} />
                  <WeatherMetric label="Ozone" value={pollutant(weather.air_quality.components_ug_m3.o3)} />
                  <WeatherMetric label="NO₂" value={pollutant(weather.air_quality.components_ug_m3.no2)} />
                </div>
              </div>

              <div className="mt-6 border-t border-slate-200 pt-5">
                <h3 className="font-bold text-slate-900">5-day outlook</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {dailyForecast.map((day) => (
                    <div key={day.date} className="rounded-lg border border-slate-200 p-3">
                      <p className="text-sm font-semibold text-slate-800">{formatDay(day.date)}</p>
                      <img src={`https://openweathermap.org/img/wn/${day.icon}.png`} alt={day.condition} width="42" height="42" />
                      <p className="text-sm capitalize text-slate-600">{day.condition}</p>
                      <p className="mt-1 font-semibold text-slate-900">{Math.round(day.minimum)}° / {Math.round(day.maximum)}°</p>
                      <p className="mt-1 text-xs text-slate-500">Rain chance {day.rainChance}% · {day.rain.toFixed(1)} mm</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 border-t border-slate-200 pt-5">
                <h3 className="font-bold text-slate-900">Next 24 hours</h3>
                <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
                  {weather.forecast.slice(0, 8).map((point) => (
                    <div key={point.timestamp} className="min-w-24 rounded-lg bg-slate-50 p-3 text-center">
                      <p className="text-xs text-slate-500">{formatClock(point.timestamp)}</p>
                      <img src={`https://openweathermap.org/img/wn/${point.icon}.png`} alt={point.condition} width="42" height="42" className="mx-auto" />
                      <p className="font-semibold text-slate-900">{Math.round(point.temperature_c)}°</p>
                      <p className="mt-1 text-xs text-slate-500">Rain {point.precipitation_probability}%</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <p className="mt-5 text-xs text-slate-500">
            Open-Meteo data refreshes on the provider’s schedule. AgriGO checks every 15 minutes; air quality uses the US AQI scale.
          </p>
        </>
      )}
    </section>
  );
}

function WeatherMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function formatClock(timestamp: number) {
  return timestamp ? new Date(timestamp * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--";
}

function formatDay(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function pollutant(value: number | undefined) {
  return value === undefined ? "--" : `${value.toFixed(1)} μg/m³`;
}

export default WeatherPanel;