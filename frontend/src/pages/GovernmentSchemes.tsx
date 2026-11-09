import { Link } from "react-router-dom";

function GovernmentSchemes() {
  const schemes = [
    {
      name: "PM-KISAN",
      description:
        "A government income support scheme for eligible farmer families.",
      url: "https://pmkisan.gov.in/",
    },
    {
      name: "Pradhan Mantri Fasal Bima Yojana",
      description:
        "Crop insurance support for eligible farmers against specified crop losses.",
      url: "https://pmfby.gov.in/",
    },
    {
      name: "Kisan Credit Card",
      description:
        "Provides eligible farmers access to agricultural credit facilities.",
      url: "https://www.myscheme.gov.in/schemes/kcc",
    },
    {
      name: "Soil Health Card",
      description:
        "Provides information about soil health and nutrient requirements.",
      url: "https://soilhealth.dac.gov.in/",
    },
  ];

  return (
    <div className="min-h-screen bg-green-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-green-700">🌾 AgriGO</h1>
            <p className="text-sm text-gray-500">Government Schemes</p>
          </div>

          <Link
            to="/farmer-dashboard"
            className="rounded-lg bg-green-600 px-5 py-2 font-semibold text-white"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h2 className="text-3xl font-bold text-gray-900">
          🏛️ Government Schemes
        </h2>

        <p className="mt-2 text-gray-600">
          Scheme details and eligibility can change. Check the official portal before applying.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {schemes.map((scheme) => (
            <div
              key={scheme.name}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <h3 className="text-xl font-bold text-green-700">
                {scheme.name}
              </h3>

              <p className="mt-3 text-gray-600">{scheme.description}</p>

              <a href={scheme.url} target="_blank" rel="noreferrer" className="mt-5 inline-block rounded-lg bg-green-600 px-4 py-2 font-semibold text-white">
                Open official portal
              </a>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default GovernmentSchemes;