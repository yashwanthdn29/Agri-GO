import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api";
import { subscribeRealtime } from "../realtime";

type Produce = {
  id: number;
  product_name: string;
  quantity: number;
  unit: string;
  price_per_unit: number;
  location: string;
  farmer_name: string;
};

function BrowseProducts() {
  const [listings, setListings] = useState<Produce[]>([]);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [quantities, setQuantities] = useState<Record<number, string>>({});

  useEffect(() => {
    let active = true;
    const refresh = () => {
      apiRequest<{ products: Produce[] }>("/api/marketplace/products")
        .then((data) => {
          if (active) setListings(data.products);
        })
        .catch((error: unknown) => {
          if (active) setMessage(error instanceof Error ? error.message : "Unable to load products.");
        });
    };
    refresh();
    const unsubscribe = subscribeRealtime("products.changed", refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function handleOrder(product: Produce) {
    try {
      await apiRequest("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          product_id: product.id,
          quantity: Number(quantities[product.id] || 1),
        }),
      });
      setMessage(`Order placed for ${product.product_name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to place order.");
    }
  }

  const filteredListings = listings.filter((product) => {
    const productName = product.product_name?.toLowerCase() || "";

    const location =
      product.location?.toLowerCase() || "";

    return (
      productName.includes(search.toLowerCase()) &&
      location.includes(locationFilter.toLowerCase())
    );
  });

  function clearFilters() {
    setSearch("");
    setLocationFilter("");
  }

  return (
    <div className="min-h-screen bg-green-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-green-700">
              AgriGO
            </h1>

            <p className="text-sm text-gray-500">
              Browse Products
            </p>
          </div>

          <Link
            to="/buyer-dashboard"
            className="rounded-lg bg-green-600 px-5 py-2 font-semibold text-white hover:bg-green-700"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <h2 className="text-3xl font-bold text-gray-900">
          Browse Products
        </h2>

        <p className="mt-2 text-gray-600">
          Search and explore agricultural products from farmers.
        </p>

        {message && (
          <div className="mt-6 rounded-lg border border-green-200 bg-white p-4 text-green-700 shadow-sm">
            <div className="flex items-center justify-between">
              <span>{message}</span>

              <button
                onClick={() => setMessage("")}
                className="font-semibold text-gray-500"
              >
                X
              </button>
            </div>
          </div>
        )}

        <div className="mt-8 rounded-xl bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Search Product
              </label>

              <input
                type="text"
                value={search}
                onChange={(e) =>
                  setSearch(e.target.value)
                }
                placeholder="e.g. Tomato"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Location
              </label>

              <input
                type="text"
                value={locationFilter}
                onChange={(e) =>
                  setLocationFilter(e.target.value)
                }
                placeholder="e.g. Bengaluru"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={clearFilters}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 font-semibold text-gray-700 hover:bg-gray-100"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8">
          {filteredListings.length === 0 ? (
            <div className="rounded-xl bg-white p-10 text-center shadow-sm">
              <div className="text-5xl">🌾</div>

              <h3 className="mt-4 text-xl font-bold text-gray-800">
                No products found
              </h3>

              <p className="mt-2 text-gray-500">
                Try changing your search or location.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredListings.map((product) => (
                <div
                  key={product.id}
                  className="rounded-xl bg-white p-6 shadow-sm"
                >
                  <h3 className="text-xl font-bold text-gray-900">{product.product_name}</h3>

                  <p className="mt-2 text-sm text-gray-500">
                    Farmer: {product.farmer_name}
                  </p>

                  <div className="mt-5 space-y-3">
                    <p>
                      <strong>Quantity:</strong>{" "}
                      {product.quantity} {product.unit}
                    </p>

                    <p>
                      <strong>Price:</strong> ₹
                      {product.price_per_unit} / {product.unit}
                    </p>

                    <p>
                      <strong>Location:</strong>{" "}
                      {product.location}
                    </p>
                  </div>

                  <div className="mt-6 flex gap-3">
                    <input
                      aria-label={`Quantity of ${product.product_name}`}
                      type="number"
                      min="0.01"
                      max={product.quantity}
                      step="any"
                      value={quantities[product.id] ?? "1"}
                      onChange={(event) =>
                        setQuantities((current) => ({ ...current, [product.id]: event.target.value }))
                      }
                      className="w-24 rounded-lg border border-gray-300 px-3 py-2"
                    />
                    <button
                      onClick={() => handleOrder(product)}
                      className="flex-1 rounded-lg bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-700"
                    >
                      Place Order
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default BrowseProducts;