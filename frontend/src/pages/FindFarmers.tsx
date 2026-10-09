import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api";
import { subscribeRealtime } from "../realtime";

type Farmer = {
  id: number;
  name: string;
  farm_name: string | null;
  location: string | null;
  products: string[];
};

function FindFarmers() {
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = () => {
      apiRequest<{ farmers: Farmer[] }>("/api/farmers")
        .then((data) => {
          if (active) {
            setFarmers(data.farmers);
            setError("");
          }
        })
        .catch((reason: unknown) => {
          if (active) setError(reason instanceof Error ? reason.message : "Unable to load farmers.");
        });
    };
    refresh();
    const unsubscribe = subscribeRealtime("farmers.changed", refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <div className="min-h-screen bg-green-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-green-700">🌾 AgriGO</h1>
            <p className="text-sm text-gray-500">Find Farmers</p>
          </div>

          <Link
            to="/buyer-dashboard"
            className="rounded-lg bg-green-600 px-5 py-2 font-semibold text-white"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h2 className="text-3xl font-bold text-gray-900">
          🔍 Find Farmers
        </h2>

        <p className="mt-2 text-gray-600">
          Discover farmers and the products they offer.
        </p>

        {error && <p role="alert" className="mt-6 rounded-lg bg-amber-50 p-4 text-amber-900">{error}</p>}

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {farmers.map((farmer) => (
            <div
              key={farmer.name}
              className="rounded-2xl bg-white p-6 shadow-sm border border-gray-200"
            >
              <div className="text-4xl">👨‍🌾</div>

              <h3 className="mt-4 text-xl font-bold text-gray-900">
                {farmer.farm_name || farmer.name}
              </h3>

              <p className="mt-2 text-gray-600">
                📍 {farmer.location || "Location not provided"}
              </p>

              <p className="mt-2 text-gray-600">
                🌾 {farmer.products.length ? farmer.products.join(", ") : "No current listings"}
              </p>

              <Link to="/browse-products" className="mt-5 inline-block rounded-lg bg-green-600 px-4 py-2 font-semibold text-white">
                Browse produce
              </Link>
            </div>
          ))}
        </div>
        {farmers.length === 0 && !error && <p className="mt-8 text-center text-gray-600">No farmer profiles are available yet.</p>}
      </main>
    </div>
  );
}

export default FindFarmers;