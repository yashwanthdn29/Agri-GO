import unittest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from crop_models import Crop
from database import Base, get_db
from dependencies import get_current_user
from farmer_models import FarmerProfile
from main import app
from models import User


class CropRecordTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(
            self.engine,
            tables=[
                User.__table__,
                FarmerProfile.__table__,
                Crop.__table__,
            ],
        )
        self.session = sessionmaker(bind=self.engine)()
        self.farmer = User(
            name="Crop farmer",
            email="crop-farmer@example.test",
            password_hash="unused",
            role="farmer",
        )
        self.other_farmer = User(
            name="Other farmer",
            email="other-farmer@example.test",
            password_hash="unused",
            role="farmer",
        )
        self.session.add_all([self.farmer, self.other_farmer])
        self.session.commit()

        def override_db():
            yield self.session

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = lambda: self.farmer
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        self.session.close()
        self.engine.dispose()

    def test_created_crop_is_returned_and_persisted_in_farmer_workspace(self):
        response = self.client.post(
            "/api/farmer/crops",
            json={
                "crop_name": "Rice",
                "area_cultivated": 1.25,
                "season": "Kharif 2026",
                "status": "growing",
            },
        )

        self.assertEqual(response.status_code, 200)
        created_crop = response.json()
        self.assertEqual(created_crop["crop_name"], "Rice")
        self.assertEqual(created_crop["area_cultivated"], 1.25)
        self.assertEqual(created_crop["season"], "Kharif 2026")
        self.assertEqual(created_crop["status"], "growing")

        crops_response = self.client.get("/api/farmer/crops")
        workspace_response = self.client.get("/api/farmer/workspace")

        self.assertEqual(crops_response.status_code, 200)
        self.assertEqual(crops_response.json()["total_crops"], 1)
        self.assertEqual(crops_response.json()["crops"], [created_crop])
        self.assertEqual(workspace_response.status_code, 200)
        self.assertEqual(workspace_response.json()["crops"], [created_crop])

    def test_crop_records_are_scoped_to_the_signed_in_farmer(self):
        self.session.add(
            Crop(
                farmer_id=self.other_farmer.id,
                crop_name="Wheat",
                area_cultivated=2,
                season="Rabi 2026",
                status="planned",
            )
        )
        self.session.commit()

        response = self.client.get("/api/farmer/workspace")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["crops"], [])

    def test_crop_creation_rejects_empty_or_invalid_fields(self):
        response = self.client.post(
            "/api/farmer/crops",
            json={
                "crop_name": "   ",
                "area_cultivated": 0,
                "season": "Kharif 2026",
                "status": "growing",
            },
        )

        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
