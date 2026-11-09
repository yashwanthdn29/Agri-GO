import { Link } from "react-router-dom";
import WeatherPanel from "../WeatherPanel";

function BuyerDashboard() {
  const buyerName = (() => {
    try {
      const user = JSON.parse(localStorage.getItem("agrigoUser") || "{}");
      return typeof user.fullName === "string" ? user.fullName.split(" ")[0] : "";
    } catch {
      return "";
    }
  })();

  return (
    <div className="min-h-screen bg-green-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-green-700">
              🌾 AgriGO
            </h1>

            <p className="text-sm text-gray-500">
              Buyer Dashboard
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
        <section className="rounded-2xl bg-sky-950 px-6 py-7 text-white shadow-sm sm:px-8">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-200">
            Buyer workspace
          </p>
          <h2 className="mt-2 text-3xl font-bold">
            Welcome back{buyerName ? `, ${buyerName}` : ""}.
          </h2>
          <p className="mt-2 max-w-2xl text-sky-100">
            Discover local produce, build relationships with farmers, and keep your orders organized.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/browse-products"
              className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-sky-950 hover:bg-sky-50"
            >
              Browse produce
            </Link>
            <Link
              to="/my-orders"
              className="rounded-lg border border-sky-300 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-900"
            >
              View my orders
            </Link>
          </div>
        </section>

        <div className="mt-8">
          <WeatherPanel compact />
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">

          <DashboardCard
            icon="🌾"
            title="Browse Products"
            description="Explore agricultural products available from farmers."
            link="/browse-products"
          />

          <DashboardCard
            icon="🔍"
            title="Find Farmers"
            description="Discover farmers and the products they offer."
            link="/find-farmers"
          />

          <DashboardCard
            icon="📈"
            title="Market Prices"
            description="Check current agricultural market information."
            link="/buyer-market-prices"
          />

          <DashboardCard
            icon="🌦️"
            title="Weather & Air Quality"
            description="Check local weather conditions, AQI, and forecasts."
            link="/weather"
          />

          <DashboardCard
            icon="🤝"
            title="Connect with Farmers"
            description="Connect with farmers for agricultural products."
            link="/connect-farmers"
          />

          <DashboardCard
            icon="📦"
            title="My Orders"
            description="View and manage your agricultural orders."
            link="/my-orders"
          />

          <DashboardCard
            icon="🤖"
            title="AI Agriculture Assistant"
            description="Get assistance with agricultural information."
            link="/buyer-ai-assistant"
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

export default BuyerDashboard;