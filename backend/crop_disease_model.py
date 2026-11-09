import re
from functools import lru_cache
from io import BytesIO

MODEL_ID = "neghani/plantvillage-mobilenetv2"
MODEL_REVISION = "d33601185b32cf05b3942661b8d84ffb86dc48ec"
CONFIDENCE_TEMPERATURE = 0.8845188130635788
MIN_CONFIDENCE = 0.85
MAX_IMAGE_PIXELS = 25_000_000
MODEL_CARD_URL = f"https://huggingface.co/{MODEL_ID}"
SUPPORTED_CROPS = {
    "apple",
    "blueberry",
    "cherry",
    "corn",
    "grape",
    "orange",
    "peach",
    "pepper",
    "potato",
    "raspberry",
    "soybean",
    "squash",
    "strawberry",
    "tomato",
}


class InvalidCropImage(ValueError):
    pass


def _normalize_crop_name(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]", "", value.casefold())
    return {
        "bellpepper": "pepper",
        "cornmaize": "corn",
        "maize": "corn",
        "pepperbell": "pepper",
    }.get(normalized, normalized)


def _format_label(label: str) -> tuple[str, str]:
    crop, separator, condition = label.partition("___")
    if not separator:
        return "Unknown crop", label.replace("_", " ").strip()
    crop_name = crop.replace("_", " ").replace(",", "").strip()
    if crop_name.casefold() == "pepper bell":
        crop_name = "Bell pepper"
    condition_name = condition.replace("_", " ").strip()
    condition_name = re.sub(r"\s+", " ", condition_name)
    condition_name = condition_name.replace("Haunglongbing", "Huanglongbing")
    if condition_name.casefold() == "healthy":
        condition_name = "Healthy appearance"
    return crop_name, condition_name


@lru_cache(maxsize=1)
def _load_disease_model():
    from transformers import AutoImageProcessor, AutoModelForImageClassification

    processor = AutoImageProcessor.from_pretrained(
        MODEL_ID,
        revision=MODEL_REVISION,
    )
    model = AutoModelForImageClassification.from_pretrained(
        MODEL_ID,
        revision=MODEL_REVISION,
        use_safetensors=True,
    )
    model.eval()
    return processor, model


def classify_crop_image(
    image_bytes: bytes,
    media_type: str,
    crop_name: str | None,
) -> dict:
    from PIL import Image, ImageOps, UnidentifiedImageError

    expected_formats = {
        "image/jpeg": "JPEG",
        "image/png": "PNG",
        "image/webp": "WEBP",
    }
    expected_format = expected_formats.get(media_type)
    if expected_format is None:
        raise InvalidCropImage("Choose a JPEG, PNG, or WebP image.")

    try:
        with Image.open(BytesIO(image_bytes)) as source:
            if source.format != expected_format:
                raise InvalidCropImage(
                    "The file contents do not match the selected image type."
                )
            if source.width * source.height > MAX_IMAGE_PIXELS:
                raise InvalidCropImage(
                    "This image has too many pixels. Resize it and try again."
                )
            source.verify()
        with Image.open(BytesIO(image_bytes)) as source:
            image = ImageOps.exif_transpose(source).convert("RGB")
    except InvalidCropImage:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise InvalidCropImage(
            "The image could not be decoded. Choose a valid JPEG, PNG, or WebP file."
        ) from error

    if crop_name and _normalize_crop_name(crop_name) not in SUPPORTED_CROPS:
        return {
            "status": "unsupported_crop",
            "predictions": [],
            "model": MODEL_ID,
            "model_revision": MODEL_REVISION,
            "model_card": MODEL_CARD_URL,
        }

    try:
        import torch
        processor, model = _load_disease_model()
    except (ImportError, OSError) as error:
        raise RuntimeError(
            "The crop disease model could not be loaded. Check the backend's "
            "deep-learning dependencies and network access to the model repository."
        ) from error

    inputs = processor(images=image, return_tensors="pt")
    with torch.inference_mode():
        logits = model(**inputs).logits[0]
        probabilities = torch.softmax(
            logits / CONFIDENCE_TEMPERATURE,
            dim=-1,
        ).tolist()

    labels = model.config.id2label
    if len(probabilities) != len(labels):
        raise RuntimeError("The crop disease model returned an unexpected class count.")

    ranked_indices = sorted(
        range(len(probabilities)),
        key=probabilities.__getitem__,
        reverse=True,
    )[:3]
    predictions = []
    for index in ranked_indices:
        raw_label = labels.get(index, labels.get(str(index)))
        if not isinstance(raw_label, str):
            raise RuntimeError("The crop disease model has an invalid class label.")
        predicted_crop, condition = _format_label(raw_label)
        predictions.append(
            {
                "crop": predicted_crop,
                "condition": condition,
                "confidence": round(float(probabilities[index]), 4),
            }
        )

    top_prediction = predictions[0]
    crop_mismatch = bool(
        crop_name
        and _normalize_crop_name(crop_name)
        != _normalize_crop_name(top_prediction["crop"])
    )
    status = (
        "crop_mismatch"
        if crop_mismatch
        else "candidate"
        if top_prediction["confidence"] >= MIN_CONFIDENCE
        else "uncertain"
    )
    return {
        "status": status,
        "predictions": predictions,
        "model": MODEL_ID,
        "model_revision": MODEL_REVISION,
        "model_card": MODEL_CARD_URL,
    }
