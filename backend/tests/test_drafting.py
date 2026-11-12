REQUIRED_REQUEST_FIELDS = {"id", "category", "title", "authority", "period", "quality"}


def decompose(client, case_id):
    response = client.post(
        f"/cases/{case_id}/decompose", json={"clarification": {"period": "Last 6 months"}}
    )
    assert response.status_code == 200
    return response.json()


def test_clarify_questions_returns_the_mock_questions(client, case_id):
    response = client.post(f"/cases/{case_id}/clarify-questions")
    assert response.status_code == 200
    body = response.json()
    assert body["answers"] == {}
    questions = body["questions"]
    assert [q["key"] for q in questions] == ["period", "knowsAuthority"]
    for question in questions:
        assert question["question"]
        assert len(question["options"]) >= 2


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
    body = response.json()
    assert set(body) == {"draftText", "charCount", "overLimit", "flaggedRequestIds"}
    draft_text = body["draftText"]
    for request in requests:
        assert request["title"] in draft_text
    assert "Background: Earlier reply left this out." in draft_text
    assert body["charCount"] == len(draft_text)
    assert body["overLimit"] is False
    # RQ-002's mock title, "Details of amount spent", is 4 words -- genuinely vague by our
    # own 6-word threshold, consistent with its quality already being "needs-detail".
    assert body["flaggedRequestIds"] == ["RQ-002"]


def test_draft_rejects_an_empty_application(client, case_id):
    response = client.post(f"/cases/{case_id}/draft", json={"requests": []})
    assert response.status_code == 422


def test_draft_uses_the_model_when_llm_drafting_is_on(client, case_id, monkeypatch):
    from app.config import get_settings
    from app.services.drafting import real

    monkeypatch.setattr(get_settings(), "use_llm_drafting", True)
    seen = {}

    def fake_generate_draft(grievance, requests, language):
        seen.update(grievance=grievance, language=language)
        return "1. " + requests[0].title

    monkeypatch.setattr(real, "generate_draft", fake_generate_draft)
    requests = decompose(client, case_id)[:1]
    response = client.post(f"/cases/{case_id}/draft", json={"requests": requests, "language": "hi"})

    assert response.status_code == 200
    assert response.json()["draftText"] == "1. " + requests[0]["title"]
    assert seen == {"grievance": "The road outside my house has been broken for two years.", "language": "hi"}


def test_draft_flags_vague_titles(client, case_id):
    response = client.post(
        f"/cases/{case_id}/draft",
        json={
            "requests": [
                {
                    "id": "RQ-001",
                    "category": "Work order",
                    "title": "repair details",  # 2 words: too vague
                    "authority": "PWD",
                    "period": "Last 1 year",
                    "quality": "good",
                },
                {
                    "id": "RQ-002",
                    "category": "Work order",
                    "title": "Copy of the work order sanctioning repair of the road",
                    "authority": "PWD",
                    "period": "Last 1 year",
                    "quality": "good",
                },
            ]
        },
    )
    assert response.status_code == 200
    assert response.json()["flaggedRequestIds"] == ["RQ-001"]


def test_draft_warns_when_over_the_portal_character_limit(client, case_id):
    # Five long but allowed titles (under 1,000 characters each) add up to over 3,000.
    long_title = "Copy of the work order sanctioning repair, " * 20
    requests = [
        {
            "id": f"RQ-00{n}",
            "category": "Work order",
            "title": long_title,
            "authority": "PWD",
            "period": "Last 1 year",
            "quality": "good",
        }
        for n in range(1, 6)
    ]
    response = client.post(f"/cases/{case_id}/draft", json={"requests": requests})
    body = response.json()
    assert body["overLimit"] is True
    assert "3,000" in body["warning"]
    # Warned, not truncated.
    assert body["draftText"].count(long_title.strip()) >= 5


def test_api_refuses_oversized_input(client, case_id):
    assert client.post("/cases", json={"grievanceText": "a" * 5001}).status_code == 422
    request = {"id": "RQ-001", "category": "c", "title": "t" * 1001, "authority": "a", "period": "p", "quality": "good"}
    assert client.post(f"/cases/{case_id}/draft", json={"requests": [request]}).status_code == 422
    too_many = [dict(request, id=f"RQ-{n}", title="Copy of the work order") for n in range(21)]
    assert client.post(f"/cases/{case_id}/draft", json={"requests": too_many}).status_code == 422
    answers = {f"q{n}": "x" for n in range(11)}
    assert client.post(f"/cases/{case_id}/decompose", json={"clarification": answers}).status_code == 422
