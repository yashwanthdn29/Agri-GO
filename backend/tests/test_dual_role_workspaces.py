import unittest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from dependencies import get_current_user
from main import app
from models import User
from order_models import Order
from product_models import Product


class DualRoleWorkspaceTests(unittest.TestCase):
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
                Product.__table__,
                Order.__table__,
            ],
        )
        self.session = sessionmaker(bind=self.engine)()
        self.user = User(
            name="Dual role user",
            email="dual@example.test",
            password_hash="unused",
            role="farmer",
        )
        seller = User(
            name="Other farmer",
            email="farmer@example.test",
            password_hash="unused",
            role="farmer",
        )
        buyer = User(
            name="Other buyer",
            email="buyer@example.test",
            password_hash="unused",
            role="buyer",
        )
        self.session.add_all([self.user, seller, buyer])
        self.session.flush()
        self.own_product = Product(
            farmer_id=self.user.id,
            product_name="Own rice",
            category="Grains",
            quantity=10,
            unit="kg",
            price_per_unit=20,
            location="Mandya",
            status="available",
        )
        self.other_product = Product(
            farmer_id=seller.id,
            product_name="Wheat",
            category="Grains",
            quantity=10,
            unit="kg",
            price_per_unit=30,
            location="Mysuru",
            status="available",
        )
        self.session.add_all([self.own_product, self.other_product])
        self.session.commit()
        self.other_buyer = buyer

        def override_db():
            yield self.session

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        self.session.close()
        self.engine.dispose()

    def test_existing_account_can_enable_both_workspaces_and_use_each(self):
        upgrade = self.client.post("/api/me/enable-both-workspaces")
        self.assertEqual(upgrade.status_code, 200)
        self.assertEqual(upgrade.json()["user"]["role"], "both")

        listing = self.client.post(
            "/api/marketplace/products",
            json={
                "product_name": "Tomato",
                "category": "Vegetables",
                "quantity": 5,
                "unit": "kg",
                "price_per_unit": 25,
                "location": "Mandya",
            },
        )
        self.assertEqual(listing.status_code, 200)

        marketplace = self.client.get("/api/marketplace/products")
        self.assertEqual(marketplace.status_code, 200)
        self.assertEqual(
            [product["product_name"] for product in marketplace.json()["products"]],
            ["Wheat"],
        )

        own_order = self.client.post(
            "/api/orders",
            json={"product_id": self.own_product.id, "quantity": 1},
        )
        self.assertEqual(own_order.status_code, 400)

        buyer_order = self.client.post(
            "/api/orders",
            json={"product_id": self.other_product.id, "quantity": 1},
        )
        self.assertEqual(buyer_order.status_code, 200)

        farmer_order = Order(
            buyer_id=self.other_buyer.id,
            product_id=self.own_product.id,
            quantity=2,
            total_price=40,
            status="pending",
        )
        self.session.add(farmer_order)
        self.session.commit()

        requests = self.client.get("/api/farmer/orders")
        self.assertEqual(requests.status_code, 200)
        self.assertEqual(len(requests.json()["orders"]), 1)

        accepted = self.client.patch(
            f"/api/orders/{farmer_order.id}",
            json={"status": "accepted"},
        )
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.json()["order"]["status"], "accepted")

    def test_public_marketplace_shows_available_listings_without_login(self):
        app.dependency_overrides.pop(get_current_user)

        response = self.client.get("/api/marketplace/public-products")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            {product["product_name"] for product in response.json()["products"]},
            {"Own rice", "Wheat"},
        )


if __name__ == "__main__":
    unittest.main()
