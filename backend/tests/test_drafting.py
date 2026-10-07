REQUIRED_REQUEST_FIELDS = {"id", "category", "title", "authority", "period", "quality"}


def decompose(client, case_id):
    response = client.post(
        f"/cases/{case_id}/decompose", json={"clarification": {"period": "Last 6 months"}}
    )
    assert response.status_code == 200
    return response.json()


def test_decompose_returns_information_requests(client, case_id):
    requests = decompose(client, case_id)
    assert len(requests) > 0
    for request in requests:
        assert REQUIRED_REQUEST_FIELDS <= set(request)
        assert request["quality"] in ("good", "needs-detail")
        assert request["source"] == "generated"
        assert request["period"] == "Last 6 months"
        # Unset optional fields are omitted, matching the optional fields in src/types.ts.
        assert "publiclyAvailable" not in request


def test_public_info_check_marks_every_request(client, case_id):
    requests = decompose(client, case_id)
    response = client.post(f"/cases/{case_id}/public-info-check", json={"requests": requests})
    assert response.status_code == 200
    checked = response.json()
    assert [r["id"] for r in checked] == [r["id"] for r in requests]
    for request in checked:
        assert isinstance(request["publiclyAvailable"], bool)
        if request["publiclyAvailable"]:
            assert set(request["publicSource"]) == {"title", "url"}
        else:
            assert "publicSource" not in request
    assert any(r["publiclyAvailable"] for r in checked)


def test_public_info_check_rejects_invalid_request(client, case_id):
    response = client.post(
        f"/cases/{case_id}/public-info-check", json={"requests": [{"id": "RQ-001"}]}
    )
    assert response.status_code == 422


def test_draft_returns_text_covering_each_request(client, case_id):
    requests = decompose(client, case_id)
    requests[0]["context"] = "Earlier reply left this out."
    response = client.post(f"/cases/{case_id}/draft", json={"requests": requests})
    assert response.status_code == 200
    assert set(response.json()) == {"draftText"}
    draft_text = response.json()["draftText"]
    for request in requests:
        assert request["title"] in draft_text
    assert "Background: Earlier reply left this out." in draft_text
