from pydantic import BaseModel


class ProductCreate(BaseModel):
    product_name: str
    category: str
    quantity: float
    unit: str
    price_per_unit: float
    location: str
    status: str = "available"