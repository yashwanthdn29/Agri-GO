import { useEffect, useState } from "react";
import { apiRequest } from "../api";

type MarketReference = {
  source: string;
  latest_record: {
    market: string;
    district: string;
    state: string;
    arrival_date: string | null;
    modal_price: number | null;
    unit: string;
  } | null;
};

type ListingGuidanceProps = {
  commodity: string;
  location: string;
  unit: string;
  onUsePrice: (price: number) => void;
};

function rupeesPerSelectedUnit(pricePerQuintal: number, unit: string) {
  if (unit === "kg") return pricePerQuintal / 100;
  if (unit === "tonne") return pricePerQuintal * 10;
  return pricePerQuintal;
}

function ListingGuidance({
  commodity,
  location,
  unit,
  onUsePrice,
}: ListingGuidanceProps) {
  const [result, setResult] = useState<{
    queryKey: string;
    reference: MarketReference | null;
    error: string;
  } | null>(null);
  const locationParts = location.split(",").map((part) => part.trim()).filter(Boolean);
  const state = locationParts.length > 1 ? locationParts[locationParts.length - 1] : "";
  const district = locationParts.length > 1 ? locationParts[0] : "";
  const normalizedCommodity = commodity.trim();
  const queryKey = JSON.stringify([normalizedCommodity, state, district]);

  useEffect(() => {
    if (!normalizedCommodity) {
      return;
    }

    let active = true;
    const params = new URLSearchParams({ commodity: normalizedCommodity });
    if (state) params.set("state", state);
    if (district) params.set("district", district);
    const timer = window.setTimeout(() => {
      void apiRequest<MarketReference>(
        `/api/market-intelligence/summary?${params.toString()}`,
      )
        .then((reference) => {
          if (active) setResult({ queryKey, reference, error: "" });
        })
        .catch((reason: unknown) => {
          if (!active) return;
          setResult({
            queryKey,
            reference: null,
            error:
              reason instanceof Error
                ? reason.message
                : "Could not load a verified mandi reference.",
          });
        });
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [normalizedCommodity, state, district, queryKey]);

  const currentResult = result?.queryKey === queryKey ? result : null;
  const reference = currentResult?.reference ?? null;
  const latestRecord = reference?.latest_record ?? null;
  const loading = Boolean(normalizedCommodity) && currentResult === null;
  const error = currentResult?.error ?? "";
  const modalPrice = latestRecord?.modal_price;
  const suggestedUnitPrice =
    modalPrice === null || modalPrice === undefined
      ? null
      : rupeesPerSelectedUnit(modalPrice, unit);

  return (
    <aside className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-800">
        Before you publish
      </p>
      <ul className="mt-2 grid gap-1.5 text-sm text-slate-700">
        <li>Check that the crop name and grade match what you will deliver.</li>
        <li>Enter a realistic available quantity and price per selected unit.</li>
        <li>Confirm the pickup location and arrange clear harvest photos.</li>
      </ul>

      <div className="mt-4 border-t border-emerald-200 pt-3">
        <p className="text-sm font-semibold text-slate-900">Official mandi reference</p>
        {!commodity.trim() ? (
          <p className="mt-1 text-sm text-slate-600">
            Enter a crop name to check stored government market reports.
          </p>
        ) : loading ? (
          <p className="mt-1 text-sm text-slate-600" role="status">
            Checking stored reports…
          </p>
        ) : error ? (
          <p className="mt-1 text-sm text-amber-900" role="alert">{error}</p>
        ) : latestRecord && modalPrice !== null && modalPrice !== undefined ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-700">
              {latestRecord.market}, {latestRecord.district},{" "}
              {latestRecord.state} · {latestRecord.arrival_date} ·{" "}
              {reference?.source}:{" "}
              <strong>
                ₹{new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(modalPrice)}
                /quintal
              </strong>
            </p>
            <button
              type="button"
              onClick={() => {
                if (suggestedUnitPrice !== null) onUsePrice(suggestedUnitPrice);
              }}
              className="rounded-lg border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-white"
            >
              Use reference ({unit})
            </button>
          </div>
        ) : (
          <p className="mt-1 text-sm text-slate-600">
            No matching stored official report is available. Check the data source before setting a price.
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">
          A reported modal price is a reference, not a guaranteed offer or personalized price recommendation.
        </p>
      </div>
    </aside>
  );
}

export default ListingGuidance;
