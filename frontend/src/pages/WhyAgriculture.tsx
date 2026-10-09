import { Link } from "react-router-dom";

const timeline = [
  {
    period: "Around 10,000 years ago",
    title: "People begin cultivating and keeping food",
    detail:
      "Farming emerged independently in several parts of the world. Communities gradually selected useful plants, saved seed, managed animals, and built more settled ways of life.",
  },
  {
    period: "Ancient and classical societies",
    title: "Water, soils, and shared knowledge shape civilizations",
    detail:
      "Irrigation, crop rotation, tools, storage, and local trade let communities support larger populations. Farming traditions developed differently with each landscape and climate.",
  },
  {
    period: "The last few centuries",
    title: "Mechanization and scientific agriculture change production",
    detail:
      "New machinery, plant breeding, transport, and agricultural research increased productivity in many regions, while also making soil, water, biodiversity, and equitable access important concerns.",
  },
  {
    period: "Today and next",
    title: "Farming combines local expertise with measured data",
    detail:
      "Farmers respond to changing weather, prices, pests, and resources. Satellite observations, forecasts, market reports, and AI can help organize evidence—but they must be transparent and checked against field experience.",
  },
];

function WhyAgriculture() {
  return (
    <div className="min-h-screen bg-[#f5f7f1] text-slate-900">
      <header className="border-b border-emerald-950/10 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link to="/" className="text-lg font-bold tracking-tight text-emerald-900">
            AgriGO
          </Link>
          <Link
            to="/"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back to home
          </Link>
        </div>
      </header>

      <main>
        <section className="bg-emerald-950 px-5 py-16 text-white sm:py-24">
          <div className="mx-auto max-w-6xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">
              A field guide for everyone
            </p>
            <h1 className="mt-4 max-w-4xl text-4xl font-bold leading-tight sm:text-6xl">
              Agriculture is how people care for the living systems that feed us.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-emerald-100">
              It is more than growing crops. Agriculture connects soil, water, plants,
              animals, knowledge, work, markets, and communities—and it shapes what
              ends up on our tables every day.
            </p>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-8 px-5 py-12 md:grid-cols-[1.2fr_0.8fr] md:py-16">
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">
              The essentials
            </p>
            <h2 className="mt-2 text-2xl font-bold">Why agriculture matters</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {[
                ["Food and nutrition", "Farms produce grains, fruits, vegetables, pulses, dairy, and many other foods that sustain people."],
                ["Livelihoods", "Agriculture supports farmers and workers across growing, storage, processing, transport, and trade."],
                ["Materials and landscapes", "Farms supply fibers and other renewable materials, and stewardship choices affect soil, water, habitats, and carbon."],
                ["Culture and resilience", "Local crops, seed knowledge, and seasonal practices carry generations of experience and help communities adapt."],
              ].map(([title, detail]) => (
                <div key={title} className="rounded-xl bg-[#f5f7f1] p-4">
                  <h3 className="font-bold text-emerald-950">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
                </div>
              ))}
            </div>
          </article>

          <aside className="rounded-2xl bg-lime-100 p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-900">
              A useful way to think about it
            </p>
            <h2 className="mt-2 text-2xl font-bold text-emerald-950">
              A farm is a connected system.
            </h2>
            <ol className="mt-5 space-y-3 text-sm leading-6 text-emerald-950">
              <li><strong>1. Observe:</strong> soil, water, weather, crop stage, and local advice.</li>
              <li><strong>2. Decide:</strong> what to plant, when to act, and what resources are available.</li>
              <li><strong>3. Grow:</strong> manage the crop while protecting people and the environment.</li>
              <li><strong>4. Harvest and connect:</strong> store, transport, sell, and learn for the next season.</li>
            </ol>
          </aside>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-12 md:pb-16">
          <div className="mb-7 max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">
              A brief, global timeline
            </p>
            <h2 className="mt-2 text-3xl font-bold">How agriculture changed over time</h2>
            <p className="mt-3 leading-7 text-slate-600">
              There is no single origin story: farming developed in different regions,
              with different crops and animals, over many generations.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {timeline.map((item, index) => (
              <article key={item.period} className="relative rounded-2xl border border-slate-200 bg-white p-6">
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">
                  {String(index + 1).padStart(2, "0")} · {item.period}
                </p>
                <h3 className="mt-2 text-lg font-bold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="bg-white px-5 py-12 md:py-16">
          <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">
                Technology with care
              </p>
              <h2 className="mt-2 text-3xl font-bold">Where data science can help</h2>
              <p className="mt-4 leading-7 text-slate-600">
                Weather models can summarize forecast conditions; machine learning
                can compare well-documented crop and market histories; satellite
                indices can flag changes in vegetation. Each result depends on its
                data, location, timing, and uncertainty. A model is a decision aid,
                never a substitute for a farmer’s knowledge or a field inspection.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-[#f5f7f1] p-6">
              <h3 className="text-lg font-bold">What responsible AgriGO insights should show</h3>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                <li>Where the information came from and when it was collected.</li>
                <li>Whether a value is measured, modelled, or calculated from records.</li>
                <li>How much data supports a chart or prediction—and what is missing.</li>
                <li>Practical next steps and when to ask a local agricultural expert.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-12">
          <div className="rounded-2xl bg-emerald-900 p-7 text-white sm:flex sm:items-center sm:justify-between sm:p-9">
            <div>
              <h2 className="text-2xl font-bold">Learn from the field, then explore the data.</h2>
              <p className="mt-2 text-sm text-emerald-100">
                AgriGO brings sourced weather, market reports, and agriculture tools together.
              </p>
            </div>
            <Link
              to="/explore"
              className="mt-5 inline-flex rounded-lg bg-white px-4 py-3 text-sm font-bold text-emerald-950 hover:bg-lime-100 sm:mt-0"
            >
              Explore AgriGO features ↗
            </Link>
          </div>
          <p className="mt-6 text-xs leading-5 text-slate-500">
            Further reading:{" "}
            <a className="underline" href="https://www.fao.org/home/en" target="_blank" rel="noreferrer">
              Food and Agriculture Organization of the United Nations
            </a>
            {" · "}
            <a className="underline" href="https://www.britannica.com/topic/agriculture" target="_blank" rel="noreferrer">
              Encyclopaedia Britannica: Agriculture
            </a>
          </p>
        </section>
      </main>
    </div>
  );
}

export default WhyAgriculture;
