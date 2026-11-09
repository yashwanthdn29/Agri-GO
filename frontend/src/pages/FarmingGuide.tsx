import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { geoJSON } from "leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { apiRequest } from "../api";
import districtsBoundaryUrl from "../data/india-districts.geojson?url";
import {
  cropCategories,
  cropGuide,
  farmTools,
  farmToolCategories,
  fertilizerMeasurementExamples,
  fertilizerCategories,
  fertilizers,
} from "../data/indiaFarmingGuide";
import type {
  CropCategory,
  FarmToolCategory,
  FertilizerCategory,
} from "../data/indiaFarmingGuide";
import "./FarmingGuide.css";

type GuideTab = "crops" | "tools" | "fertilizers" | "regions" | "mandis";
type DistrictProperties = { name: string; state?: string };
type DistrictFeature = Feature<Geometry, DistrictProperties>;
type DistrictCollection = FeatureCollection<Geometry, DistrictProperties>;
type SnapshotMetric = {
  status: "available" | "unavailable" | "error";
  value: string | number | string[] | null;
  unit?: string;
  source?: string;
  year?: string | number;
  detail?: string;
};
type DistrictSnapshot = { metrics: Record<string, SnapshotMetric> };
type MandiRecord = {
  state: string;
  district: string;
  market: string;
  commodity: string;
  arrival_date: string | null;
  modal_price: number | string | null;
};
type MandiResponse = {
  source: string;
  fetched_at: string;
  records: MandiRecord[];
};

const tabs: { id: GuideTab; label: string; description: string }[] = [
  { id: "crops", label: "Crop library", description: "Food crops, growing windows and nutrition" },
  { id: "tools", label: "Farm tools", description: "What each implement does, crop uses and buying" },
  { id: "fertilizers", label: "Fertilizer guide", description: "Nutrients, use, safe measurement and price notes" },
  { id: "regions", label: "State & district", description: "Explore a locally relevant starting shortlist" },
  { id: "mandis", label: "Mandi places", description: "Reported market names and map search" },
];

const beginnerLessons: {
  title: string;
  example: string;
  tab: GuideTab;
}[] = [
  {
    title: "1. Get to know crops and seasons",
    example: "Compare rice, commonly grown in Kharif, with rabi wheat. Use season and state examples as a starting point, not a planting prescription.",
    tab: "crops",
  },
  {
    title: "2. Match tools to the job",
    example: "See how a seed drill places seed, then compare equipment options before deciding whether to hire, share, or buy.",
    tab: "tools",
  },
  {
    title: "3. Understand soil nutrients",
    example: "Learn what nutrient percentages on a fertilizer label mean. The calculations explain arithmetic, not how much your crop needs.",
    tab: "fertilizers",
  },
  {
    title: "4. Make it local",
    example: "Select a state and district to explore a state-level crop shortlist, then check local soil, water, season, and KVK guidance.",
    tab: "regions",
  },
  {
    title: "5. Explore how produce is traded",
    example: "Look up reported mandi names and compare market information; reported records are not a complete market directory or a price promise.",
    tab: "mandis",
  },
];

const seasonOptions = ["All seasons", "Kharif", "Rabi", "Zaid", "Perennial"];
const guideDisclaimer = "Planning guide only—not a crop census, yield promise, product endorsement or farm prescription. Confirm local season, variety, soil and water conditions with your Krishi Vigyan Kendra (KVK) or agriculture department.";

function FarmingGuide() {
  const [activeTab, setActiveTab] = useState<GuideTab>("crops");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CropCategory | "All categories">("All categories");
  const [season, setSeason] = useState("All seasons");
  const [toolCategory, setToolCategory] = useState<FarmToolCategory | "All equipment">("All equipment");
  const [fertilizerCategory, setFertilizerCategory] = useState<FertilizerCategory | "All inputs">("All inputs");
  const [selectedState, setSelectedState] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [districts, setDistricts] = useState<DistrictFeature[]>([]);
  const [districtError, setDistrictError] = useState("");
  const [loadingDistricts, setLoadingDistricts] = useState(true);
  const [districtSnapshot, setDistrictSnapshot] = useState<{ key: string; data: DistrictSnapshot } | null>(null);
  const [snapshotError, setSnapshotError] = useState<{ key: string; message: string } | null>(null);
  const [mandiRecords, setMandiRecords] = useState<MandiRecord[] | null>(null);
  const [mandiError, setMandiError] = useState("");
  const [mandiRetry, setMandiRetry] = useState(0);
  const [mandiState, setMandiState] = useState("");
  const [mandiSearch, setMandiSearch] = useState("");

  useEffect(() => {
    let active = true;
    async function loadDistrictNames() {
      try {
        const response = await fetch(districtsBoundaryUrl);
        if (!response.ok) throw new Error(`District data request failed (${response.status}).`);
        const data: unknown = await response.json();
        if (
          typeof data !== "object" ||
          data === null ||
          !("features" in data) ||
          !Array.isArray(data.features)
        ) {
          throw new Error("District data has an invalid GeoJSON structure.");
        }
        const features = (data as DistrictCollection).features
          .filter((feature: DistrictFeature) => feature.properties.name && feature.properties.state)
          .sort((left, right) => left.properties.name.localeCompare(right.properties.name));
        if (active) setDistricts(features);
      } catch (error) {
        if (active) {
          setDistrictError(error instanceof Error ? error.message : "Could not load district names.");
        }
      } finally {
        if (active) setLoadingDistricts(false);
      }
    }
    void loadDistrictNames();
    return () => { active = false; };
  }, []);

  const states = useMemo(
    () => [...new Set(districts.map((feature) => feature.properties.state).filter((state): state is string => Boolean(state)))].sort(),
    [districts],
  );
  const stateDistricts = useMemo(
    () => districts.filter((feature) => feature.properties.state === selectedState),
    [districts, selectedState],
  );

  useEffect(() => {
    if (!selectedState || !selectedDistrict) return;
    const key = `${selectedState}\u0000${selectedDistrict}`;
    const feature = stateDistricts.find((item) => item.properties.name === selectedDistrict);
    if (!feature) return;

    let active = true;
    const center = geoJSON(feature).getBounds().getCenter();
    const params = new URLSearchParams({
      latitude: String(center.lat),
      longitude: String(center.lng),
      state: selectedState,
      district: selectedDistrict,
    });
    void apiRequest<DistrictSnapshot>(`/api/agriculture/snapshot?${params}`)
      .then((snapshot) => {
        if (active) setDistrictSnapshot({ key, data: snapshot });
      })
      .catch((error: unknown) => {
        if (active) {
          setSnapshotError({
            key,
            message: error instanceof Error ? error.message : "District data is unavailable.",
          });
        }
      });

    return () => { active = false; };
  }, [selectedDistrict, selectedState, stateDistricts]);

  useEffect(() => {
    if (activeTab !== "mandis" || mandiRecords !== null) return;
    let active = true;
    void apiRequest<MandiResponse>("/api/market-prices?limit=500")
      .then((response) => {
        if (active) setMandiRecords(response.records);
      })
      .catch((error: unknown) => {
        if (active) setMandiError(error instanceof Error ? error.message : "AGMARKNET market reports are unavailable.");
      });
    return () => { active = false; };
  }, [activeTab, mandiRecords, mandiRetry]);

  const mandiPlaces = useMemo(() => {
    if (!mandiRecords) return [];
    const uniquePlaces = new Map<string, MandiRecord>();
    for (const record of mandiRecords) {
      const key = [record.market, record.district, record.state].join("|").toLocaleLowerCase();
      if (record.market && record.district && record.state && !uniquePlaces.has(key)) {
        uniquePlaces.set(key, record);
      }
    }
    const query = mandiSearch.trim().toLocaleLowerCase();
    return [...uniquePlaces.values()].filter((record) =>
      (!mandiState || record.state === mandiState) &&
      (!query || [record.market, record.district, record.state, record.commodity]
        .some((value) => value.toLocaleLowerCase().includes(query))),
    );
  }, [mandiRecords, mandiSearch, mandiState]);
  const mandiStates = useMemo(
    () => [...new Set(mandiRecords?.map((record) => record.state) ?? [])].sort(),
    [mandiRecords],
  );
  const visibleCrops = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return cropGuide.filter((crop) => {
      const matchesSearch = !query || [
        crop.name,
        crop.category,
        crop.season,
        crop.duration,
        crop.nutrients,
        crop.foodValue,
      ].some((value) => value.toLocaleLowerCase().includes(query));
      const matchesCategory = category === "All categories" || crop.category === category;
      const matchesSeason = season === "All seasons" || crop.season.toLocaleLowerCase().includes(season.toLocaleLowerCase());
      return matchesSearch && matchesCategory && matchesSeason;
    });
  }, [category, search, season]);

  const regionalCrops = useMemo(
    () => cropGuide.filter((crop) => !selectedState || crop.states.includes(selectedState)),
    [selectedState],
  );
  const visibleTools = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return farmTools.filter((tool) =>
      (toolCategory === "All equipment" || tool.category === toolCategory) &&
      (!query || Object.values(tool).some((value) =>
        typeof value === "string" && value.toLocaleLowerCase().includes(query),
      )),
    );
  }, [search, toolCategory]);
  const visibleFertilizers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return fertilizers.filter((item) =>
      (fertilizerCategory === "All inputs" || item.category === fertilizerCategory) &&
      (!query || Object.values(item).some((value) => value.toLocaleLowerCase().includes(query))),
    );
  }, [fertilizerCategory, search]);
  const currentDistrictKey = `${selectedState}\u0000${selectedDistrict}`;
  const currentDistrictSnapshot = districtSnapshot?.key === currentDistrictKey
    ? districtSnapshot.data
    : null;
  const currentSnapshotError = snapshotError?.key === currentDistrictKey
    ? snapshotError.message
    : "";

  function selectTab(tab: GuideTab) {
    setActiveTab(tab);
    setSearch("");
    setCategory("All categories");
    setSeason("All seasons");
    setToolCategory("All equipment");
    setFertilizerCategory("All inputs");
  }

  return (
    <main className="farming-guide">
      <header className="farming-guide__hero">
        <div className="farming-guide__hero-copy">
          <p className="farming-guide__eyebrow">THE AGRIGO FIELD GUIDE</p>
          <h1>Start with the essentials.<br /><span>Grow with confidence.</span></h1>
          <p>A practical introduction to India’s food crops, the tools that grow them, farm inputs and regional planning—written for first-time learners and working growers.</p>
          <div className="farming-guide__hero-links">
            <Link className="farming-guide__map-link" to="/agmarknet">Open the farm boundary map <span aria-hidden="true">↗</span></Link>
            <Link className="farming-guide__map-link" to="/market-prices">View reported AGMARKNET mandi prices <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
        <div className="farming-guide__hero-stat">
          <span>FIELD NOTES</span>
          <strong>{cropGuide.length}</strong>
          <p>crops, plantation species and forage options</p>
          <small>India-focused reference · local suitability varies</small>
        </div>
      </header>

      <section className="farming-guide__learning-path" aria-labelledby="learning-path-title">
        <div className="farming-guide__learning-heading">
          <div>
            <p className="farming-guide__eyebrow">NEW TO AGRICULTURE?</p>
            <h2 id="learning-path-title">A beginner’s learning path</h2>
            <p>Start with the basics, try the examples, then explore what is specific to your region.</p>
          </div>
          <span>5 short lessons</span>
        </div>
        <ol className="farming-guide__lesson-grid">
          {beginnerLessons.map((lesson) => (
            <li key={lesson.tab}>
              <article>
                <h3>{lesson.title}</h3>
                <p>{lesson.example}</p>
                <button type="button" onClick={() => selectTab(lesson.tab)}>
                  Open lesson <span aria-hidden="true">→</span>
                </button>
              </article>
            </li>
          ))}
        </ol>
      </section>

      <div className="farming-guide__nav-intro">
        <div>
          <p className="farming-guide__eyebrow">EXPLORE BY TOPIC</p>
          <p>Choose a section to open its own guide. One topic is shown at a time.</p>
        </div>
      </div>
      <nav className="farming-guide__tabs" aria-label="Choose a farming guide topic">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? "farming-guide__tab farming-guide__tab--active" : "farming-guide__tab"}
            aria-pressed={activeTab === tab.id}
            onClick={() => selectTab(tab.id)}
          >
            <strong>{tab.label}</strong><span>{tab.description}</span>
          </button>
        ))}
      </nav>

      {activeTab === "crops" && (
        <section className="farming-guide__section" aria-labelledby="crop-title">
          <div className="farming-guide__section-heading">
            <div><p className="farming-guide__eyebrow">KNOW WHAT YOU GROW</p><h2 id="crop-title">India crop library</h2><p>Explore field crops, pulses, oilseeds, vegetables, fruits, plantation crops, fodder and medicinal plants. This broad overview is not a full list of regional varieties; confirm local suitability and calendars with your KVK or agriculture department.</p></div>
            <span className="farming-guide__count">{visibleCrops.length} crops shown</span>
          </div>
          <div className="farming-guide__filters">
            <label>Search crops<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try rice, iron, rabi…" /></label>
            <label>Crop group<select value={category} onChange={(event) => setCategory(event.target.value as CropCategory | "All categories")}><option>All categories</option>{cropCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Season<select value={season} onChange={(event) => setSeason(event.target.value)}>{seasonOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <div className="farming-guide__crop-grid">
            {visibleCrops.map((crop) => (
              <article className="farming-guide__card farming-guide__crop-card" key={crop.name}>
                <div className="farming-guide__card-top"><span className="farming-guide__badge">{crop.category}</span><span>{crop.season}</span></div>
                <h3>{crop.name}</h3>
                <p>{crop.foodValue}</p>
                <dl><div><dt>Growing window</dt><dd>{crop.duration}</dd></div><div><dt>Protein / 100 g</dt><dd>{crop.protein}</dd></div><div><dt>Other nutrients</dt><dd>{crop.nutrients}</dd></div><div><dt>Common growing states</dt><dd>{crop.states.slice(0, 4).join(", ")}{crop.states.length > 4 ? " +" : ""}</dd></div></dl>
              </article>
            ))}
            {visibleCrops.length === 0 && <p className="farming-guide__empty">No crops match these filters. Try another crop name, group or season.</p>}
          </div>
          <p className="farming-guide__note">Nutrition values are approximate per 100 g of the named edible food (generally raw or dry as commonly reported), not a fertilizer analysis. Cooking, cultivar and moisture change values; use food-composition databases for clinical diets.</p>
        </section>
      )}

      {activeTab === "tools" && (
        <section className="farming-guide__section" aria-labelledby="tools-title">
          <div className="farming-guide__section-heading"><div><p className="farming-guide__eyebrow">EQUIP THE FARM</p><h2 id="tools-title">Essential tools &amp; machinery</h2><p>Know the job first; owning, sharing or hiring can each make sense at different farm sizes.</p></div><span className="farming-guide__count">{visibleTools.length} tools</span></div>
          <div className="farming-guide__filters farming-guide__filters--catalog">
            <label>Find equipment<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tractors, implements, uses…" /></label>
            <label>Equipment type<select value={toolCategory} onChange={(event) => setToolCategory(event.target.value as FarmToolCategory | "All equipment")}><option>All equipment</option>{farmToolCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <div className="farming-guide__tool-grid">
            {visibleTools.map((tool) => (
              <article className="farming-guide__card farming-guide__tool-card" key={tool.name}>
                <div className="farming-guide__card-top"><span className="farming-guide__badge">{tool.category}</span></div>
                <span className="farming-guide__card-kicker">FARM EQUIPMENT</span>
                <h3>{tool.name}</h3>
                <p>{tool.importance}</p>
                <dl>
                  {tool.powerRequirement && <div><dt>Power &amp; fit</dt><dd>{tool.powerRequirement}</dd></div>}
                  <div><dt>What it does</dt><dd>{tool.purpose}</dd></div>
                  <div><dt>Suitable crops / work</dt><dd>{tool.cropUses}</dd></div>
                  <div><dt>Price guidance</dt><dd>{tool.price}</dd></div>
                  <div><dt>Where to find it</dt><dd>{tool.source}</dd></div>
                </dl>
              </article>
            ))}
            {visibleTools.length === 0 && <p className="farming-guide__empty">No tools match that search.</p>}
          </div>
          <aside className="farming-guide__callout"><strong>Before buying machinery</strong><p>Compare the written quotation, GST, warranty, spare parts, operator training and safety guards. Ask your district agriculture office about Custom Hiring Centres and current subsidy eligibility. Prices are broad planning estimates, not dealer quotations.</p></aside>
        </section>
      )}

      {activeTab === "fertilizers" && (
        <section className="farming-guide__section" aria-labelledby="fertilizer-title">
          <div className="farming-guide__section-heading"><div><p className="farming-guide__eyebrow">FEED THE SOIL, NOT GUESSWORK</p><h2 id="fertilizer-title">Fertilizer &amp; soil nutrition</h2><p>Compare nutrient sources, organic inputs, biofertilizers and soil amendments. Select products and rates from soil tests, crop need and current labels—not a generic guide.</p></div><span className="farming-guide__count">{visibleFertilizers.length} inputs shown</span></div>
          <div className="farming-guide__filters farming-guide__filters--catalog">
            <label>Find an input<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search nutrient, product or use…" /></label>
            <label>Input type<select value={fertilizerCategory} onChange={(event) => setFertilizerCategory(event.target.value as FertilizerCategory | "All inputs")}><option>All inputs</option>{fertilizerCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <div className="farming-guide__fertilizer-grid">
            {visibleFertilizers.map((item) => (
              <article className="farming-guide__card farming-guide__fertilizer-card" key={item.name}>
                <div className="farming-guide__card-top"><span className="farming-guide__badge">{item.category}</span></div>
                <span className="farming-guide__card-kicker">FARM INPUT</span>
                <h3>{item.name}</h3>
                <dl>
                  <div><dt>What it supplies</dt><dd>{item.nutrients}</dd></div>
                  <div><dt>Why it is used</dt><dd>{item.purpose}</dd></div>
                  <div><dt>Crop examples</dt><dd>{item.cropExamples}</dd></div>
                  <div><dt>Price / availability</dt><dd>{item.price}</dd></div>
                </dl>
              </article>
            ))}
            {visibleFertilizers.length === 0 && <p className="farming-guide__empty">No fertilizers match that search.</p>}
          </div>
          <section className="farming-guide__measure"><div><p className="farming-guide__eyebrow">MEASURED APPLICATION</p><h3>How to calculate product quantity</h3><p>The nutrient percentage on the bag is the fraction used in the calculation. These are arithmetic examples, not crop recommendations.</p></div>{fertilizerMeasurementExamples.map((example) => <div className="farming-guide__equation" key={example.label}><strong>{example.label}</strong><span>{example.calculation}</span></div>)}</section>
          <aside className="farming-guide__callout farming-guide__callout--warning"><strong>Use safely and buy genuine products</strong><p>Base rate and timing on a soil test, crop and local university/state recommendation. Read the entire label, wear the stated PPE, store sealed away from children, food and water, and never mix products unless the label allows it. Buy sealed, labelled stock from a licensed dealer; check manufacturer, batch, seal, expiry and printed MRP, request a bill, and report suspected counterfeits to the state agriculture department. A high price or “powerful” claim does not prove quality. Do not apply micronutrients or pesticides without a diagnosed need and label directions.</p></aside>
          <p className="farming-guide__note">Prices are approximate market planning ranges, may be outdated, and are not live quotes or endorsements. Regulated MRPs, product grades, subsidies and state retail prices change; check the current sealed-pack MRP and your local licensed dealer before purchase.</p>
        </section>
      )}

      {activeTab === "regions" && (
        <section className="farming-guide__section" aria-labelledby="regions-title">
          <div className="farming-guide__section-heading"><div><p className="farming-guide__eyebrow">PLAN FOR YOUR PLACE</p><h2 id="regions-title">State &amp; district crop explorer</h2><p>Choose a location to see crops commonly associated with the state in this guide.</p></div><Link className="farming-guide__map-link" to="/agriculture-map">View agriculture indicators <span aria-hidden="true">↗</span></Link></div>
          <div className="farming-guide__filters farming-guide__filters--region">
            <label>State / union territory<select value={selectedState} onChange={(event) => { setSelectedState(event.target.value); setSelectedDistrict(""); }}><option value="">Select a state or union territory</option>{states.map((state) => <option key={state}>{state}</option>)}</select></label>
            <label>District<select value={selectedDistrict} onChange={(event) => setSelectedDistrict(event.target.value)} disabled={!selectedState || loadingDistricts}><option value="">{selectedState ? "Select a district" : "Choose a state first"}</option>{stateDistricts.map((feature) => <option key={feature.properties.name}>{feature.properties.name}</option>)}</select></label>
          </div>
          {districtError && <p className="farming-guide__error" role="alert">{districtError} State and district names come from the bundled map boundary data.</p>}
          {selectedState ? (
            <>
              <div className="farming-guide__region-summary"><strong>{selectedDistrict ? `${selectedDistrict}, ${selectedState}` : selectedState}</strong><span>{regionalCrops.length} crops in the state-level guide shortlist</span></div>
              {selectedDistrict && (
                <section className="farming-guide__district-data" aria-live="polite">
                  <div><p className="farming-guide__eyebrow">DISTRICT DATA CHECK</p><h3>Reported crop production</h3><p>This optional government-data snapshot is specific to the selected district when a matching dataset is configured.</p></div>
                  {!currentDistrictSnapshot && !currentSnapshotError ? <p role="status">Checking available district records…</p> : currentSnapshotError ? <p className="farming-guide__error" role="alert">{currentSnapshotError}</p> : currentDistrictSnapshot?.metrics.crop_production?.status === "available" ? <p><strong>{currentDistrictSnapshot.metrics.crop_production.value} {currentDistrictSnapshot.metrics.crop_production.unit}</strong>{currentDistrictSnapshot.metrics.crop_production.year ? ` · ${currentDistrictSnapshot.metrics.crop_production.year}` : ""}{currentDistrictSnapshot.metrics.crop_production.source ? ` · Source: ${currentDistrictSnapshot.metrics.crop_production.source}` : ""}</p> : <p>{currentDistrictSnapshot?.metrics.crop_production?.detail ?? "A district-level crop-production dataset is not configured or has no matching record. The crop shortlist below is state-level guidance only."}</p>}
                </section>
              )}
              {regionalCrops.length > 0 ? <div className="farming-guide__region-grid">{regionalCrops.map((crop) => <article key={crop.name}><span>{crop.category}</span><h3>{crop.name}</h3><p>{crop.season} · {crop.duration}</p></article>)}</div> : <p className="farming-guide__empty">This state is not represented in the curated crop shortlist yet. Check with your local KVK for district-specific crops and varieties.</p>}
              {selectedDistrict && <p className="farming-guide__note">District boundaries help identify your place; this shortlist is based on state-level associations and is not district production data. Actual suitability depends on local soil, rainfall, irrigation, season, variety, market and current agriculture-department guidance.</p>}
            </>
          ) : <p className="farming-guide__empty">{loadingDistricts ? "Loading the bundled state and district names…" : "Select a state to see the crop shortlist."}</p>}
          <div className="farming-guide__region-actions"><Link to="/agriculture-map">Explore regional agriculture indicators</Link><Link to="/market-prices">See reported mandi names &amp; prices</Link><Link to="/agmarknet">Open the farm boundary map</Link><Link to="/crop-recommendation">Open crop suitability prototype</Link></div>
        </section>
      )}

      {activeTab === "mandis" && (
        <section className="farming-guide__section" aria-labelledby="mandis-title">
          <div className="farming-guide__section-heading">
            <div><p className="farming-guide__eyebrow">REPORTED MARKET PLACES</p><h2 id="mandis-title">AGMARKNET mandi place finder</h2><p>Browse market names present in the latest fetched mandi reports and open a named place in the map.</p></div>
            <Link className="farming-guide__map-link" to="/market-prices">Open market price analysis <span aria-hidden="true">↗</span></Link>
          </div>
          <div className="farming-guide__filters farming-guide__filters--region">
            <label>Search market, district or commodity<input value={mandiSearch} onChange={(event) => setMandiSearch(event.target.value)} placeholder="Try a mandi or crop name…" /></label>
            <label>State<select value={mandiState} onChange={(event) => setMandiState(event.target.value)}><option value="">All reported states</option>{mandiStates.map((state) => <option key={state}>{state}</option>)}</select></label>
          </div>
          {mandiError ? <div className="farming-guide__error" role="alert"><p>{mandiError}</p><button type="button" onClick={() => { setMandiError(""); setMandiRecords(null); setMandiRetry((current) => current + 1); }}>Retry market report lookup</button></div>
            : mandiRecords === null ? <p className="farming-guide__empty" role="status">Loading reported mandi places…</p>
              : <><div className="farming-guide__region-summary"><strong>{mandiPlaces.length} reported places</strong><span>Names are deduplicated from up to 500 fetched records.</span></div>
                <div className="farming-guide__mandi-grid">{mandiPlaces.map((record) => <article key={`${record.market}-${record.district}-${record.state}`}><span>{record.state}</span><h3>{record.market}</h3><p>{record.district} · Latest reported commodity: {record.commodity}</p><Link to={`/agmarknet?location=${encodeURIComponent(`${record.market}, ${record.district}, ${record.state}`)}`}>Locate on farm map ↗</Link></article>)}
                  {mandiPlaces.length === 0 && <p className="farming-guide__empty">No places match those filters in the fetched records.</p>}</div>
                <p className="farming-guide__note">This directory reflects only the market names in the fetched AGMARKNET/data.gov.in report page, not a complete national market register. Map search uses the selected place name to find a map location; it does not claim that the mandi has an official surveyed pin.</p>
              </>}
        </section>
      )}

      <footer className="farming-guide__footer">
        <strong>Good farming is local.</strong>
        <p>{guideDisclaimer}</p>
        <section aria-labelledby="guide-sources-title">
          <h2 id="guide-sources-title">Sources &amp; where to learn more</h2>
          <p className="farming-guide__sources-note">Use these official resources to verify current, locally applicable information. The crop and equipment cards are introductory summaries, not substitutes for local recommendations.</p>
          <div className="farming-guide__sources-grid">
            <a href="https://icar.org.in/" target="_blank" rel="noreferrer">
              <strong>Indian Council of Agricultural Research (ICAR)</strong>
              <span>Research and agricultural knowledge from India’s national agricultural research system.</span>
            </a>
            <a href="https://kvk.icar.gov.in/" target="_blank" rel="noreferrer">
              <strong>Krishi Vigyan Kendra (KVK) network</strong>
              <span>Find a local extension centre for region-specific crop and farming advice.</span>
            </a>
            <a href="https://soilhealth.dac.gov.in/" target="_blank" rel="noreferrer">
              <strong>Soil Health Card portal</strong>
              <span>Learn about soil testing and soil-health recommendations.</span>
            </a>
            <a href="https://agmarknet.gov.in/" target="_blank" rel="noreferrer">
              <strong>AGMARKNET</strong>
              <span>Explore reported agricultural market information and prices.</span>
            </a>
          </div>
        </section>
      </footer>
    </main>
  );
}

export default FarmingGuide;
