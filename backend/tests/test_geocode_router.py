from app.services import geocoding


def test_geocode_returns_the_address(client, monkeypatch):
    monkeypatch.setattr(geocoding, "reverse_geocode", lambda lat, lon: "MG Road, New Delhi")

    response = client.post("/geocode", json={"latitude": 28.6315, "longitude": 77.2167})

    assert response.status_code == 200
    assert response.json() == {"address": "MG Road, New Delhi"}


def test_geocode_returns_422_when_no_address_found(client, monkeypatch):
    def raise_not_found(lat, lon):
        raise geocoding.GeocodingError("no address found")

    monkeypatch.setattr(geocoding, "reverse_geocode", raise_not_found)

    response = client.post("/geocode", json={"latitude": 0, "longitude": 0})

    assert response.status_code == 422


def test_geocode_rejects_missing_coordinates(client):
    response = client.post("/geocode", json={"latitude": 28.6315})

    assert response.status_code == 422
