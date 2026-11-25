import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.services import embeddings


class FakeResponse:
    def __init__(self, rows, status=200):
        self.rows = rows
        self.status = status

    def raise_for_status(self):
        if self.status >= 400:
            request = httpx.Request("POST", "https://api.cloudflare.com/")
            raise httpx.HTTPStatusError("refused", request=request, response=httpx.Response(self.status, request=request))

    def json(self):
        return {"success": True, "result": {"shape": [len(self.rows), 1024], "data": self.rows}}


def vector(first=3.0, second=4.0):
    return [first, second] + [0.0] * (embeddings.EMBEDDING_DIMENSIONS - 2)


@pytest.fixture
def cloudflare(monkeypatch):
    """Switches embedding to Cloudflare for one test, records each request, and makes sure the
    local model is never loaded."""
    calls = []

    def post(url, *, headers, json, timeout):
        calls.append({"url": url, "headers": headers, "json": json})
        return FakeResponse([vector() for _ in json["text"]])

    def refuse():
        raise AssertionError("the local model was loaded")

    monkeypatch.setattr(embeddings, "_cloudflare", None)
    monkeypatch.setattr(embeddings.httpx, "post", post)
    monkeypatch.setattr(embeddings, "_load_model", refuse)
    embeddings.use_cloudflare("account-1", "token-1")
    return calls


def test_once_switched_on_texts_go_to_cloudflare_with_cls_pooling(cloudflare):
    vectors = embeddings.embed_texts(["Section 6 of the Act"])

    assert len(cloudflare) == 1
    call = cloudflare[0]
    assert call["url"] == "https://api.cloudflare.com/client/v4/accounts/account-1/ai/run/@cf/baai/bge-large-en-v1.5"
    assert call["headers"] == {"Authorization": "Bearer token-1"}
    # CLS pooling, as the local sentence-transformers model uses: Cloudflare's default (mean)
    # would give vectors that do not match the stored passages.
    assert call["json"] == {"text": ["Section 6 of the Act"], "pooling": "cls"}
    assert len(vectors) == 1 and len(vectors[0]) == 1024


def test_cloudflare_vectors_are_normalised_like_the_local_ones(cloudflare):
    [result] = embeddings.embed_texts(["text"])

    assert result[:2] == pytest.approx([0.6, 0.8])
    assert sum(value * value for value in result) == pytest.approx(1.0)
    assert all(type(value) is float for value in result)


def test_queries_keep_the_bge_search_instruction_on_cloudflare(cloudflare):
    embeddings.embed_queries(["who is the PIO", "work order"])

    assert cloudflare[0]["json"]["text"] == [
        embeddings.QUERY_INSTRUCTION + "who is the PIO",
        embeddings.QUERY_INSTRUCTION + "work order",
    ]


def test_more_than_100_texts_are_sent_100_at_a_time_in_order(cloudflare, monkeypatch):
    def post(url, *, headers, json, timeout):
        cloudflare.append(json["text"])
        return FakeResponse([vector(float(len(text)), 0.0) for text in json["text"]])

    monkeypatch.setattr(embeddings.httpx, "post", post)
    texts = ["x" * (n + 1) for n in range(250)]

    vectors = embeddings.embed_texts(texts)

    assert [len(batch) for batch in cloudflare] == [100, 100, 50]
    assert len(vectors) == 250
    assert all(v[0] == pytest.approx(1.0) for v in vectors)  # each normalised, order kept


def test_no_texts_means_no_request(cloudflare):
    assert embeddings.embed_texts([]) == []
    assert cloudflare == []


def test_a_refused_request_raises(cloudflare, monkeypatch):
    monkeypatch.setattr(embeddings.httpx, "post", lambda url, **_: FakeResponse([], status=401))

    with pytest.raises(httpx.HTTPStatusError):
        embeddings.embed_texts(["text"])


@pytest.mark.parametrize(
    "rows",
    [[], [vector(), vector()], [[1.0, 2.0]]],
    ids=["too few", "too many", "wrong size"],
)
def test_an_unexpected_answer_raises_instead_of_storing_bad_vectors(cloudflare, monkeypatch, rows):
    monkeypatch.setattr(embeddings.httpx, "post", lambda url, **_: FakeResponse(rows))

    with pytest.raises(ValueError):
        embeddings.embed_texts(["text"])


def test_the_server_switches_to_cloudflare_only_when_both_keys_are_set(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(embeddings, "_cloudflare", None)

    monkeypatch.setattr(settings, "cloudflare_account_id", "account-1")
    with TestClient(app):
        pass
    assert embeddings._cloudflare is None  # the token is missing: keep the local model

    monkeypatch.setattr(settings, "cloudflare_api_token", "token-1")
    with TestClient(app):
        pass
    assert embeddings._cloudflare == ("account-1", "token-1")


def test_ingestion_never_switches_to_cloudflare():
    # The corpus is embedded locally, so loading it cannot use up Cloudflare's free allowance.
    from ingest import load_documents

    source = open(load_documents.__file__, encoding="utf-8").read()
    assert "use_cloudflare" not in source
