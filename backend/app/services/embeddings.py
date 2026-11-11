"""Local text embeddings with BAAI/bge-large-en-v1.5 (1024 dimensions, no API key, no cost).

The first call downloads the model weights (about 1.3 GB) and loads them, which takes far longer
than encoding; later calls reuse the loaded model. Vectors are L2-normalised, so cosine
similarity is a plain dot product and matches the `<=>` cosine distance used in retrieval.
"""

import logging
import threading

MODEL_NAME = "BAAI/bge-large-en-v1.5"
EMBEDDING_DIMENSIONS = 1024
BATCH_SIZE = 32

# BGE was trained to see this prefix on short search queries (not on the passages they should
# match); the v1.5 model works without it but retrieves slightly better with it.
QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: "


_model = None
# The warm-up thread and a citizen's first request must not both load the 1.3 GB model.
_model_lock = threading.Lock()
# None lets sentence-transformers pick (the Apple GPU, "mps", on a Mac), which suits the bulk
# ingestion run on the main thread. The API calls use_cpu() first: on a Mac, MPS inference from
# the server's worker threads crashed the whole process with a segmentation fault, and a few
# short queries per request are fast enough on the CPU.
_device: str | None = None


def use_cpu() -> None:
    """Embed on the CPU from now on. Call before the model is first loaded."""
    global _device
    _device = "cpu"


def _load_model():
    global _model
    with _model_lock:
        if _model is None:
            # Imported here because sentence-transformers pulls in torch, which takes seconds to
            # import; the API and the tests should not pay that unless they actually embed.
            from sentence_transformers import SentenceTransformer

            _model = SentenceTransformer(MODEL_NAME, device=_device)
        return _model


def warm_up() -> None:
    """Load the model now (in a background thread at API startup), so the first citizen's
    request does not wait for it. A failure is only logged: requests then go without citations."""
    try:
        embed_query("warm up")
    except Exception:
        logging.getLogger(__name__).warning("Could not load the embedding model", exc_info=True)


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
    return embed_queries([query])[0]


def embed_queries(queries: list[str]) -> list[list[float]]:
    """embed_query for several queries in one batch (much faster on the CPU than one by one)."""
    return embed_texts([QUERY_INSTRUCTION + query for query in queries])
