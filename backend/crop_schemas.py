from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CropCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    crop_name: str = Field(min_length=1, max_length=100)
    area_cultivated: float = Field(gt=0)
    season: str = Field(min_length=1, max_length=50)
    status: Literal["planned", "growing", "harvested"] = "growing"