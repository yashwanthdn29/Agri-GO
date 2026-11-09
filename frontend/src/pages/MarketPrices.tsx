import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api";

type MarketPrice = {
  id: number;
  state: string;
  district: string;
  market: string;
  commodity: string;
  variety: string;
  arrival_date: string | null;
  min_price: number | null;
  max_price: number | null;
  modal_price: number | null;
  representative_price: number | null;
  reported_price: number | null;
  price_basis: string;
  unit: string;
  source: string;
};

type MarketResponse = {
  source: string;
  total: number;
  records: MarketPrice[];
};

type MarketSummary = {
  source: string;
  reference_date: string | null;
  latest_record: MarketPrice | null;
  minimum_price: number | null;
  maximum_price: number | null;
  average_reported_price: number | null;
  average_7_day: number | null;
  average_30_day: number | null;
  price_change_7_day: number | null;
  price_change_percent_7_day: number | null;
  trend: string;
  highest_price_market: { market: string; average_reported_price: number } | null;
  lowest_price_market: { market: string; average_reported_price: number } | null;
  market_price_difference: number | null;
};

type TrendPoint = {
  date: string;
  average_reported_price: number;
  record_count: number;
};

type MarketFilters = {
  commodity: string;
  state: string;
  district: string;
  market: string;
  start_date: string;
  end_date: string;
};

const emptyFilters: MarketFilters = {
  commodity: "",
  state: "",
  district: "",
  market: "",
  start_date: "",
  end_date: "",
};

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `₹${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(value)}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

function makeParams(filters: MarketFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

function PriceTrendChart({ points }: { points: TrendPoint[] }) {
  const chart = useMemo(() => {
    if (points.length === 0) return null;
    const width = 720;
    const height = 240;
    const padding = { top: 20, right: 18, bottom: 34, left: 18 };
    const values = points.map((point) => point.average_reported_price);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const drawableWidth = width - padding.left - padding.right;
    const drawableHeight = height - padding.top - padding.bottom;
    const coordinates = points.map((point, index) => ({
      x:
        padding.left +
        (points.length === 1 ? drawableWidth / 2 : (index / (points.length - 1)) * drawableWidth),
      y: padding.top + ((max - point.average_reported_price) / span) * drawableHeight,
      point,
    }));

    return {
      width,
      height,
      padding,
      min,
      max,
      line: coordinates.map(({ x, y }) => `${x},${y}`).join(" "),
      area: [
        `${coordinates[0].x},${height - padding.bottom}`,
        ...coordinates.map(({ x, y }) => `${x},${y}`),
        `${coordinates[coordinates.length - 1].x},${height - padding.bottom}`,
      ].join(" "),
      coordinates,
    };
  }, [points]);

  if (!chart) {
    return (
      <div className="flex min-h-56 items-center justify-center rounded-xl bg-slate-50 px-6 text-center text-sm text-slate-600">
        A historical chart will appear after AgriGO has collected actual market reports.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex justify-between text-xs text-slate-500">
        <span>{formatPrice(chart.max)}</span>
        <span>Daily average reported price · ₹/quintal</span>
        <span>{formatPrice(chart.min)}</span>
      </div>
      <div className="overflow-x-auto">
        <svg
          className="h-60 min-w-[620px] w-full"
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          role="img"
          aria-label="Historical average modal market price chart"
        >
          <title>Historical average reported or representative price from AGMARKNET observations</title>
          <line
            x1={chart.padding.left}
            x2={chart.width - chart.padding.right}
            y1={chart.height - chart.padding.bottom}
            y2={chart.height - chart.padding.bottom}
            stroke="#cbd5e1"
          />
          <polygon points={chart.area} fill="#d1fae5" opacity="0.75" />
          <polyline
            points={chart.line}
            fill="none"
            stroke="#047857"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {chart.coordinates.map(({ x, y, point }) => (
            <circle
              key={point.date}
              cx={x}
              cy={y}
              r="4"
              fill="#047857"
              aria-label={`${point.date}: ${formatPrice(point.average_reported_price)}`}
            >
              <title>
                {formatDate(point.date)}: {formatPrice(point.average_reported_price)} ({point.record_count} reports)
              </title>
            </circle>
          ))}
          <text x={chart.padding.left} y={chart.height - 8} fill="#64748b" fontSize="11">
            {formatDate(points[0].date)}
          </text>
          <text
            x={chart.width - chart.padding.right}
            y={chart.height - 8}
            fill="#64748b"
            fontSize="11"
            textAnchor="end"
          >
            {formatDate(points[points.length - 1].date)}
          </text>
        </svg>
      </div>
    </div>
  );
}

function MarketPrices({ buyer = false }: { buyer?: boolean }) {
  const [filters, setFilters] = useState<MarketFilters>(emptyFilters);
  const [states, setStates] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [commodities, setCommodities] = useState<string[]>([]);
  const [markets, setMarkets] = useState<string[]>([]);
  const [data, setData] = useState<MarketResponse | null>(null);
  const [summary, setSummary] = useState<MarketSummary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [syncDetail, setSyncDetail] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string>("waiting");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncingSource, setSyncingSource] = useState(false);
  const [defaultCommodityApplied, setDefaultCommodityApplied] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    void apiRequest<{ states: string[] }>("/api/market-intelligence/states")
      .then((result) => {
        if (active) setStates(result.states);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Unable to load market filters.");
        }
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    let active = true;
    const stateParam = filters.state ? `?state=${encodeURIComponent(filters.state)}` : "";
    void apiRequest<{ districts: string[] }>(
      `/api/market-intelligence/districts${stateParam}`,
    )
      .then((result) => {
        if (active) setDistricts(result.districts);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Unable to load districts.");
        }
      });
    return () => {
      active = false;
    };
  }, [filters.state, refreshKey]);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams();
    if (filters.state) query.set("state", filters.state);
    if (filters.district) query.set("district", filters.district);
    const suffix = query.size ? `?${query}` : "";
    void apiRequest<{ commodities: string[] }>(
      `/api/market-intelligence/commodities${suffix}`,
    )
      .then((result) => {
        if (active) {
          setCommodities(result.commodities);
          if (!defaultCommodityApplied && result.commodities.length > 0) {
            setDefaultCommodityApplied(true);
            setFilters((current) => current.commodity
              ? current
              : {
                  ...current,
                  commodity:
                    result.commodities.find(
                      (commodity) => commodity.toLocaleLowerCase() === "tomato",
                    ) ?? result.commodities[0],
                });
          }
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Unable to load commodities.");
        }
      });
    return () => {
      active = false;
    };
  }, [filters.state, filters.district, refreshKey, defaultCommodityApplied]);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams();
    if (filters.commodity) query.set("commodity", filters.commodity);
    if (filters.state) query.set("state", filters.state);
    if (filters.district) query.set("district", filters.district);
    const suffix = query.size ? `?${query}` : "";
    void apiRequest<{ markets: string[] }>(`/api/market-intelligence/markets${suffix}`)
      .then((result) => {
        if (active) setMarkets(result.markets);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Unable to load markets.");
        }
      });
    return () => {
      active = false;
    };
  }, [filters.commodity, filters.state, filters.district, refreshKey]);

  useEffect(() => {
    let active = true;
    const params = makeParams(filters);
    const query = params ? `?${params}` : "";
    void Promise.all([
      apiRequest<MarketResponse>(
        `/api/market-intelligence/prices?limit=200${params ? `&${params}` : ""}`,
      ),
      apiRequest<MarketSummary>(`/api/market-intelligence/summary${query}`),
      apiRequest<{ points: TrendPoint[] }>(`/api/market-intelligence/trends${query}`),
      apiRequest<{
        last_updated: string | null;
        detail: string | null;
        status: string;
      }>(
        "/api/market-intelligence/last-updated",
      ),
    ])
      .then(([prices, priceSummary, historical, updated]) => {
        if (!active) return;
        setData(prices);
        setSummary(priceSummary);
        setTrend(historical.points);
        setLastUpdated(updated.last_updated);
        setSyncDetail(updated.detail);
        setSyncStatus(updated.status);
        setError("");
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Market intelligence is unavailable.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filters, refreshKey]);

  useEffect(() => {
    const timer = window.setInterval(
      () => {
        setLoading(true);
        setRefreshKey((current) => current + 1);
      },
      6 * 60 * 60 * 1000,
    );
    return () => window.clearInterval(timer);
  }, []);

  function updateFilter<K extends keyof MarketFilters>(
    key: K,
    value: MarketFilters[K],
  ) {
    setLoading(true);
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "state" ? { district: "", market: "" } : {}),
      ...(key === "district" ? { market: "" } : {}),
      ...(key === "commodity" ? { market: "" } : {}),
    }));
  }

  const priceCards = [
    { label: "Latest reported price", value: summary?.latest_record?.reported_price, detail: summary?.latest_record?.arrival_date ? `${summary.latest_record.price_basis} · ${formatDate(summary.latest_record.arrival_date)}` : "No reported observations" },
    { label: "Minimum price", value: summary?.minimum_price, detail: "Within selected records" },
    { label: "Maximum price", value: summary?.maximum_price, detail: "Within selected records" },
    { label: "Average reported price", value: summary?.average_reported_price, detail: "Official modal or identified representative price" },
  ];

  async function refreshMarketData() {
    setSyncingSource(true);
    setError("");
    try {
      await apiRequest("/api/market-intelligence/refresh", { method: "POST" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Market data refresh failed.");
    } finally {
      setSyncingSource(false);
      setLoading(true);
      setRefreshKey((current) => current + 1);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-700">
              AgriGO · {buyer ? "Buyer tools" : "Farmer tools"}
            </p>
            <h1 className="mt-1 text-xl font-bold text-slate-900">Market Intelligence</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/intelligence-lab"
              className="rounded-lg border border-emerald-800 px-4 py-2.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-50"
            >
              Intelligence Lab
            </Link>
            <Link
              to={buyer ? "/buyer-dashboard" : "/farmer-dashboard"}
              className="rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <section className="flex flex-col justify-between gap-5 rounded-2xl bg-emerald-950 p-6 text-white sm:flex-row sm:items-end sm:p-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
              Official mandi reports · AGMARKNET 2.0
            </p>
            <h2 className="mt-2 text-3xl font-bold">Make decisions with reported prices.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-100">
              Compare sourced mandi observations across locations and dates. Official modal
              prices and dated representative-price snapshots are identified separately.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="https://www.data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi"
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-emerald-400 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900"
            >
              Official data catalog ↗
            </a>
            <button
              type="button"
              disabled={loading || syncingSource}
              onClick={() => void refreshMarketData()}
              className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 disabled:opacity-60"
            >
              {syncingSource ? "Fetching latest data…" : "Fetch latest data"}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-900">Filter market reports</h2>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setFilters(emptyFilters);
              }}
              className="text-sm font-semibold text-emerald-800 underline"
            >
              Clear filters
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <label className="text-sm font-medium text-slate-700">
              Commodity
              <select
                value={filters.commodity}
                onChange={(event) => updateFilter("commodity", event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
              >
                <option value="">All commodities</option>
                {commodities.map((commodity) => <option key={commodity}>{commodity}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              State
              <select
                value={filters.state}
                onChange={(event) => updateFilter("state", event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
              >
                <option value="">All states</option>
                {states.map((state) => <option key={state}>{state}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              District
              <select
                value={filters.district}
                onChange={(event) => updateFilter("district", event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
              >
                <option value="">All districts</option>
                {districts.map((district) => <option key={district}>{district}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Market / mandi
              <select
                value={filters.market}
                onChange={(event) => updateFilter("market", event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
              >
                <option value="">All markets</option>
                {markets.map((market) => <option key={market}>{market}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              From date
              <input
                type="date"
                value={filters.start_date}
                max={filters.end_date || undefined}
                onChange={(event) => updateFilter("start_date", event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              To date
              <input
                type="date"
                value={filters.end_date}
                min={filters.start_date || undefined}
                onChange={(event) => updateFilter("end_date", event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
              />
            </label>
          </div>
        </section>

        {error && (
          <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            {error}
          </div>
        )}
        {syncDetail && (
          <div
            role={syncStatus === "available" ? "status" : "alert"}
            className={`rounded-xl border p-4 text-sm ${
              syncStatus === "available"
                ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                : "border-amber-300 bg-amber-50 text-amber-950"
            }`}
          >
            {syncDetail}
          </div>
        )}

        <section aria-label="Market price summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {priceCards.map((card) => (
            <article key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-600">{card.label}</p>
              <p className="mt-3 text-2xl font-bold text-slate-950">
                {formatPrice(card.value)}
                {card.value !== null && card.value !== undefined && (
                  <span className="ml-1 text-xs font-medium text-slate-500">/ quintal</span>
                )}
              </p>
              <p className="mt-2 text-xs text-slate-500">{card.detail}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Historical price trend</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Daily average reported or representative price · Missing dates remain missing
                </p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                {summary?.trend ?? "Waiting for data"}
              </span>
            </div>
            <PriceTrendChart points={trend} />
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-bold text-slate-900">Market pulse</h2>
            <p className="mt-1 text-sm text-slate-500">Calculated from stored reports; missing periods are not estimated.</p>
            <dl className="mt-5 divide-y divide-slate-100">
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-sm text-slate-600">7-day reported average</dt>
                <dd className="font-semibold text-slate-900">{formatPrice(summary?.average_7_day)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-sm text-slate-600">30-day reported average</dt>
                <dd className="font-semibold text-slate-900">{formatPrice(summary?.average_30_day)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-sm text-slate-600">7-day change</dt>
                <dd className="font-semibold text-slate-900">
                  {summary?.price_change_percent_7_day === null || summary?.price_change_percent_7_day === undefined
                    ? "—"
                    : `${summary.price_change_percent_7_day > 0 ? "+" : ""}${summary.price_change_percent_7_day.toFixed(1)}%`}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-sm text-slate-600">Market difference · 7 days</dt>
                <dd className="font-semibold text-slate-900">{formatPrice(summary?.market_price_difference)}</dd>
              </div>
            </dl>
            <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Highest / lowest market average</p>
              <p className="text-sm text-slate-800">
                Highest: <strong>{summary?.highest_price_market?.market ?? "—"}</strong>
                <span className="ml-2 text-emerald-800">{formatPrice(summary?.highest_price_market?.average_reported_price)}</span>
              </p>
              <p className="text-sm text-slate-800">
                Lowest: <strong>{summary?.lowest_price_market?.market ?? "—"}</strong>
                <span className="ml-2 text-emerald-800">{formatPrice(summary?.lowest_price_market?.average_reported_price)}</span>
              </p>
            </div>
          </article>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-bold text-slate-900">Latest available market data</h2>
              <p className="mt-1 text-xs text-slate-500">
                {data?.total ?? 0} matching sourced reports · Prices in ₹/quintal
              </p>
            </div>
            <p className="text-xs text-slate-600">
              Last checked: {lastUpdated ? new Date(lastUpdated).toLocaleString() : "Fetching source data…"}
            </p>
          </div>
          {loading && !data ? (
            <p className="p-8 text-center text-sm text-slate-600" role="status">Loading available market reports…</p>
          ) : data?.records.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Commodity / variety</th>
                    <th className="px-5 py-3">Market</th>
                    <th className="px-5 py-3">State / district</th>
                    <th className="px-5 py-3">Min – max</th>
                    <th className="px-5 py-3">Reported price</th>
                    <th className="px-5 py-3">Report date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.records.map((record) => (
                    <tr key={record.id} className="text-slate-700">
                      <td className="px-5 py-3 font-semibold text-slate-900">
                        {record.commodity}{record.variety ? ` · ${record.variety}` : ""}
                      </td>
                      <td className="px-5 py-3">{record.market}</td>
                      <td className="px-5 py-3">{record.state} · {record.district}</td>
                      <td className="px-5 py-3">{formatPrice(record.min_price)} – {formatPrice(record.max_price)}</td>
                      <td className="px-5 py-3 font-semibold text-emerald-800">
                        {formatPrice(record.reported_price)}
                        <span className="block text-xs font-normal text-slate-500">
                          {record.price_basis} · {record.source}
                        </span>
                      </td>
                      <td className="px-5 py-3">{formatDate(record.arrival_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center">
              <p className="font-semibold text-slate-800">No market reports match these filters.</p>
              <p className="mt-2 text-sm text-slate-600">
                Use “Fetch latest data” to update from the official feed and its verified, dated AGMARKNET snapshot.
              </p>
            </div>
          )}
          {data && data.total > data.records.length && (
            <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              Showing the latest {data.records.length} reports. Narrow the filters to view a specific market or commodity.
            </p>
          )}
        </section>

        <p className="text-xs leading-5 text-slate-500">
          Source: {data?.source ?? "AGMARKNET / data.gov.in"} · Periodic mandi reports, not real-time quotes.
          The snapshot secondary source is maintained by{" "}
          <a className="underline" href="https://github.com/heybadrinath/MandiLens" target="_blank" rel="noreferrer">MandiLens ↗</a>
          {" "}and links to AGMARKNET 2.0 data under the Government Open Data License (India). Its representative prices are never labeled as modal prices.
        </p>
      </main>
    </div>
  );
}

export default MarketPrices;
