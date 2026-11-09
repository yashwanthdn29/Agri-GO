import { Link } from "react-router-dom";
import WeatherPanel from "../WeatherPanel";

function Weather() {
  const dashboardPath = getDashboardPath();

  return (
    <div className="min-h-screen bg-green-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-green-700">🌾 AgriGO</h1>
            <p className="text-sm text-gray-500">Weather Information</p>
          </div>

          <Link
            to={dashboardPath}
            className="rounded-lg bg-green-600 px-5 py-2 font-semibold text-white"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900">Weather & Air Quality</h2>
          <p className="mt-2 text-gray-600">Current local conditions, air quality, and a five-day forecast.</p>
        </div>
        <WeatherPanel />
      </main>
    </div>
  );
}

function getDashboardPath() {
  try {
    const user = JSON.parse(localStorage.getItem("agrigoUser") || "{}");
    return user.accountType === "buyer" ? "/buyer-dashboard" : "/farmer-dashboard";
  } catch {
    return "/farmer-dashboard";
  }
}

export default Weather;