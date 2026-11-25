FROM python:3.12-slim

# Hosts such as Hugging Face Spaces run the container as user 1000, so the app runs as that user
# everywhere, and owns the model cache below.
RUN useradd --create-home --uid 1000 app

WORKDIR /srv

# tesseract-ocr is the OCR binary ingest.extract shells out to for scanned PDFs; it is not a
# pip package. Its English language data ships with the package; Hindi comes from tessdata/
# below instead of apt's tesseract-ocr-hin, so the exact Hindi model is pinned by the repo.
RUN apt-get update && apt-get install --no-install-recommends -y tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

# The CPU build of PyTorch first, as in CI: sentence-transformers would otherwise pull the CUDA
# build, gigabytes bigger, which a server without a GPU never uses.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# The embedding model (BAAI/bge-large-en-v1.5, about 1.3 GB) is part of the image, so starting
# the server never downloads it; offline afterwards, so loading it never calls the Hub either.
ENV HF_HOME=/srv/.cache/huggingface
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-large-en-v1.5', device='cpu')" \
    && chown -R app:app /srv/.cache
ENV HF_HUB_OFFLINE=1

COPY app ./app
# app.services.live_fetch reuses the text extractors and the official-domain rule from ingest/.
COPY ingest ./ingest
# ingest.extract._recognize_text points --tessdata-dir equivalents (TESSDATA_PREFIX) here.
COPY tessdata ./tessdata
# app.services.live_sources reads this at request time; nothing else under data/ is needed here.
COPY data/live_sources.csv ./data/live_sources.csv
# The migrations, run at start (below).
COPY alembic.ini ./
COPY migrations ./migrations

USER app
EXPOSE 8000
# Brings the database schema up to date, then serves on $PORT (8000 unless the host sets one).
# docker-compose.yml replaces this with its own command (with --reload) for local development.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
