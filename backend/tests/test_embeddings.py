import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

from app.services import embeddings

BACKEND_DIR = Path(__file__).resolve().parents[1]


class FakeModel:
    """Stands in for SentenceTransformer: records the calls, returns numpy rows like the real one."""

    def __init__(self):
        self.calls = []

    def encode(self, texts, **options):
        self.calls.append((list(texts), options))
        return np.array([[float(len(text)), 0.0, 1.0] for text in texts], dtype=np.float32)


@pytest.fixture
def model(monkeypatch):
    fake = FakeModel()
    monkeypatch.setattr(embeddings, "_load_model", lambda: fake)
    return fake


def test_the_model_is_the_1024_dimension_bge_large():
    assert embeddings.MODEL_NAME == "BAAI/bge-large-en-v1.5"
    assert embeddings.EMBEDDING_DIMENSIONS == 1024


def test_texts_are_encoded_in_batches_of_32_and_normalised(model):
    embeddings.embed_texts(["text"] * 70)

    assert len(model.calls) == 1  # one call; the model slices it into batches of 32 itself
    texts, options = model.calls[0]
    assert len(texts) == 70
    assert options["batch_size"] == 32
    assert options["normalize_embeddings"] is True


def test_batch_size_can_be_changed(model):
    embeddings.embed_texts(["text"] * 5, batch_size=2)

    assert model.calls[0][1]["batch_size"] == 2


def test_vectors_come_back_as_plain_lists_in_input_order(model):
    vectors = embeddings.embed_texts(["a", "bbb"])

    assert vectors == [[1.0, 0.0, 1.0], [3.0, 0.0, 1.0]]
    assert all(type(vector) is list and type(vector[0]) is float for vector in vectors)  # not numpy


def test_no_texts_means_no_model_load(monkeypatch):
    def refuse():
        raise AssertionError("model loaded for nothing")

    monkeypatch.setattr(embeddings, "_load_model", refuse)

    assert embeddings.embed_texts([]) == []


def test_a_query_gets_the_bge_search_instruction(model):
    vector = embeddings.embed_query("who is the PIO")

    assert model.calls[0][0] == [embeddings.QUERY_INSTRUCTION + "who is the PIO"]
    assert len(vector) == 3  # a single vector, not a list of them


def test_passages_are_embedded_without_the_instruction(model):
    embeddings.embed_texts(["Section 6 of the Act"])

    assert model.calls[0][0] == ["Section 6 of the Act"]


def test_importing_the_module_does_not_import_torch():
    # The API and the test suite should not pay for torch unless something is actually embedded.
    code = "import sys, app.services.embeddings; print('sentence_transformers' in sys.modules or 'torch' in sys.modules)"
    result = subprocess.run([sys.executable, "-c", code], cwd=BACKEND_DIR, capture_output=True, text=True, check=True)

    assert result.stdout.strip() == "False"
