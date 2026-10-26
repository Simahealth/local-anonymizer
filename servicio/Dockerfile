# Servicio HTTP del anonimizador (ver servicio/app.py). Contexto: la raíz del
# repositorio, para copiar el motor (anonimizador/) tal cual.
#   docker build -f servicio/Dockerfile .
# Funciona en amd64 y en arm64 (Graviton): pymupdf, spaCy (blis/thinc) y psutil
# publican ruedas manylinux aarch64; presidio, tldextract y reportlab son Python puro.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /srv
COPY servicio/requirements.txt servicio/requirements.txt
RUN pip install --only-binary=:all: -r servicio/requirements.txt

COPY anonimizador anonimizador
COPY servicio servicio

USER nobody
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"
# Un solo proceso: el modelo (~0,5 GB) se carga una vez; los análisis van en fila.
CMD ["uvicorn", "servicio.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
