import { Link } from "react-router-dom";
import "./Explore.css";

const features = [
  {
    to: "/marketplace",
    title: "Available Produce",
    category: "Trade & connection",
    description:
      "See produce farmers have listed for sale. Anyone can browse; sign in as a buyer to place an order.",
  },
  {
    to: "/farming-guide",
    title: "India Farming Field Guide",
    category: "Field knowledge",
    description:
      "Learn agriculture step by step with crop examples, soil basics, regional crop information and links to trusted sources. Open to everyone.",
  },
  {
    to: "/market-prices",
    title: "Market Intelligence",
    category: "Markets",
    description:
      "Track agricultural market prices, compare trends and make informed selling decisions.",
  },
  {
    to: "/intelligence-lab",
    title: "AI & Data Science Lab",
    category: "Research & data",
    description:
      "Inspect sourced data, review model evaluation and see forecasts only when a real-data baseline passes validation.",
  },
  {
    to: "/crop-recommendation",
    title: "Crop Suitability Prototype",
    category: "Crop planning",
    description:
      "Explore a transparent, rule-based planning prototype. It is not a trained crop recommendation model.",
  },
  {
    to: "/weather",
    title: "Weather Information",
    category: "Weather",
    description:
      "Access useful weather information to support better-informed farm decisions.",
  },
  {
    to: "/government-schemes",
    title: "Government Schemes",
    category: "Farmer support",
    description:
      "Explore agricultural schemes and support programs available to farmers.",
  },
  {
    to: "/farmer-requests",
    title: "Farmer-Buyer Requests",
    category: "Trade & connection",
    description:
      "Farmers can review buyer requests, while buyers can discover available produce after signing in.",
  },
  {
    to: "/ai-assistant",
    title: "AI Agriculture Assistant",
    category: "Farm assistance",
    description:
      "Ask practical agriculture questions. Sign in for the role-specific assistant.",
  },
  {
    to: "/agriculture-map",
    title: "Regional Agriculture Map",
    category: "Regional insights",
    description:
      "Explore regional boundaries and the availability of sourced agriculture indicators.",
  },
  {
    to: "/why-agriculture",
    title: "Why Agriculture?",
    category: "Learn & discover",
    description:
      "Understand agriculture’s history, role in everyday life and its changing future.",
  },
];

function Explore() {
  return (
    <main className="explore-page">
      <div className="explore-page__inner">
        <section className="explore-hero" aria-labelledby="explore-title">
          <div className="explore-hero__content">
            <p className="explore-eyebrow">AGRI-GO · FARMING, CONNECTED</p>
            <h1 id="explore-title">Better tools for<br />better growing.</h1>
            <p>
              Explore practical resources for farm planning, markets, regional
              insights and the people behind agriculture.
            </p>
            <a className="explore-hero__link" href="#agriculture-features">
              Explore agriculture features <span aria-hidden="true">↓</span>
            </a>
          </div>
          <span className="explore-hero__caption">Tools for India’s farming community</span>
        </section>

        <section className="explore-features" id="agriculture-features" aria-labelledby="features-title">
          <div className="explore-features__heading">
            <div>
              <p className="explore-eyebrow">YOUR AGRICULTURE WORKSPACE</p>
              <h2 id="features-title">Explore AgriGO features</h2>
              <p>Choose a resource to find the information and connections you need.</p>
            </div>
            <span className="explore-features__count">{features.length} resources</span>
          </div>

          <div className="explore-features__grid">
            {features.map((feature) => (
              <article className="explore-feature" key={feature.to}>
                <Link className="explore-feature__link" to={feature.to}>
                  <div className="explore-feature__body">
                    <span className="explore-feature__category">{feature.category}</span>
                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>
                    <span className="explore-feature__action">
                      Explore feature <span aria-hidden="true">↗</span>
                    </span>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

export default Explore;
