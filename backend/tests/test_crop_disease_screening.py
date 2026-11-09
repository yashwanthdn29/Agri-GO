import base64
import builtins
import unittest
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image

from crop_disease_model import InvalidCropImage, _format_label, classify_crop_image
from database import get_db
from dependencies import get_current_user
from main import CropDiseaseImageRequest, app, screen_crop_disease


class CropDiseaseScreeningTests(unittest.TestCase):
    def load_torch_or_skip(self):
        try:
            import torch
        except (ImportError, OSError) as error:
            self.skipTest(f"PyTorch is unavailable in this environment: {error}")
        return torch

    def setUp(self):
        self.png_bytes = b"\x89PNG\r\n\x1a\nplaceholder"
        self.request = CropDiseaseImageRequest(
            image_base64=base64.b64encode(self.png_bytes).decode("ascii"),
            media_type="image/png",
            crop_name="Tomato",
        )
        self.user = SimpleNamespace(role="farmer")
        self.result = {
            "status": "candidate",
            "predictions": [
                {
                    "crop": "Tomato",
                    "condition": "Late blight",
                    "confidence": 0.91,
                }
            ],
            "model": "neghani/plantvillage-mobilenetv2",
            "model_revision": "pinned-revision",
            "model_card": "https://huggingface.co/neghani/plantvillage-mobilenetv2",
        }

    def test_endpoint_returns_pretrained_classifier_result(self):
        with patch("main.classify_crop_image", return_value=self.result) as classify:
            response = screen_crop_disease(self.request, current_user=self.user)

        classify.assert_called_once_with(self.png_bytes, "image/png", "Tomato")
        self.assertEqual(response, self.result)

    def test_rejects_non_farmer_workspace(self):
        with self.assertRaises(HTTPException) as raised:
            screen_crop_disease(
                self.request,
                current_user=SimpleNamespace(role="buyer"),
            )

        self.assertEqual(raised.exception.status_code, 403)

    def test_rejects_invalid_base64(self):
        invalid_request = self.request.model_copy(update={"image_base64": "not-base64"})

        with self.assertRaises(HTTPException) as raised:
            screen_crop_disease(invalid_request, current_user=self.user)

        self.assertEqual(raised.exception.status_code, 422)

    def test_rejects_images_larger_than_five_megabytes(self):
        too_large = b"x" * (5 * 1024 * 1024 + 1)
        invalid_request = self.request.model_copy(
            update={"image_base64": base64.b64encode(too_large).decode("ascii")}
        )

        with self.assertRaises(HTTPException) as raised:
            screen_crop_disease(invalid_request, current_user=self.user)

        self.assertEqual(raised.exception.status_code, 413)

    def test_rejects_bytes_that_are_not_a_supported_image(self):
        with patch("crop_disease_model._load_disease_model") as model_loader:
            with self.assertRaises(InvalidCropImage):
                classify_crop_image(b"not an image", "image/png", None)

        model_loader.assert_not_called()

    def test_missing_torch_runtime_fails_before_downloading_model_weights(self):
        image_buffer = BytesIO()
        Image.new("RGB", (4, 4), color=(0, 100, 0)).save(
            image_buffer,
            format="PNG",
        )
        original_import = builtins.__import__

        def import_without_torch(name, *args, **kwargs):
            if name == "torch":
                raise ImportError("PyTorch unavailable")
            return original_import(name, *args, **kwargs)

        with (
            patch("builtins.__import__", side_effect=import_without_torch),
            patch("crop_disease_model._load_disease_model") as model_loader,
        ):
            with self.assertRaisesRegex(RuntimeError, "deep-learning dependencies"):
                classify_crop_image(image_buffer.getvalue(), "image/png", "Tomato")

        model_loader.assert_not_called()

    def test_authenticated_http_upload_returns_screening_result(self):
        image_buffer = BytesIO()
        Image.new("RGB", (4, 4), color=(0, 100, 0)).save(
            image_buffer,
            format="PNG",
        )
        app.dependency_overrides[get_current_user] = lambda: self.user
        app.dependency_overrides[get_db] = lambda: None
        client = TestClient(app)
        try:
            with patch("main.classify_crop_image", return_value=self.result):
                response = client.post(
                    "/api/crop-disease/screen",
                    json={
                        "image_base64": base64.b64encode(
                            image_buffer.getvalue()
                        ).decode("ascii"),
                        "media_type": "image/png",
                        "crop_name": "Tomato",
                    },
                )
        finally:
            client.close()
            app.dependency_overrides.pop(get_current_user, None)
            app.dependency_overrides.pop(get_db, None)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), self.result)

    def test_formats_known_model_classes_for_the_interface(self):
        self.assertEqual(
            _format_label("Pepper,_bell___Bacterial_spot"),
            ("Bell pepper", "Bacterial spot"),
        )
        self.assertEqual(
            _format_label("Orange___Haunglongbing_(Citrus_greening)"),
            ("Orange", "Huanglongbing (Citrus greening)"),
        )
        self.assertEqual(
            _format_label("Tomato___healthy"),
            ("Tomato", "Healthy appearance"),
        )

    def test_classifier_uses_pinned_weights_and_abstains_on_low_score(self):
        torch = self.load_torch_or_skip()
        from io import BytesIO
        from PIL import Image

        labels = {
            index: f"Tomato___class_{index}"
            for index in range(38)
        }
        labels[0] = "Tomato___Late_blight"
        logits = torch.zeros((1, 38))

        class FakeProcessor:
            def __call__(self, **kwargs):
                return {"pixel_values": torch.zeros((1, 3, 224, 224))}

        class FakeModel:
            config = SimpleNamespace(id2label=labels)

            def __call__(self, **kwargs):
                return SimpleNamespace(logits=logits)

        model = FakeModel()
        buffer = BytesIO()
        Image.new("RGB", (4, 4), color=(0, 100, 0)).save(buffer, format="PNG")

        with patch("crop_disease_model._load_disease_model", return_value=(FakeProcessor(), model)):
            result = classify_crop_image(buffer.getvalue(), "image/png", "Tomato")

        self.assertEqual(result["status"], "uncertain")
        self.assertEqual(len(result["predictions"]), 3)
        self.assertEqual(result["predictions"][0]["condition"], "Late blight")
        self.assertEqual(result["model"], "neghani/plantvillage-mobilenetv2")

    def test_classifier_flags_crop_mismatch_and_normalizes_maize_alias(self):
        torch = self.load_torch_or_skip()
        from io import BytesIO
        from PIL import Image

        labels = {index: f"Tomato___class_{index}" for index in range(38)}
        labels[0] = "Corn_(maize)___Common_rust_"
        logits = torch.zeros((1, 38))
        logits[0, 0] = 10

        class FakeProcessor:
            def __call__(self, **kwargs):
                return {"pixel_values": torch.zeros((1, 3, 224, 224))}

        class FakeModel:
            config = SimpleNamespace(id2label=labels)

            def __call__(self, **kwargs):
                return SimpleNamespace(logits=logits)

        buffer = BytesIO()
        Image.new("RGB", (4, 4), color=(0, 100, 0)).save(buffer, format="PNG")

        with patch(
            "crop_disease_model._load_disease_model",
            return_value=(FakeProcessor(), FakeModel()),
        ):
            mismatch = classify_crop_image(buffer.getvalue(), "image/png", "Tomato")
            maize = classify_crop_image(buffer.getvalue(), "image/png", "Maize")

        self.assertEqual(mismatch["status"], "crop_mismatch")
        self.assertEqual(maize["status"], "candidate")
        self.assertEqual(maize["predictions"][0]["crop"], "Corn (maize)")

    def test_returns_unsupported_crop_without_loading_classifier(self):
        from io import BytesIO
        from PIL import Image

        buffer = BytesIO()
        Image.new("RGB", (4, 4), color=(0, 100, 0)).save(buffer, format="PNG")

        with patch("crop_disease_model._load_disease_model") as model_loader:
            result = classify_crop_image(buffer.getvalue(), "image/png", "Rice")

        self.assertEqual(result["status"], "unsupported_crop")
        self.assertEqual(result["predictions"], [])
        model_loader.assert_not_called()


if __name__ == "__main__":
    unittest.main()
