import { Link } from "react-router-dom";
import "./WhyAgriculture.css";

const timeline = [
  {
    period: "The first fields",
    era: "About 10,000 years ago",
    detail:
      "In several regions, people began tending useful plants, saving seed, and managing animals. These changes unfolded over generations—not in one place or at one moment—and helped communities build more settled ways of life.",
  },
  {
    period: "Water and knowledge",
    era: "Ancient societies",
    detail:
      "Irrigation, terracing, storage, tools, and shared knowledge shaped how communities grew food in very different landscapes. Trade connected harvests and ideas across regions.",
  },
  {
    period: "A changing toolkit",
    era: "Recent centuries",
    detail:
      "Mechanization, transport, breeding, and agricultural research changed how food is produced and moved. Higher output brought new questions about access, soil, water, and the costs of production.",
  },
  {
    period: "The next growing season",
    era: "Today and ahead",
    detail:
      "Farmers combine experience with forecasts, research, market information, and new tools. Useful advice still needs local context, reliable evidence, and a farmer's judgement.",
  },
];

const foodChain = [
  {
    number: "01",
    title: "Grow",
    detail:
      "Seeds, soil, water, weather, labour, and careful decisions shape what a field can produce.",
  },
  {
    number: "02",
    title: "Protect",
    detail:
      "Harvest timing, safe handling, storage, and transport help preserve food and its value.",
  },
  {
    number: "03",
    title: "Connect",
    detail:
      "Markets link producers to people, but access to information, infrastructure, and fair options matters.",
  },
];

function WhyAgriculture() {
  return (
    <div className="field-journal">
      <header className="field-journal__header">
        <div className="field-journal__utility">
          <span>AGRICULTURE · EXPLAINED</span>
          <span>AN AGRIGO FIELD JOURNAL</span>
        </div>
        <div className="field-journal__masthead">
          <Link to="/" className="field-journal__brand">
            AgriGO <span>FIELD JOURNAL</span>
          </Link>
          <Link to="/" className="field-journal__home">
            Back to AgriGO <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <nav className="field-journal__nav" aria-label="On this page">
          <a href="#big-picture">The big picture</a>
          <a href="#india">India's farm story</a>
          <a href="#challenges">Challenges & choices</a>
          <a href="#timeline">Through time</a>
        </nav>
      </header>

      <main className="field-journal__main">
        <section className="field-journal__cover" id="big-picture">
          <div className="field-journal__eyebrow">
            <span>THE BIG PICTURE</span>
            <span>PEOPLE · LAND · FOOD</span>
          </div>
          <div className="field-journal__cover-grid">
            <div>
              <p className="field-journal__kicker">A story that begins before breakfast</p>
              <h1>Every meal has a beginning in the field.</h1>
              <p className="field-journal__dek">
                Agriculture is the work of growing food and caring for the
                living systems around it. It connects a farmer's decisions to
                the food on our tables, the health of landscapes, and the
                livelihoods of communities.
              </p>
            </div>
            <aside className="field-journal__cover-note">
              <span className="field-journal__note-label">THE EDITOR'S NOTE</span>
              <p>
                To understand agriculture, look beyond the harvest. Follow the
                whole journey: the land, the people, the choices, and the
                connections that bring food to us.
              </p>
              <a href="#food-journey">Follow the food journey ↓</a>
            </aside>
          </div>
          <div className="field-journal__cover-rule">
            <span>AN INTRODUCTION TO AGRICULTURE</span>
            <span>READING TIME · 6 MIN</span>
          </div>
        </section>

        <section className="field-journal__lead-grid">
          <article className="field-journal__lead-story">
            <p className="field-journal__section-label">WHY IT MATTERS</p>
            <h2>More than what we grow</h2>
            <p className="field-journal__dropcap">
              Agriculture includes crops and livestock, but also the knowledge,
              work, and systems that help produce, preserve, and move food.
              Choices made on a farm can affect soil, water, habitats, and the
              people who depend on the land.
            </p>
            <p>
              No two farms are exactly alike. Climate, terrain, water access,
              local food traditions, available tools, and the resources a
              household can reach all shape what is possible. That is why
              practical farming advice needs a place, a season, and a source.
            </p>
            <p>
              Agriculture is also a shared story. Farmers grow and harvest;
              workers, traders, processors, transporters, and sellers help food
              reach kitchens. Reliable roads, storage, useful information, and
              functioning markets connect each step.
            </p>
          </article>

          <aside className="field-journal__brief">
            <p className="field-journal__section-label">THE STORY IN BRIEF</p>
            <h2>A connected system</h2>
            <ol>
              <li><span>01</span> Observe the land, water, weather, and crop.</li>
              <li><span>02</span> Plan with local knowledge and available resources.</li>
              <li><span>03</span> Grow and protect the crop and the people doing the work.</li>
              <li><span>04</span> Harvest, store, sell, and learn for the next season.</li>
            </ol>
            <div className="field-journal__pullquote">
              <span aria-hidden="true">“</span>
              <p>A farm is part of a landscape—and part of a community.</p>
            </div>
          </aside>
        </section>

        <section className="field-journal__journey" id="food-journey">
          <div className="field-journal__section-heading">
            <div>
              <p className="field-journal__section-label">FROM SOIL TO TABLE</p>
              <h2>A harvest is only one part of the journey.</h2>
            </div>
            <p>
              Food systems depend on many people and decisions, before and
              after crops leave the field.
            </p>
          </div>
          <div className="field-journal__journey-grid">
            {foodChain.map((step) => (
              <article className="field-journal__journey-item" key={step.number}>
                <span>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.detail}</p>
              </article>
            ))}
          </div>
          <p className="field-journal__caption">
            A simplified journey: the path varies by crop, region, and how
            food is produced and sold.
          </p>
        </section>

        <section className="field-journal__india" id="india">
          <div className="field-journal__india-heading">
            <p className="field-journal__section-label">A CLOSER LOOK · INDIA</p>
            <h2>One country, many farming realities.</h2>
          </div>
          <div className="field-journal__india-copy">
            <p>
              India's farms span varied climates, soils, rainfall patterns,
              and growing traditions. Crops, calendars, and practices differ
              from one region to another; a recommendation that suits one
              district or season may not suit the next.
            </p>
            <p>
              For farmers, planning can involve balancing expected weather,
              water, input costs, labour, crop needs, and the market available
              after harvest. Local experience is essential, while trusted
              extension services and clearly sourced data can help answer
              specific questions.
            </p>
            <p>
              There is no single measure of a successful season. Production
              matters, but so do farm income, food quality, worker safety,
              resilient soil and water, and the ability to keep farming in
              future seasons.
            </p>
          </div>
          <div className="field-journal__india-footer">
            <span>LOCAL CONTEXT FIRST</span>
            <p>
              Check crop, season, district, and source before acting on a
              general recommendation.
            </p>
          </div>
        </section>

        <section className="field-journal__challenges" id="challenges">
          <div className="field-journal__section-heading">
            <div>
              <p className="field-journal__section-label">THE WORK AHEAD</p>
              <h2>Challenges are connected, too.</h2>
            </div>
            <p>
              There is no single fix for issues that vary across farms and
              regions. Progress starts with understanding the local conditions.
            </p>
          </div>
          <div className="field-journal__challenge-grid">
            <article>
              <span>LAND & WATER</span>
              <h3>Protecting the foundation</h3>
              <p>
                Soil health, water availability, and biodiversity influence
                what can be grown. Stewardship choices need to reflect local
                conditions and long-term needs.
              </p>
            </article>
            <article>
              <span>WEATHER & RISK</span>
              <h3>Planning with uncertainty</h3>
              <p>
                Rainfall, heat, pests, and other changing conditions can make
                decisions harder. Forecasts can inform a plan, but they are
                not guarantees.
              </p>
            </article>
            <article>
              <span>PEOPLE & MARKETS</span>
              <h3>Making opportunity reachable</h3>
              <p>
                Access to advice, finance, storage, transport, and buyers
                shapes a farmer's options. Better information is useful when
                people can act on it.
              </p>
            </article>
          </div>
        </section>

        <section className="field-journal__technology">
          <div>
            <p className="field-journal__section-label">TOOLS WITH CONTEXT</p>
            <h2>Technology can inform a decision. It cannot make the decision for you.</h2>
            <p>
              Weather forecasts summarize likely conditions. Soil tests
              describe sampled ground. Market reports record transactions.
              Satellite observations and data models can reveal patterns, but
              each has limits tied to its source, place, and timing.
            </p>
          </div>
          <aside>
            <h3>Ask four questions of any farm insight</h3>
            <ul>
              <li>Who collected the information, and when?</li>
              <li>Is it measured, modelled, or calculated?</li>
              <li>What is missing or uncertain?</li>
              <li>Does it fit this crop, place, and season?</li>
            </ul>
          </aside>
        </section>

        <section className="field-journal__timeline" id="timeline">
          <div className="field-journal__section-heading">
            <div>
              <p className="field-journal__section-label">A BRIEF HISTORY</p>
              <h2>Farming changes with people and place.</h2>
            </div>
            <p>
              Agriculture has no single origin story. It developed in
              different regions, with different crops and animals, over many
              generations.
            </p>
          </div>
          <div className="field-journal__timeline-grid">
            {timeline.map((item, index) => (
              <article key={item.period}>
                <p className="field-journal__timeline-era">
                  {String(index + 1).padStart(2, "0")} / {item.era}
                </p>
                <h3>{item.period}</h3>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="field-journal__sources">
          <div>
            <p className="field-journal__section-label">READ BEYOND THIS PAGE</p>
            <h2>Go to the source.</h2>
            <p>
              Explore agriculture information and research from organizations
              working on food, farming, and climate.
            </p>
          </div>
          <ul>
            <li>
              <a href="https://www.fao.org/home/en" target="_blank" rel="noreferrer">
                Food and Agriculture Organization of the United Nations <span>↗</span>
              </a>
            </li>
            <li>
              <a href="https://icar.org.in/" target="_blank" rel="noreferrer">
                Indian Council of Agricultural Research <span>↗</span>
              </a>
            </li>
            <li>
              <a href="https://agriwelfare.gov.in/" target="_blank" rel="noreferrer">
                Government of India · Agriculture & Farmers Welfare <span>↗</span>
              </a>
            </li>
          </ul>
        </section>
      </main>

      <footer className="field-journal__footer">
        <Link to="/" className="field-journal__brand">AgriGO <span>FIELD JOURNAL</span></Link>
        <p>Learn from the field. Read the data with care.</p>
        <Link to="/explore">Explore AgriGO ↗</Link>
      </footer>
    </div>
  );
}

export default WhyAgriculture;
