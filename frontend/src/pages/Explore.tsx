import { Link } from "react-router-dom";

function Explore() {
  return (
    <div className="min-h-screen bg-green-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-3xl">🌾</span>

            <div>
              <h1 className="text-2xl font-bold text-green-700">
                AgriGO
              </h1>

              <p className="text-xs text-gray-500">
                Smart Agriculture Platform
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-16">
        <div className="text-center">
          <h2 className="text-4xl font-bold text-gray-900">
            Explore AgriGO Features
          </h2>

          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
            Discover smart tools designed to help farmers make better
            agricultural decisions.
          </p>
        </div>

        <section className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Feature
            to="/market-prices"
            icon="📈"
            title="Market Intelligence"
            description="Track agricultural market prices, analyze trends and make informed selling decisions."
          />

          <Feature
            to="/intelligence-lab"
            icon="🧪"
            title="AI & Data Science Lab"
            description="Inspect sourced data, review model evaluation, and see forecasts only when a real-data baseline passes validation."
          />

          <Feature
            to="/crop-recommendation"
            icon="🌱"
            title="Crop Suitability Prototype"
            description="Explore a transparent rule-based planning prototype. It is not a trained crop recommendation model."
          />

          <Feature
            to="/weather"
            icon="🌦️"
            title="Weather Information"
            description="Access useful weather information to support better farming decisions."
          />

          <Feature
            to="/government-schemes"
            icon="🏛️"
            title="Government Schemes"
            description="Explore agricultural schemes and support programs available to farmers."
          />

          <Feature
            to="/farmer-requests"
            icon="🤝"
            title="Farmer-Buyer Requests"
            description="Farmers can review buyer requests, while buyers can discover available produce after signing in."
          />

          <Feature
            to="/ai-assistant"
            icon="🤖"
            title="AI Agriculture Assistant"
            description="Ask practical agriculture questions. Sign in for the role-specific assistant."
          />

          <Feature
            to="/agriculture-map"
            icon="🛰️"
            title="Regional Agriculture Map"
            description="Explore regional boundaries and the availability of sourced agriculture indicators."
          />

          <Feature
            to="/why-agriculture"
            icon="📚"
            title="Why Agriculture?"
            description="Understand agriculture’s history, role in everyday life, and its changing future."
          />
        </section>
      </main>
    </div>
  )
}

function Feature({
  to,
  icon,
  title,
  description,
}: {
  to: string
  icon: string
  title: string
  description: string
}) {
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-emerald-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
    >
      <div className="text-4xl">{icon}</div>

      <h3 className="mt-4 text-xl font-bold text-gray-900">
        {title}
      </h3>

      <p className="mt-2 leading-7 text-gray-600">
        {description}
      </p>
      <span className="mt-5 inline-flex text-sm font-semibold text-emerald-800">
        Explore feature <span className="ml-2 transition group-hover:translate-x-1" aria-hidden="true">↗</span>
      </span>
    </Link>
  )
}

export default Explore