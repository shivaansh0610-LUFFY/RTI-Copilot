"""Local text embeddings with BAAI/bge-large-en-v1.5 (1024 dimensions, no API key, no cost).

The first call downloads the model weights (about 1.3 GB) and loads them, which takes far longer
than encoding; later calls reuse the loaded model. Vectors are L2-normalised, so cosine
similarity is a plain dot product and matches the `<=>` cosine distance used in retrieval.
"""

from functools import lru_cache

MODEL_NAME = "BAAI/bge-large-en-v1.5"
EMBEDDING_DIMENSIONS = 1024
BATCH_SIZE = 32

# BGE was trained to see this prefix on short search queries (not on the passages they should
# match); the v1.5 model works without it but retrieves slightly better with it.
QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: "


@lru_cache
def _load_model():
    # Imported here because sentence-transformers pulls in torch, which takes seconds to import;
    # the API and the tests should not pay that unless they actually embed something.
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(MODEL_NAME)


def embed_texts(texts: list[str], batch_size: int = BATCH_SIZE) -> list[list[float]]:
    """One normalised vector per text, encoded `batch_size` texts at a time."""
    if not texts:
        return []
    vectors = _load_model().encode(
        texts,
        batch_size=batch_size,
        normalize_embeddings=True,
        show_progress_bar=len(texts) > batch_size,
    )
    return [vector.tolist() for vector in vectors]


def embed_query(query: str) -> list[float]:
    """The vector for a search query, to compare against passages embedded with embed_texts."""
    return embed_texts([QUERY_INSTRUCTION + query])[0]
