import { useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "./api";
import ListingGuidance from "./components/ListingGuidance";

function AddProduct() {
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("kg");
  const [location, setLocation] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!productName || !category || !quantity || !price) {
      setMessage("Please fill in all fields.");
      return;
    }

    setLoading(true);
    try {
      await apiRequest("/api/marketplace/products", {
        method: "POST",
        body: JSON.stringify({
          product_name: productName,
          category,
          quantity: Number(quantity),
          unit,
          price_per_unit: Number(price),
          location: location || "Not specified",
        }),
      });
      setMessage("Product added successfully.");
      setProductName("");
      setCategory("");
      setQuantity("");
      setPrice("");
      setLocation("");
      setUnit("kg");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add product.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-green-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-green-700">
              🌾 AgriGO
            </h1>

            <p className="text-sm text-gray-500">
              Add Product
            </p>
          </div>

          <Link
            to="/farmer-dashboard"
            className="rounded-lg bg-green-600 px-5 py-2 font-semibold text-white hover:bg-green-700"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="rounded-2xl bg-white p-8 shadow-lg">
          <h2 className="text-3xl font-bold text-gray-900">
            Add Your Product 📦
          </h2>

          <p className="mt-2 text-gray-600">
            Add your agricultural produce for buyers to browse.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label className="font-medium text-gray-700">
                Product Name
              </label>

              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Example: Rice"
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-green-600"
              />
            </div>

            <div>
              <label className="font-medium text-gray-700">
                Category
              </label>

              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Example: Grains"
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-green-600"
              />
            </div>

            <div>
              <label className="font-medium text-gray-700">
                Quantity
              </label>

              <input
                type="number"
                min="0.01"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Example: 100"
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-green-600"
              />
            </div>

            <div>
              <label className="font-medium text-gray-700">Unit</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 outline-none focus:border-green-600"
              >
                <option value="kg">Kilograms (kg)</option>
                <option value="quintal">Quintals</option>
                <option value="tonne">Tonnes</option>
              </select>
            </div>

            <div>
              <label className="font-medium text-gray-700">
                Price per {unit}
              </label>

              <input
                type="number"
                min="0"
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Example: 50"
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-green-600"
              />
            </div>

            <div>
              <label className="font-medium text-gray-700">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="District, state (e.g. Mandya, Karnataka)"
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-green-600"
              />
            </div>

            <ListingGuidance
              commodity={productName}
              location={location}
              unit={unit}
              onUsePrice={(suggestedPrice) =>
                setPrice(suggestedPrice.toFixed(2))
              }
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              {loading ? "Adding..." : "Add Product"}
            </button>
          </form>

          {message && (
            <div className="mt-5 rounded-lg bg-green-50 p-4 text-center font-medium text-green-700">
              {message}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default AddProduct;