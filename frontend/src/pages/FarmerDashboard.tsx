import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api";
import WeatherPanel from "../WeatherPanel";
import "./FarmerDashboard.css";

type FarmerProduct = {
  id: number;
  product_name: string;
  status: string;
};

type FarmerOrder = {
  id: number;
  product_name: string;
  buyer_name: string;
  total_price: number;
  status: string;
  created_at: string | null;
};

type FarmerProductsResponse = { products: FarmerProduct[] };
type FarmerOrdersResponse = { orders: FarmerOrder[] };

type FarmerProfile = {
  id: number;
  user_id: number;
  farm_name: string | null;
  location: string | null;
  farm_size: number | null;
  soil_type: string | null;
};

function FarmerDashboard() {
  const farmerName = (() => {
    try {
      const user = JSON.parse(localStorage.getItem("agrigoUser") || "{}");
      return typeof user.fullName === "string" ? user.fullName.split(" ")[0] : "";
    } catch {
      return "";
    }
  })();
  const [profile, setProfile] = useState<FarmerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [products, setProducts] = useState<FarmerProduct[]>([]);
  const [orders, setOrders] = useState<FarmerOrder[]>([]);
  const [commerceLoading, setCommerceLoading] = useState(true);
  const [commerceError, setCommerceError] = useState("");

  useEffect(() => {
    async function fetchFarmerProfile() {
      if (!localStorage.getItem("access_token")) {
        setError("Please login again.");
        setLoading(false);
        return;
      }

      try {
        const data = await apiRequest<FarmerProfile>("/api/farmer/profile");
        setProfile(data);
      } catch (error) {
        console.error("Profile error:", error);
        setError(error instanceof Error ? error.message : "Unable to load profile.");
      }

      setLoading(false);
    }

    fetchFarmerProfile();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      apiRequest<FarmerProductsResponse>("/api/farmer/products", {
        signal: controller.signal,
      }),
      apiRequest<FarmerOrdersResponse>("/api/farmer/orders", {
        signal: controller.signal,
      }),
    ])
      .then(([productData, orderData]) => {
        setProducts(productData.products);
        setOrders(orderData.orders);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setCommerceError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load your listings and orders.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCommerceLoading(false);
      });

    return () => controller.abort();
  }, []);

  const completedOrderValue = useMemo(
    () =>
      orders
        .filter((order) => order.status === "completed")
        .reduce((total, order) => total + order.total_price, 0),
    [orders],
  );

  return (
    <div className="min-h-screen bg-green-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-green-700">
              🌾 AgriGO
            </h1>

            <p className="text-sm text-gray-500">
              Farmer Dashboard
            </p>
          </div>

          <Link
            to="/"
            className="rounded-lg bg-green-600 px-5 py-2 font-semibold text-white hover:bg-green-700"
          >
            Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-2xl bg-emerald-900 px-6 py-7 text-white shadow-sm sm:px-8">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-200">
            Farmer workspace
          </p>
          <h2 className="mt-2 text-3xl font-bold">
            Welcome back{farmerName ? `, ${farmerName}` : ""}.
          </h2>
          <p className="mt-2 max-w-2xl text-emerald-100">
            Plan your season, track local conditions, and bring your harvest to market.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/add-product"
              className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-50"
            >
              Add a produce listing
            </Link>
            <Link
              to="/farmer-requests"
              className="rounded-lg border border-emerald-300 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              View buyer requests
            </Link>
          </div>
        </section>

        <div className="mt-8">
          <WeatherPanel compact />
        </div>

        <section
          className="farmer-commerce-overview"
          aria-labelledby="farmer-commerce-title"
        >
          <div className="farmer-commerce-overview__heading">
            <div>
              <p>SELLING ACTIVITY</p>
              <h2 id="farmer-commerce-title">Listings, orders &amp; sales</h2>
            </div>
            <Link to="/add-product">Create a listing</Link>
          </div>

          {commerceLoading ? (
            <p className="farmer-commerce-overview__message" role="status">
              Loading your private sales summary…
            </p>
          ) : commerceError ? (
            <p className="farmer-commerce-overview__error" role="alert">
              {commerceError}
            </p>
          ) : (
            <>
              <div className="farmer-commerce-metrics">
                <article>
                  <span>Available listings</span>
                  <strong>
                    {products.filter((product) => product.status === "available").length}
                  </strong>
                </article>
                <article>
                  <span>Orders received</span>
                  <strong>{orders.length}</strong>
                </article>
                <article>
                  <span>Completed order value</span>
                  <strong>
                    ₹
                    {new Intl.NumberFormat("en-IN", {
                      maximumFractionDigits: 0,
                    }).format(completedOrderValue)}
                  </strong>
                </article>
              </div>
              <p className="farmer-commerce-overview__note">
                Completed order value is gross order value, not net earnings;
                payment settlement and farm expenses are not tracked here.
              </p>
              {orders.length > 0 ? (
                <div className="farmer-commerce-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Order</th>
                        <th scope="col">Buyer</th>
                        <th scope="col">Date</th>
                        <th scope="col">Value</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.slice(0, 5).map((order) => (
                        <tr key={order.id}>
                          <th scope="row">{order.product_name}</th>
                          <td>{order.buyer_name}</td>
                          <td>
                            {order.created_at
                              ? new Date(order.created_at).toLocaleDateString()
                              : "—"}
                          </td>
                          <td>
                            ₹
                            {new Intl.NumberFormat("en-IN", {
                              maximumFractionDigits: 0,
                            }).format(order.total_price)}
                          </td>
                          <td>
                            <span className="farmer-commerce-status">
                              {order.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="farmer-commerce-overview__message">
                  No buyer orders yet. Your listings and new orders will appear
                  here.
                </p>
              )}
            </>
          )}
        </section>

        <div className="mt-8 rounded-2xl border border-green-200 bg-white p-6 shadow-sm">
          <h3 className="text-2xl font-bold text-green-700">
            🌾 My Farm Profile
          </h3>

          {loading && (
            <p className="mt-4 text-gray-500">
              Loading your farm profile...
            </p>
          )}

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </p>
          )}

          {profile && !loading && (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg bg-green-50 p-4">
                <p className="text-sm text-gray-500">Farm Name</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {profile.farm_name?.trim() || "Not provided"}
                </p>
              </div>

              <div className="rounded-lg bg-green-50 p-4">
                <p className="text-sm text-gray-500">Location</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {profile.location?.trim() || "Not provided"}
                </p>
              </div>

              <div className="rounded-lg bg-green-50 p-4">
                <p className="text-sm text-gray-500">Farm Size</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {profile.farm_size === null ||
                  profile.farm_size === undefined ||
                  String(profile.farm_size).trim() === ""
                    ? "Not provided"
                    : `${profile.farm_size} acres`}
                </p>
              </div>

              <div className="rounded-lg bg-green-50 p-4">
                <p className="text-sm text-gray-500">Soil Type</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {profile.soil_type?.trim() || "Not provided"}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <DashboardCard
            icon="🧭"
            title="My Farm & Crops"
            description="Maintain your private farm profile and track seasonal crop area."
            link="/my-farm"
          />

          <DashboardCard
            icon="🌱"
            title="Crop Recommendation"
            description="Get recommendations to help plan your crops."
            link="/crop-recommendation"
          />

          <DashboardCard
            icon="📈"
            title="Market Prices"
            description="Check agricultural market prices and trends."
            link="/market-prices"
          />

          <DashboardCard
            icon="🌦️"
            title="Weather"
            description="View weather information for farming decisions."
            link="/weather"
          />

          <DashboardCard
            icon="🏛️"
            title="Government Schemes"
            description="Explore agricultural schemes and support programs."
            link="/government-schemes"
          />

          <DashboardCard
            icon="📦"
            title="Add Product"
            description="Add your crops and produce for buyers to browse."
            link="/add-product"
          />

          <DashboardCard
            icon="🤝"
            title="Sell Your Produce"
            description="Connect with potential buyers for your produce."
            link="/sell-produce"
          />

          <DashboardCard
            icon="🤖"
            title="AI Agriculture Assistant"
            description="Get help with agricultural questions and information."
            link="/ai-assistant"
          />

          <DashboardCard
            icon="🤝"
            title="Buyer Requests"
            description="View and manage requests from buyers."
            link="/farmer-requests"
          />
        </div>
      </main>
    </div>
  );
}

function DashboardCard({
  icon,
  title,
  description,
  link,
}: {
  icon: string;
  title: string;
  description: string;
  link: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="text-4xl">{icon}</div>

      <h3 className="mt-4 text-xl font-bold text-gray-900">
        {title}
      </h3>

      <p className="mt-2 text-gray-600">
        {description}
      </p>

      <Link
        to={link}
        className="mt-5 inline-block rounded-lg bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700"
      >
        Open
      </Link>
    </div>
  );
}

export default FarmerDashboard;