FROM python:3.12-slim

WORKDIR /srv

# tesseract-ocr is the OCR binary ingest.extract shells out to for scanned PDFs; it is not a
# pip package. Its English language data ships with the package; Hindi comes from tessdata/
# below instead of apt's tesseract-ocr-hin, so the exact Hindi model is pinned by the repo.
RUN apt-get update && apt-get install --no-install-recommends -y tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
# app.services.live_fetch reuses the text extractors and the official-domain rule from ingest/.
COPY ingest ./ingest
# ingest.extract._recognize_text points --tessdata-dir equivalents (TESSDATA_PREFIX) here.
COPY tessdata ./tessdata
# app.services.live_sources reads this at request time; nothing else under data/ is needed here.
COPY data/live_sources.csv ./data/live_sources.csv

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
