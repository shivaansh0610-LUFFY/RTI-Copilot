from app.schemas.base import ApiModel


class GeocodeBody(ApiModel):
    latitude: float
    longitude: float


class GeocodeResult(ApiModel):
    address: str
