from pydantic import Field

from app.schemas.base import ApiModel


class GeocodeBody(ApiModel):
    # Bounds also reject NaN and infinity, which compare false with everything.
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class GeocodeResult(ApiModel):
    address: str
