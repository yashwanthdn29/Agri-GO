import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api";

type DiseasePrediction = {
  crop: string;
  condition: string;
  confidence: number;
};

type DiseaseScreeningResponse = {
  status: "candidate" | "uncertain" | "crop_mismatch" | "unsupported_crop";
  predictions: DiseasePrediction[];
  model: string;
  model_revision: string;
  model_card: string;
};

const MAX_DISEASE_IMAGE_SIZE = 5 * 1024 * 1024;
const DISEASE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

function readImageAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read this image."));
        return;
      }
      const separator = reader.result.indexOf(",");
      if (separator < 0) {
        reject(new Error("Unable to read this image."));
        return;
      }
      resolve(reader.result.slice(separator + 1));
    };
    reader.onerror = () => reject(new Error("Unable to read this image."));
    reader.readAsDataURL(file);
  });
}

type ForecastResponse = {
  source: string;
  model: string;
  status: "insufficient_history" | "baseline_not_better" | "available";
  observed_days: number;
  required_days: number;
  training_days: number;
  validation_days: number;
  validation_mae: number | null;
  persistence_baseline_mae: number | null;
  as_of_date?: string;
  trend_per_day?: number;
  points: { date: string; modal_price: number }[];
  message: string;
  selection: {
    commodity: string;
    state: string | null;
    district: string | null;
    market: string | null;
  };
};

function formatDate(value: string | undefined) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

function formatRupees(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value)}`;
}

function ForecastChart({ points }: { points: ForecastResponse["points"] }) {
  const chart = useMemo(() => {
    if (points.length === 0) return null;
    const width = 720;
    const height = 220;
    const values = points.map((point) => point.modal_price);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const coordinates = points.map((point, index) => ({
      x: 32 + (index / Math.max(1, points.length - 1)) * (width - 64),
      y: 24 + ((max - point.modal_price) / range) * (height - 64),
      point,
    }));
    return {
      width,
      height,
      min,
      max,
      line: coordinates.map(({ x, y }) => `${x},${y}`).join(" "),
      coordinates,
    };
  }, [points]);

  if (!chart) return null;
  return (
    <div className="overflow-x-auto">
      <div className="mb-2 flex justify-between text-xs text-slate-500">
        <span>{formatRupees(chart.max)}</span>
        <span>Experimental estimate · ₹/quintal</span>
        <span>{formatRupees(chart.min)}</span>
      </div>
      <svg
        className="h-56 min-w-[600px] w-full"
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        role="img"
        aria-label="Experimental market price baseline for the next seven days"
      >
        <title>Time-trend baseline based on stored official market reports</title>
        <line x1="32" x2={chart.width - 32} y1={chart.height - 30} y2={chart.height - 30} stroke="#cbd5e1" />
        <polyline
          points={chart.line}
          fill="none"
          stroke="#047857"
          strokeWidth="3"
          strokeDasharray="7 5"
          strokeLinejoin="round"
        />
        {chart.coordinates.map(({ x, y, point }) => (
          <circle key={point.date} cx={x} cy={y} r="5" fill="#047857">
            <title>{formatDate(point.date)}: {formatRupees(point.modal_price)}</title>
          </circle>
        ))}
        <text x="32" y={chart.height - 8} fill="#64748b" fontSize="11">
          {formatDate(points[0].date)}
        </text>
        <text x={chart.width - 32} y={chart.height - 8} fill="#64748b" fontSize="11" textAnchor="end">
          {formatDate(points[points.length - 1].date)}
        </text>
      </svg>
    </div>
  );
}

export default function IntelligenceLab() {
  const [commodities, setCommodities] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [districtOptionsState, setDistrictOptionsState] = useState("");
  const [commodity, setCommodity] = useState("");
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [error, setError] = useState("");
  const [diseaseImage, setDiseaseImage] = useState<File | null>(null);
  const [diseaseCrop, setDiseaseCrop] = useState("");
  const [diseaseResult, setDiseaseResult] = useState<DiseaseScreeningResponse | null>(null);
  const [diseaseLoading, setDiseaseLoading] = useState(false);
  const [diseaseError, setDiseaseError] = useState("");

  function chooseDiseaseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setDiseaseResult(null);
    setDiseaseError("");

    if (!file) {
      setDiseaseImage(null);
      return;
    }
    if (!DISEASE_IMAGE_TYPES.includes(file.type)) {
      setDiseaseImage(null);
      setDiseaseError("Choose a JPEG, PNG, or WebP image.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_DISEASE_IMAGE_SIZE) {
      setDiseaseImage(null);
      setDiseaseError("Image must be 5 MB or smaller.");
      event.target.value = "";
      return;
    }
    setDiseaseImage(file);
  }

  async function analyzeDiseaseImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!diseaseImage || diseaseLoading) return;

    setDiseaseLoading(true);
    setDiseaseError("");
    setDiseaseResult(null);
    try {
      const imageBase64 = await readImageAsBase64(diseaseImage);
      const result = await apiRequest<DiseaseScreeningResponse>("/api/crop-disease/screen", {
        method: "POST",
        body: JSON.stringify({
          image_base64: imageBase64,
          media_type: diseaseImage.type,
          crop_name: diseaseCrop.trim() || null,
        }),
      });
      setDiseaseResult(result);
    } catch (reason) {
      setDiseaseError(
        reason instanceof Error ? reason.message : "Unable to analyze this crop image.",
      );
    } finally {
      setDiseaseLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void Promise.all([
      apiRequest<{ commodities: string[] }>("/api/market-intelligence/commodities"),
      apiRequest<{ states: string[] }>("/api/market-intelligence/states"),
    ])
      .then(([commodityResult, stateResult]) => {
        if (!active) return;
        setCommodities(commodityResult.commodities);
        setStates(stateResult.states);
        setCommodity((current) => current || commodityResult.commodities[0] || "");
        setError("");
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Market data filters are unavailable.");
        }
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!state) return () => {
      active = false;
    };
    const params = new URLSearchParams({ state });
    void apiRequest<{ districts: string[] }>(`/api/market-intelligence/districts?${params}`)
      .then((result) => {
        if (active) {
          setDistrictOptionsState(state);
          setDistricts(result.districts);
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Districts are unavailable.");
      });
    return () => {
      active = false;
    };
  }, [state]);

  useEffect(() => {
    let active = true;
    if (!commodity) return () => {
      active = false;
    };
    const params = new URLSearchParams({ commodity });
    if (state) params.set("state", state);
    if (district) params.set("district", district);
    void apiRequest<ForecastResponse>(`/api/market-intelligence/forecast?${params}`)
      .then((result) => {
        if (active) setForecast(result);
      })
      .catch((reason: unknown) => {
        if (active) {
          setForecast(null);
          setError(reason instanceof Error ? reason.message : "The market analysis is unavailable.");
        }
      });
    return () => {
      active = false;
    };
  }, [commodity, state, district]);

  const availableDistricts = districtOptionsState === state ? districts : [];
  const forecastMatchesSelection = forecast
    && forecast.selection.commodity === commodity
    && forecast.selection.state === (state || null)
    && forecast.selection.district === (district || null);
  const forecastPending = Boolean(commodity && !forecastMatchesSelection && !error);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-700">
              AgriGO · Research &amp; decision support
            </p>
            <h1 className="mt-1 text-xl font-bold text-slate-900">Intelligence Lab</h1>
          </div>
          <Link
            to="/explore"
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Explore tools
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <section className="rounded-3xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-800 p-6 text-white sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200">
            Data science · Machine learning · Deep learning
          </p>
          <h2 className="mt-3 max-w-3xl text-3xl font-bold sm:text-4xl">
            Evidence first. Predictions only when the data earns them.
          </h2>
          <p className="mt-4 max-w-3xl leading-7 text-emerald-50">
            AgriGO distinguishes reported observations, evaluated statistical baselines,
            and models that are not yet validated. This lab uses stored Government of
            India mandi reports and never substitutes demo data when a source is empty.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/market-prices" className="rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-emerald-950 hover:bg-emerald-50">
              View market reports
            </Link>
            <a
              href="https://www.data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi"
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-emerald-300 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800"
            >
              Verify official source ↗
            </a>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Machine learning · experimental</p>
            <h3 className="mt-2 text-lg font-bold text-slate-900">Mandi trend baseline</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              A transparent linear-regression baseline is evaluated on later dates and must beat a persistence baseline before showing estimates.
            </p>
          </article>
          <article className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Deep learning · experimental</p>
            <h3 className="mt-2 text-lg font-bold text-slate-900">Crop disease imaging</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Analyze an image with a pinned MobileNetV2 model. It has 38 PlantVillage classes, but weak results on a small field-style test.
            </p>
            <a href="#crop-disease-analysis" className="mt-3 inline-flex text-sm font-semibold text-amber-900 underline">
              Analyze and review evidence
            </a>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Agronomy · prototype</p>
            <h3 className="mt-2 text-lg font-bold text-slate-900">Crop suitability</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              The current crop tool is a labeled heuristic, not a trained recommendation model or planting instruction.
            </p>
            <Link to="/crop-recommendation" className="mt-3 inline-flex text-sm font-semibold text-emerald-800 underline">
              Review prototype limits
            </Link>
          </article>
        </section>

        <section
          id="crop-disease-analysis"
          className="scroll-mt-6 rounded-2xl border border-amber-200 bg-white p-5 shadow-sm sm:p-7"
          aria-labelledby="crop-disease-analysis-title"
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.7fr)]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-amber-800">
                Deep-learning image analysis · research demo
              </p>
              <h2 id="crop-disease-analysis-title" className="mt-1 text-2xl font-bold text-slate-900">
                Crop disease imaging
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Upload a leaf image to run AgriGO’s actual MobileNetV2 classifier. The
                model returns three class scores from its 38 PlantVillage labels; scores
                are not field probabilities, and unsupported crops cannot be diagnosed.
                Running the classifier requires a farmer or combined-role account.
              </p>
              <Link to="/login" className="mt-2 inline-flex text-sm font-semibold text-emerald-800 underline">
                Sign in to the farmer workspace
              </Link>
            </div>
            <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              <strong>Field performance matters.</strong> The model card reports 4/25
              correct top-1 predictions (16%) on its small PlantDoc field-style test.
              Its reported 99.17% PlantVillage result is on a different, controlled
              test set and is not independent field validation.
              Treat output as a demonstration, not farm or treatment advice.
            </aside>
          </div>

          <form onSubmit={analyzeDiseaseImage} className="mt-6 grid gap-5 lg:grid-cols-[1fr_260px]">
            <div>
              <label htmlFor="lab-crop-disease-image" className="block text-sm font-semibold text-slate-700">
                Leaf image
              </label>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                JPEG, PNG, or WebP, up to 5 MB. A close-up photo is most useful.
              </p>
              <input
                id="lab-crop-disease-image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={chooseDiseaseImage}
                className="mt-3 block w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-emerald-100 file:px-4 file:py-2 file:font-semibold file:text-emerald-900"
              />
            </div>
            <div className="flex flex-col justify-end gap-3">
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                Crop, if known
                <input
                  value={diseaseCrop}
                  onChange={(event) => setDiseaseCrop(event.target.value)}
                  maxLength={80}
                  placeholder="e.g. tomato"
                  className="rounded-lg border border-slate-300 px-3 py-2.5 font-normal"
                />
              </label>
              <button
                type="submit"
                disabled={!diseaseImage || diseaseLoading}
                className="rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {diseaseLoading ? "Loading model and analyzing…" : "Analyze crop image"}
              </button>
            </div>
          </form>

          {diseaseError && (
            <div className="mt-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-900" role="alert">
              <p>{diseaseError}</p>
              {diseaseError.toLowerCase().includes("farmer") && (
                <Link to="/login" className="mt-2 inline-flex font-semibold underline">
                  Sign in with a farmer account
                </Link>
              )}
            </div>
          )}

          {diseaseResult && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5" aria-live="polite">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-bold text-slate-900">
                  {diseaseResult.status === "candidate"
                    ? "Top class passed the screening threshold · not a diagnosis"
                    : diseaseResult.status === "crop_mismatch"
                      ? "Top class conflicts with the crop you entered"
                      : diseaseResult.status === "unsupported_crop"
                        ? "This crop is outside the model’s supported classes"
                        : "Uncertain · no class passed the screening threshold"}
                </h3>
                <span className="text-xs text-slate-500">
                  {diseaseResult.model} · revision {diseaseResult.model_revision.slice(0, 12)} · 38 classes
                </span>
              </div>
              {diseaseResult.predictions.length > 0 ? (
                <ol className="mt-3 grid gap-2 md:grid-cols-3">
                  {diseaseResult.predictions.map((prediction, index) => (
                    <li key={`${prediction.crop}-${prediction.condition}`} className="rounded-lg bg-white p-3 text-sm">
                      <strong className="block text-slate-800">
                        {index + 1}. {prediction.crop} — {prediction.condition}
                      </strong>
                      <span className="mt-1 block text-slate-600">
                        Model score: {(prediction.confidence * 100).toFixed(1)}%
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  This model does not support the crop you entered. It cannot provide a
                  meaningful screening for it.
                </p>
              )}
              <p className="mt-3 text-xs leading-5 text-slate-500">
                These are model scores, not calibrated field probabilities. The
                PlantVillage dataset does not represent every field condition; have
                symptoms checked by a local KVK or agriculture officer before acting.
              </p>
              <a
                href={diseaseResult.model_card}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex text-sm font-semibold text-emerald-800 underline"
              >
                Review model card, license, and evaluation ↗
              </a>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-emerald-700">Model evaluation</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">Mandi price trend experiment</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Uses observed daily modal prices in ₹/quintal. The last 20% of reported dates are held out for validation; no future reports are used to fit the model.
              </p>
            </div>
            {forecast && (
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
                Source: {forecast.source}
              </span>
            )}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              Commodity
              <select
                value={commodity}
                onChange={(event) => {
                  setError("");
                  setCommodity(event.target.value);
                }}
                disabled={loadingOptions || commodities.length === 0}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5"
              >
                {commodities.length === 0 && <option value="">No stored commodities</option>}
                {commodities.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              State (optional)
              <select
                value={state}
                onChange={(event) => {
                  setError("");
                  setState(event.target.value);
                  setDistrict("");
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5"
              >
                <option value="">All available states</option>
                {states.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              District (optional)
              <select
                value={district}
                onChange={(event) => {
                  setError("");
                  setDistrict(event.target.value);
                }}
                disabled={!state || availableDistricts.length === 0}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 disabled:bg-slate-100"
              >
                <option value="">All districts</option>
                {availableDistricts.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>

          {error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}
          {forecastPending && <p className="mt-5 text-sm text-slate-500" role="status">Evaluating stored observations…</p>}
          {!forecastPending && forecastMatchesSelection && forecast && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900">{forecast.model}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {forecast.observed_days} distinct report dates · {forecast.training_days} training · {forecast.validation_days} held out
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                  forecast.status === "available"
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-amber-100 text-amber-900"
                }`}>
                  {forecast.status === "available"
                    ? "Beat baseline on holdout"
                    : forecast.status === "baseline_not_better"
                      ? "No validated forecast"
                      : "History still collecting"}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-700">{forecast.message}</p>
              {forecast.validation_mae !== null && forecast.persistence_baseline_mae !== null && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Holdout model MAE</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">₹{forecast.validation_mae.toFixed(2)}/quintal</p>
                  </div>
                  <div className="rounded-lg bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last-price baseline MAE</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">₹{forecast.persistence_baseline_mae.toFixed(2)}/quintal</p>
                  </div>
                </div>
              )}
              {forecast.points.length > 0 && (
                <div className="mt-5 rounded-lg bg-white p-4">
                  <div className="flex flex-wrap justify-between gap-2">
                    <h4 className="font-semibold text-slate-900">Seven-day experimental trend</h4>
                    <p className="text-sm text-slate-500">As of {formatDate(forecast.as_of_date)}</p>
                  </div>
                  <ForecastChart points={forecast.points} />
                </div>
              )}
              <p className="mt-4 text-xs leading-5 text-slate-500">
                This one-feature time-trend baseline does not model seasonality, weather, arrivals, policy changes, or market closure days. Estimates are research outputs, not guaranteed prices or financial advice.
              </p>
            </div>
          )}
          {!loadingOptions && commodities.length === 0 && !error && (
            <p className="mt-5 rounded-lg bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              No AGMARKNET observations are stored yet. Forecasting is disabled until the official feed is configured and enough distinct reports have been collected. No sample prices or predictions are shown.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-xl font-bold text-slate-900">How AgriGO handles evidence</h2>
          <ol className="mt-4 grid gap-4 md:grid-cols-4">
            {[
              ["01", "Source", "Use dated government market observations and retain their provenance."],
              ["02", "Validate", "Normalize records, reject invalid prices, and avoid duplicate observations."],
              ["03", "Evaluate", "Hold out later dates and compare the model against a simple baseline."],
              ["04", "Disclose", "Show a forecast only when it beats that baseline; otherwise explain why not."],
            ].map(([number, title, detail]) => (
              <li key={number} className="rounded-xl bg-slate-50 p-4">
                <span className="text-xs font-bold tracking-widest text-emerald-700">{number}</span>
                <h3 className="mt-2 font-bold text-slate-900">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">{detail}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
