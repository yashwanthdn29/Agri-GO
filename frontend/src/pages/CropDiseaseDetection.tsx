import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api";

type DiseasePrediction = {
  crop: string;
  condition: string;
  confidence: number;
};

type ScreeningResponse = {
  status: "candidate" | "uncertain" | "crop_mismatch" | "unsupported_crop";
  predictions: DiseasePrediction[];
  model: string;
  model_revision: string;
  model_card: string;
};

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

function readImageAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read this image."));
        return;
      }
      const separator = reader.result.indexOf(",");
      if (separator < 0) {
        reject(new Error("Unable to read this image."));
        return;
      }
      resolve(reader.result.slice(separator + 1));
    };
    reader.onerror = () => reject(new Error("Unable to read this image."));
    reader.readAsDataURL(file);
  });
}

export default function CropDiseaseDetection() {
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const previewUrlRef = useRef<string | null>(null);
  const [cropName, setCropName] = useState("");
  const [result, setResult] = useState<ScreeningResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  function setSelectedImage(file: File | null) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = file ? URL.createObjectURL(file) : "";
    previewUrlRef.current = url || null;
    setPreviewUrl(url);
    setImage(file);
  }

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setResult(null);
    setError("");

    if (!file) {
      setSelectedImage(null);
      return;
    }
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setSelectedImage(null);
      setError("Choose a JPEG, PNG, or WebP image.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setSelectedImage(null);
      setError("Image must be 5 MB or smaller.");
      event.target.value = "";
      return;
    }
    setSelectedImage(file);
  }

  async function submitImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!image || loading) return;

    setLoading(true);
    setError("");
    setResult(null);
    try {
      const imageBase64 = await readImageAsBase64(image);
      const result = await apiRequest<ScreeningResponse>("/api/crop-disease/screen", {
        method: "POST",
        body: JSON.stringify({
          image_base64: imageBase64,
          media_type: image.type,
          crop_name: cropName.trim() || null,
        }),
      });
      setResult(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to screen this image.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-green-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-green-700">🌾 AgriGO</h1>
            <p className="text-sm text-gray-500">Crop health image screening</p>
          </div>
          <Link
            to="/farmer-dashboard"
            className="rounded-lg bg-green-700 px-5 py-2 font-semibold text-white hover:bg-green-800"
          >
            Farmer dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-6">
        <section className="rounded-2xl bg-emerald-950 p-7 text-white sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">
            Farmer tool · experimental deep-learning classifier
          </p>
          <h2 className="mt-3 text-3xl font-bold">Check a crop photo</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-100">
            A MobileNetV2 image classifier compares a leaf photo with 38 PlantVillage
            crop-health classes for apple, blueberry, cherry, corn, grape, orange,
            peach, pepper, potato, raspberry, soybean, squash, strawberry, and tomato.
            It can be wrong on real farm photos.
          </p>
        </section>

        <aside role="note" className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <strong>Research demo only — not for farm decisions.</strong>{" "}
          The model card reports only 4 correct top predictions out of 25 images in
          its small PlantDoc field-style evaluation. A high score is not proof of a
          disease. Confirm with a local KVK or agriculture officer; do not choose
          pesticide or treatment from this result.
        </aside>

        <form onSubmit={submitImage} className="mt-6 space-y-5 rounded-2xl bg-white p-6 shadow-sm sm:p-8">
          <div>
            <label htmlFor="crop-image" className="block font-semibold text-gray-800">
              Crop photo
            </label>
            <p className="mt-1 text-sm text-gray-500">
              Use JPEG, PNG, or WebP up to 5 MB. A close-up in natural light is most useful.
            </p>
            <input
              id="crop-image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={chooseImage}
              disabled={loading}
              className="mt-3 block w-full rounded-lg border border-gray-300 p-3 text-sm text-gray-700 file:mr-4 file:rounded-md file:border-0 file:bg-green-100 file:px-4 file:py-2 file:font-semibold file:text-green-800"
            />
          </div>

          {previewUrl && (
            <div className="flex justify-center rounded-xl bg-gray-50 p-3">
              <img
                src={previewUrl}
                alt="Selected crop for screening"
                className="max-h-80 max-w-full rounded-lg object-contain"
              />
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-gray-700">
              Crop, if known
              <input
                value={cropName}
                onChange={(event) => setCropName(event.target.value)}
                disabled={loading}
                maxLength={80}
                placeholder="e.g. tomato"
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 font-normal outline-none focus:border-green-600"
              />
            </label>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-800">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!image || loading}
            className="w-full rounded-lg bg-green-700 px-5 py-3 font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Loading model and classifying…" : "Classify crop image"}
          </button>
        </form>

        {result && (
          <section aria-labelledby="screening-result-title" className="mt-6 rounded-2xl border border-green-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-green-700">
                  {result.status === "candidate"
                    ? "Top class above the model’s screening threshold · not a diagnosis"
                    : result.status === "crop_mismatch"
                      ? "Top class does not match the crop you entered"
                      : result.status === "unsupported_crop"
                        ? "This crop is not supported by the model"
                        : "Uncertain · no class reached the screening threshold"}
                </p>
                <h2 id="screening-result-title" className="mt-2 text-2xl font-bold text-gray-900">
                  Model class scores
                </h2>
              </div>
              <span className="text-xs text-gray-500">MobileNetV2 · 38 classes</span>
            </div>
            <ol className="mt-5 space-y-3">
              {result.predictions.map((prediction, index) => (
                <li
                  key={`${prediction.crop}-${prediction.condition}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 p-4"
                >
                  <span className="font-semibold text-gray-800">
                    {index + 1}. {prediction.crop} — {prediction.condition}
                  </span>
                  <span className="text-sm text-gray-600">
                    Model score: {(prediction.confidence * 100).toFixed(1)}%
                  </span>
                </li>
              ))}
            </ol>
            {result.predictions.length === 0 && (
              <p className="mt-4 text-sm leading-6 text-gray-700">
                This model supports only the crop types listed above. It cannot
                screen this crop; contact a local KVK or agriculture officer.
              </p>
            )}
            <p className="mt-5 border-t border-gray-100 pt-4 text-xs leading-5 text-gray-500">
              Results are limited to the model’s 38 training classes. Crops or symptoms
              outside those classes may still be assigned a misleading score. Scores
              are not calibrated field probabilities. Confirm with a local KVK or
              agriculture officer before taking action.
            </p>
            <a
              className="mt-4 inline-block text-sm font-semibold text-green-800 underline underline-offset-2"
              href={result.model_card}
              target="_blank"
              rel="noreferrer"
            >
              Model card, license, and evaluation details
            </a>
          </section>
        )}

        <p className="mt-5 text-xs leading-5 text-gray-500">
          Images are processed by AgriGO’s backend using the pinned model weights.
          The first request downloads the model from Hugging Face; later requests use
          the local cache. Avoid including people or sensitive information.
        </p>
      </div>
    </main>
  );
}
