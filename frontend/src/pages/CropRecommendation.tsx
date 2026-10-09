import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api";

type WeatherLocation = {
  name: string;
  state?: string;
  district?: string;
  country?: string;
  latitude: number;
  longitude: number;
};

type SoilProperty = {
  label: string;
  value: string | number;
  unit?: string;
};

type SoilDepth = {
  depth: string;
  properties: Record<string, SoilProperty>;
};

type CropReport = {
  crop: string;
  latest_report_date: string;
  report_count: number;
  market_count: number;
};

function isCropReport(value: string | { crop: string; production: string | number } | CropReport): value is CropReport {
  return typeof value !== "string" && "latest_report_date" in value;
}

type Metric = {
  status: "available" | "unavailable" | "error";
  value: string | number | string[] | { crop: string; production: string | number }[] | CropReport[] | null;
  unit?: string;
  source?: string;
  period?: string;
  year?: string | number;
  detail?: string;
  profile?: SoilDepth[];
};

type LocationAnalysis = {
  fetched_at: string;
  reference_point: { latitude: number; longitude: number };
  location: { state: string | null; district: string | null };
  metrics: Record<string, Metric>;
};

function locationLabel(location: WeatherLocation): string {
  return [...new Set(
    [location.name, location.district, location.state, location.country].filter(
      (part): part is string => Boolean(part),
    ),
  )].join(", ");
}

const climateFields = [
  { key: "temperature", label: "Temperature", unit: "°C", min: -50, max: 60, placeholder: "e.g. 25" },
  { key: "humidity", label: "Humidity", unit: "%", min: 0, max: 100, placeholder: "e.g. 70" },
  { key: "rainfall", label: "30-day rainfall", unit: "mm", min: 0, max: 10000, placeholder: "e.g. 200" },
] as const;

function CropRecommendation() {
  const [nitrogen, setNitrogen] = useState("");
  const [phosphorus, setPhosphorus] = useState("");
  const [potassium, setPotassium] = useState("");
  const [temperature, setTemperature] = useState("");
  const [humidity, setHumidity] = useState("");
  const [rainfall, setRainfall] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [locations, setLocations] = useState<WeatherLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<WeatherLocation | null>(null);
  const [locationAnalysis, setLocationAnalysis] = useState<LocationAnalysis | null>(null);
  const [searching, setSearching] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [recommendation, setRecommendation] = useState<{
    crop: string;
    rationale: string;
  } | null>(null);
  const [error, setError] = useState("");

  async function searchLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locationQuery.trim().length < 2) {
      setLocationError("Enter at least two characters to search for a location.");
      return;
    }
    setSearching(true);
    setLocationError("");
    setLocations([]);
    try {
      const params = new URLSearchParams({ query: locationQuery.trim() });
      const result = await apiRequest<{ locations: WeatherLocation[] }>(
        `/api/weather/search?${params}`,
      );
      setLocations(result.locations);
      if (result.locations.length === 0) {
        setLocationError("No matching locations were found.");
      }
    } catch (reason) {
      setLocationError(
        reason instanceof Error ? reason.message : "Location search is unavailable.",
      );
    } finally {
      setSearching(false);
    }
  }

  async function analyzeLocation(location: WeatherLocation) {
    setSelectedLocation(location);
    setLocationQuery(locationLabel(location));
    setLocations([]);
    setLocationAnalysis(null);
    setAnalyzing(true);
    setLocationError("");
    setRecommendation(null);
    setTemperature("");
    setHumidity("");
    setRainfall("");
    const params = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
    });
    if (location.state) params.set("state", location.state);
    if (location.district) params.set("district", location.district);

    try {
      const analysis = await apiRequest<LocationAnalysis>(
        `/api/agriculture/snapshot?${params}`,
      );
      setLocationAnalysis(analysis);
      const metrics = analysis.metrics;
      if (metrics.temperature?.status === "available" && metrics.temperature.value !== null) {
        setTemperature(String(metrics.temperature.value));
      }
      if (metrics.humidity?.status === "available" && metrics.humidity.value !== null) {
        setHumidity(String(metrics.humidity.value));
      }
      if (metrics.rainfall?.status === "available" && metrics.rainfall.value !== null) {
        setRainfall(String(metrics.rainfall.value));
      }
    } catch (reason) {
      setLocationError(
        reason instanceof Error ? reason.message : "Location analysis is unavailable.",
      );
    } finally {
      setAnalyzing(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setRecommendation(null);

    if (!nitrogen || !phosphorus || !potassium || !temperature || !humidity || !rainfall) {
      setError("Enter the NPK values from a soil test and all climate values, or analyze a location to fill available climate values.");
      return;
    }

    const n = Number(nitrogen);
    const p = Number(phosphorus);
    const k = Number(potassium);
    const temp = Number(temperature);
    const hum = Number(humidity);
    const rain = Number(rainfall);

    if (
      ![n, p, k, temp, hum, rain].every(Number.isFinite) ||
      n < 0 ||
      p < 0 ||
      k < 0 ||
      temp < -50 ||
      temp > 60 ||
      hum < 0 ||
      hum > 100 ||
      rain < 0
    ) {
      setError("Enter valid non-negative NPK and rainfall values, temperature between -50 and 60°C, and humidity between 0 and 100%.");
      return;
    }

    let result: { crop: string; rationale: string } | null = null;
    if (rain > 150 && hum > 70 && temp > 20 && temp < 35) {
      result = {
        crop: "Rice",
        rationale: "This prototype rule matched high 30-day rainfall, high humidity, and a warm temperature.",
      };
    } else if (rain < 80 && temp > 20 && temp < 35) {
      result = {
        crop: "Millet",
        rationale: "This prototype rule matched lower 30-day rainfall and a warm temperature.",
      };
    } else if (temp < 20 && rain > 60) {
      result = {
        crop: "Wheat",
        rationale: "This prototype rule matched a cooler temperature and more than 60 mm of 30-day rainfall.",
      };
    } else if (n > 80 && p > 40 && k > 40 && rain > 100) {
      result = {
        crop: "Maize",
        rationale: "This prototype rule matched the entered NPK readings and more than 100 mm of 30-day rainfall.",
      };
    } else if (temp > 25 && hum > 60 && rain > 100) {
      result = {
        crop: "Cotton",
        rationale: "This prototype rule matched a warm, humid profile with higher 30-day rainfall.",
      };
    }

    if (!result) {
      setError("No prototype rule matched this profile. Review the location analysis and consult local, season-specific agronomic advice.");
      return;
    }
    setRecommendation(result);
  }

  function handleReset() {
    setNitrogen("");
    setPhosphorus("");
    setPotassium("");
    setTemperature("");
    setHumidity("");
    setRainfall("");
    setRecommendation(null);
    setError("");
  }

  function metricValue(metric: Metric | undefined): string {
    if (!metric || metric.status !== "available" || metric.value === null) return "Unavailable";
    if (Array.isArray(metric.value)) {
      return metric.value.map((value) => typeof value === "string" ? value : value.crop).join(", ");
    }
    return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
  }

  const locationMetrics = [
    { key: "temperature", label: "Current temperature" },
    { key: "humidity", label: "Current humidity" },
    { key: "rainfall", label: "Rainfall · last 30 days" },
    { key: "soil_profile", label: "Soil profile" },
    { key: "crop_reports", label: "Crops reported in the area" },
    { key: "crop_recommendation", label: "Published local advisory" },
  ];

  return (
    <div className="min-h-screen bg-green-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-green-700">AgriGO</h1>
            <p className="text-sm text-gray-500">Crop Recommendation</p>
          </div>
          <Link
            to="/farmer-dashboard"
            className="rounded-lg bg-green-600 px-5 py-2 font-semibold text-white hover:bg-green-700"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-6">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-green-700">Field planning</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">Crop suitability check</h2>
          <p className="mt-2 max-w-3xl text-slate-600">
            Analyze a location to load sourced climate and regional context, then add NPK readings from your soil test.
          </p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
          <section className="rounded-2xl border border-green-100 bg-white p-5 shadow-sm sm:p-7">
            <h3 className="text-xl font-bold text-slate-900">Field conditions</h3>
            <p className="mt-1 text-sm text-slate-600">
              Climate values can be loaded from a location and edited. Enter NPK exactly as shown on a soil-test report.
            </p>

            <form onSubmit={handleSubmit} className="mt-6">
              <h4 className="text-sm font-bold uppercase tracking-wide text-slate-700">Soil test · NPK</h4>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                {[
                  { label: "Nitrogen (N)", value: nitrogen, set: setNitrogen },
                  { label: "Phosphorus (P)", value: phosphorus, set: setPhosphorus },
                  { label: "Potassium (K)", value: potassium, set: setPotassium },
                ].map((field) => (
                  <label key={field.label} className="block text-sm font-medium text-slate-700">
                    {field.label}
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={field.value}
                      onChange={(event) => field.set(event.target.value)}
                      placeholder="Soil-test value"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                    />
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                NPK is not inferred from satellite or regional weather data. Use a recent field soil test; the prototype does not provide fertilizer dosage.
              </p>

              <h4 className="mt-6 text-sm font-bold uppercase tracking-wide text-slate-700">Climate profile</h4>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                {climateFields.map((field) => {
                  const setter = field.key === "temperature"
                    ? setTemperature
                    : field.key === "humidity"
                      ? setHumidity
                      : setRainfall;
                  const value = field.key === "temperature"
                    ? temperature
                    : field.key === "humidity"
                      ? humidity
                      : rainfall;
                  return (
                    <label key={field.key} className="block text-sm font-medium text-slate-700">
                      {field.label} ({field.unit})
                      <input
                        type="number"
                        min={field.min}
                        max={field.max}
                        step="any"
                        value={value}
                        onChange={(event) => setter(event.target.value)}
                        placeholder={field.placeholder}
                        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                      />
                    </label>
                  );
                })}
              </div>

              {error && (
                <div className="mt-5 rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700" role="alert">
                  {error}
                </div>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="rounded-lg bg-green-700 px-5 py-3 font-semibold text-white hover:bg-green-800"
                >
                  Analyze crop suitability
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Clear values
                </button>
              </div>
            </form>

            {recommendation && (
              <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-5" role="status">
                <p className="text-xs font-bold uppercase tracking-wide text-green-800">Prototype match</p>
                <h3 className="mt-1 text-2xl font-bold text-green-900">{recommendation.crop}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-700">{recommendation.rationale}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-white/75 p-3 text-sm sm:grid-cols-3">
                  {[
                    ["Nitrogen (N)", nitrogen],
                    ["Phosphorus (P)", phosphorus],
                    ["Potassium (K)", potassium],
                    ["Temperature", `${temperature} °C`],
                    ["Humidity", `${humidity}%`],
                    ["Rainfall · 30 days", `${rainfall} mm`],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-slate-500">{label}</dt>
                      <dd className="font-semibold text-slate-900">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs leading-5 text-slate-600">
                  This transparent rule-based prototype is not trained machine learning or a planting instruction. Its current climate rules use temperature, humidity, and rainfall; NPK values are considered only by the prototype's maize rule because validated crop-specific nutrient thresholds are not configured. Confirm season, variety, irrigation, soil-test interpretation, and local agronomist advice before deciding.
                </p>
                {selectedLocation && (
                  <p className="mt-2 text-xs font-semibold text-green-900">
                    Location context: {[selectedLocation.name, selectedLocation.state, selectedLocation.country].filter(Boolean).join(", ")}
                  </p>
                )}
              </div>
            )}
          </section>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-green-700">Location analysis</p>
              <h3 className="mt-1 text-xl font-bold text-slate-900">Local conditions &amp; context</h3>
              <p className="mt-2 text-sm leading-5 text-slate-600">
                Search a town, district, or city to load modeled weather and available regional agriculture data.
              </p>
            </div>
            <form onSubmit={searchLocation} className="mt-4 flex gap-2">
              <input
                value={locationQuery}
                onChange={(event) => setLocationQuery(event.target.value)}
                placeholder="e.g. Mandya, Karnataka"
                aria-label="Search a location for crop analysis"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
              />
              <button
                type="submit"
                disabled={searching}
                className="rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60"
              >
                {searching ? "Searching…" : "Search"}
              </button>
            </form>

            {locations.length > 0 && (
              <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                {locations.map((location) => (
                  <button
                    key={`${location.latitude}-${location.longitude}`}
                    type="button"
                    onClick={() => void analyzeLocation(location)}
                    className="w-full px-3 py-3 text-left text-sm text-slate-700 hover:bg-green-50"
                  >
                    <span className="block font-semibold text-slate-900">{location.name}</span>
                    <span>{locationLabel(location)}</span>
                  </button>
                ))}
              </div>
            )}
            {locationError && (
              <p className="mt-3 text-sm text-amber-800" role="alert">{locationError}</p>
            )}

            {selectedLocation && (
              <div className="mt-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-slate-900">
                      {locationLabel(selectedLocation)}
                    </h4>
                    <p className="text-xs text-slate-500">
                      Reference point: {selectedLocation.latitude.toFixed(3)}, {selectedLocation.longitude.toFixed(3)}
                    </p>
                  </div>
                  {analyzing && <span className="text-xs font-medium text-green-700">Analyzing…</span>}
                </div>
                {locationAnalysis && (
                  <>
                    <dl className="mt-4 divide-y divide-slate-100">
                      {locationMetrics.map(({ key, label }) => {
                        const metric = locationAnalysis.metrics[key];
                        return (
                          <div key={key} className="py-3">
                            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                            {key === "soil_profile" && metric?.profile && metric.profile.length > 0 ? (
                              <dd className="mt-2 space-y-2">
                                {metric.profile.map((layer) => (
                                  <div key={layer.depth} className="rounded-lg bg-slate-50 p-3">
                                    <p className="text-xs font-bold text-slate-700">
                                      {layer.depth === "Reported soil-health sample" ? layer.depth : `${layer.depth} depth`}
                                    </p>
                                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                                      {Object.entries(layer.properties).map(([property, measurement]) => (
                                        <div key={property}>
                                          <dt className="text-xs text-slate-500">{measurement.label}</dt>
                                          <dd className="text-sm font-semibold text-slate-900">
                                            {measurement.value}{measurement.unit ? ` ${measurement.unit}` : ""}
                                          </dd>
                                        </div>
                                      ))}
                                    </dl>
                                  </div>
                                ))}
                              </dd>
                            ) : key === "crop_reports" && Array.isArray(metric?.value) ? (
                              <dd>
                                <div className="mt-2 space-y-2">
                                  {metric.value.filter(isCropReport).slice(0, 8).map((report) => (
                                    <div
                                      key={report.crop}
                                      className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
                                    >
                                      <span className="text-sm font-semibold text-slate-900">{report.crop}</span>
                                      <span className="text-right text-xs text-slate-600">
                                        {report.latest_report_date}
                                        <br />
                                        {report.report_count} reports · {report.market_count} {report.market_count === 1 ? "market" : "markets"}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                                {metric.value.filter(isCropReport).length > 8 && (
                                  <p className="mt-2 text-xs text-slate-500">
                                    Showing 8 of {metric.value.filter(isCropReport).length} reported commodities.
                                  </p>
                                )}
                              </dd>
                            ) : (
                              <dd className="mt-1 text-sm font-semibold text-slate-900">{metricValue(metric)}</dd>
                            )}
                            {metric?.source && (
                              <dd className="mt-0.5 text-xs text-slate-500">
                                {metric.source}{metric.period ? ` · ${metric.period}` : ""}
                              </dd>
                            )}
                            {metric?.detail && (
                              <dd className="mt-1 text-xs leading-5 text-slate-500">{metric.detail}</dd>
                            )}
                          </div>
                        );
                      })}
                    </dl>
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      Weather and SoilGrids values are modeled at the selected location’s reference point; rainfall is accumulated over the previous 30 completed days. Mandi reports identify commodities traded in the selected area, not every crop cultivated there. Soil-health dataset measurements are administrative-area records, not samples from the reference point.
                    </p>
                  </>
                )}
              </div>
            )}

            {!selectedLocation && (
              <div className="mt-5 rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                Analyze a location to see weather, recent rainfall, soil profile, reported crops, and any configured published advisory. NPK values still need a field soil test.
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

export default CropRecommendation;
