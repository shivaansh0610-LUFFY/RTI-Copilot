from uuid import UUID, uuid4


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_create_case_returns_case_id(client):
    response = client.post(
        "/cases", json={"grievanceText": "Potholes on my street have not been repaired."}
    )
    assert response.status_code == 201
    assert set(response.json()) == {"caseId"}
    UUID(response.json()["caseId"])


def test_create_case_rejects_short_grievance(client):
    assert client.post("/cases", json={"grievanceText": "road"}).status_code == 422


def test_case_scoped_routes_404_for_unknown_case(client):
    response = client.post(f"/cases/{uuid4()}/decompose", json={"clarification": {}})
    assert response.status_code == 404
