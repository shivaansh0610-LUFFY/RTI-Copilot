from fastapi import APIRouter, HTTPException

from app.schemas import GeocodeBody, GeocodeResult
from app.services import geocoding

router = APIRouter(tags=["geocode"])


@router.post("/geocode", response_model=GeocodeResult)
def geocode(body: GeocodeBody) -> GeocodeResult:
    try:
        address = geocoding.reverse_geocode(body.latitude, body.longitude)
    except geocoding.GeocodingError as error:
        raise HTTPException(422, str(error)) from error
    return GeocodeResult(address=address)
