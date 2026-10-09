import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api";
import "./MyFarm.css";

type FarmProfile = {
  id: number;
  farm_name: string | null;
  location: string | null;
  farm_size: number | null;
  soil_type: string | null;
};

type CropRecord = {
  id: number;
  crop_name: string;
  area_cultivated: number;
  season: string;
  status: string;
};

type FarmWorkspace = {
  profile: FarmProfile | null;
  crops: CropRecord[];
};

const emptyWorkspace: FarmWorkspace = { profile: null, crops: [] };

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function MyFarm() {
  const [workspace, setWorkspace] = useState(emptyWorkspace);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [farmName, setFarmName] = useState("");
  const [location, setLocation] = useState("");
  const [farmSize, setFarmSize] = useState("");
  const [soilType, setSoilType] = useState("");
  const [savingFarm, setSavingFarm] = useState(false);
  const [farmMessage, setFarmMessage] = useState("");
  const [farmError, setFarmError] = useState("");
  const [cropName, setCropName] = useState("");
  const [cropArea, setCropArea] = useState("");
  const [season, setSeason] = useState("");
  const [status, setStatus] = useState("growing");
  const [savingCrop, setSavingCrop] = useState(false);
  const [cropMessage, setCropMessage] = useState("");
  const [cropError, setCropError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    void apiRequest<FarmWorkspace>("/api/farmer/workspace", {
      signal: controller.signal,
    })
      .then((data) => {
        setWorkspace(data);
        setFarmName(data.profile?.farm_name ?? "");
        setLocation(data.profile?.location ?? "");
        setFarmSize(
          data.profile?.farm_size === null ||
            data.profile?.farm_size === undefined
            ? ""
            : String(data.profile.farm_size),
        );
        setSoilType(data.profile?.soil_type ?? "");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(errorMessage(error, "Unable to load your farm workspace."));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  const cultivatedArea = useMemo(
    () =>
      workspace.crops.reduce(
        (total, crop) => total + crop.area_cultivated,
        0,
      ),
    [workspace.crops],
  );

  async function saveFarm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFarmError("");
    setFarmMessage("");

    const size = Number(farmSize);
    if (!Number.isFinite(size) || size <= 0) {
      setFarmError("Enter a farm size greater than zero.");
      return;
    }

    setSavingFarm(true);
    try {
      const profile = await apiRequest<FarmProfile>("/api/farmer/profile", {
        method: "PUT",
        body: JSON.stringify({
          farm_name: farmName.trim(),
          location: location.trim(),
          farm_size: size,
          soil_type: soilType.trim(),
        }),
      });
      setWorkspace((current) => ({ ...current, profile }));
      setFarmMessage("Farm profile saved.");
    } catch (error: unknown) {
      setFarmError(errorMessage(error, "Unable to save your farm profile."));
    } finally {
      setSavingFarm(false);
    }
  }

  async function addCrop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCropError("");
    setCropMessage("");

    const area = Number(cropArea);
    if (!Number.isFinite(area) || area <= 0) {
      setCropError("Enter a cultivated area greater than zero.");
      return;
    }

    setSavingCrop(true);
    try {
      const data = await apiRequest<{ id: number }>("/api/farmer/crops", {
        method: "POST",
        body: JSON.stringify({
          crop_name: cropName.trim(),
          area_cultivated: area,
          season: season.trim(),
          status,
        }),
      });
      const crop: CropRecord = {
        id: data.id,
        crop_name: cropName.trim(),
        area_cultivated: area,
        season: season.trim(),
        status,
      };
      setWorkspace((current) => ({
        ...current,
        crops: [crop, ...current.crops],
      }));
      setCropName("");
      setCropArea("");
      setSeason("");
      setStatus("growing");
      setCropMessage("Crop added to your private workspace.");
    } catch (error: unknown) {
      setCropError(errorMessage(error, "Unable to add this crop."));
    } finally {
      setSavingCrop(false);
    }
  }

  return (
    <main className="my-farm-page">
      <div className="my-farm-page__inner">
        <header className="my-farm-header">
          <div>
            <p className="my-farm-eyebrow">PRIVATE FARMER WORKSPACE</p>
            <h1>My farm</h1>
            <p>
              Keep your farm profile and seasonal crop records together. These
              details are available only to your signed-in farmer account.
            </p>
          </div>
          <Link className="my-farm-back" to="/farmer-dashboard">
            Farmer dashboard
          </Link>
        </header>

        {loadError && (
          <div className="my-farm-alert" role="alert">
            {loadError}
          </div>
        )}

        {loading ? (
          <div className="my-farm-loading" role="status">
            Loading your private farm workspace…
          </div>
        ) : !loadError ? (
          <>
            <section className="my-farm-metrics" aria-label="Farm summary">
              <article>
                <span>Registered farm area</span>
                <strong>
                  {workspace.profile?.farm_size !== null &&
                  workspace.profile?.farm_size !== undefined
                    ? `${new Intl.NumberFormat("en-IN", {
                        maximumFractionDigits: 2,
                      }).format(workspace.profile.farm_size)} acres`
                    : "Not set"}
                </strong>
              </article>
              <article>
                <span>Crop records</span>
                <strong>{workspace.crops.length}</strong>
              </article>
              <article>
                <span>Sum of crop areas across records</span>
                <strong>
                  {new Intl.NumberFormat("en-IN", {
                    maximumFractionDigits: 2,
                  }).format(cultivatedArea)}{" "}
                  acres
                </strong>
              </article>
            </section>

            <div className="my-farm-columns">
              <section className="my-farm-panel">
                <div className="my-farm-panel__heading">
                  <div>
                    <p className="my-farm-eyebrow">FARM DETAILS</p>
                    <h2>{workspace.profile ? "Update profile" : "Set up your farm"}</h2>
                  </div>
                  <span className="my-farm-private-label">Private</span>
                </div>
                <form className="my-farm-form" onSubmit={saveFarm}>
                  <label>
                    Farm name
                    <input
                      required
                      maxLength={150}
                      value={farmName}
                      onChange={(event) => setFarmName(event.target.value)}
                      placeholder="e.g. Green Valley Farm"
                    />
                  </label>
                  <label>
                    Location
                    <input
                      required
                      maxLength={255}
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                      placeholder="Village, district, state"
                    />
                  </label>
                  <label>
                    Total farm area (acres)
                    <input
                      required
                      min="0.01"
                      step="0.01"
                      type="number"
                      value={farmSize}
                      onChange={(event) => setFarmSize(event.target.value)}
                      placeholder="e.g. 2.5"
                    />
                  </label>
                  <label>
                    Soil type
                    <input
                      required
                      maxLength={100}
                      value={soilType}
                      onChange={(event) => setSoilType(event.target.value)}
                      placeholder="e.g. Loamy"
                    />
                  </label>
                  {farmError && (
                    <p className="my-farm-form__error" role="alert">
                      {farmError}
                    </p>
                  )}
                  {farmMessage && (
                    <p className="my-farm-form__success" role="status">
                      {farmMessage}
                    </p>
                  )}
                  <button type="submit" disabled={savingFarm}>
                    {savingFarm ? "Saving…" : "Save farm profile"}
                  </button>
                </form>
              </section>

              <section className="my-farm-panel">
                <div className="my-farm-panel__heading">
                  <div>
                    <p className="my-farm-eyebrow">SEASON TRACKING</p>
                    <h2>Add a crop record</h2>
                  </div>
                </div>
                <form className="my-farm-form" onSubmit={addCrop}>
                  <label>
                    Crop
                    <input
                      required
                      maxLength={100}
                      value={cropName}
                      onChange={(event) => setCropName(event.target.value)}
                      placeholder="e.g. Rice"
                    />
                  </label>
                  <label>
                    Cultivated area (acres)
                    <input
                      required
                      min="0.01"
                      step="0.01"
                      type="number"
                      value={cropArea}
                      onChange={(event) => setCropArea(event.target.value)}
                      placeholder="e.g. 1.25"
                    />
                  </label>
                  <label>
                    Season
                    <input
                      required
                      maxLength={50}
                      value={season}
                      onChange={(event) => setSeason(event.target.value)}
                      placeholder="e.g. Kharif 2026"
                    />
                  </label>
                  <label>
                    Status
                    <select
                      value={status}
                      onChange={(event) => setStatus(event.target.value)}
                    >
                      <option value="planned">Planned</option>
                      <option value="growing">Growing</option>
                      <option value="harvested">Harvested</option>
                    </select>
                  </label>
                  {cropError && (
                    <p className="my-farm-form__error" role="alert">
                      {cropError}
                    </p>
                  )}
                  {cropMessage && (
                    <p className="my-farm-form__success" role="status">
                      {cropMessage}
                    </p>
                  )}
                  <button type="submit" disabled={savingCrop}>
                    {savingCrop ? "Adding…" : "Add crop"}
                  </button>
                </form>
              </section>
            </div>

            <section className="my-farm-panel my-farm-crops">
              <div className="my-farm-panel__heading">
                <div>
                  <p className="my-farm-eyebrow">YOUR RECORDS</p>
                  <h2>My crops</h2>
                </div>
                <span className="my-farm-private-label">Owner-only data</span>
              </div>
              {workspace.crops.length === 0 ? (
                <p className="my-farm-empty">
                  No crop records yet. Add a crop above to start tracking
                  cultivated area and season.
                </p>
              ) : (
                <div className="my-farm-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Crop</th>
                        <th scope="col">Season</th>
                        <th scope="col">Area</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.crops.map((crop) => (
                        <tr key={crop.id}>
                          <th scope="row">{crop.crop_name}</th>
                          <td>{crop.season}</td>
                          <td>
                            {new Intl.NumberFormat("en-IN", {
                              maximumFractionDigits: 2,
                            }).format(crop.area_cultivated)}{" "}
                            acres
                          </td>
                          <td>
                            <span className="my-farm-crop-status">
                              {crop.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <p className="my-farm-footnote">
              Summary values are calculated from information you entered; they
              are not government statistics or yield predictions. Explore{" "}
              <Link to="/agriculture-map">public regional agriculture data</Link>{" "}
              separately.
            </p>
          </>
        ) : null}
      </div>
    </main>
  );
}
