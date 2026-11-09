from pydantic import BaseModel, ConfigDict, Field


class FarmerProfileCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    farm_name: str = Field(min_length=1, max_length=150)
    location: str = Field(min_length=1, max_length=255)
    farm_size: float = Field(gt=0)
    soil_type: str = Field(min_length=1, max_length=100)