# syntax=docker/dockerfile:1

FROM node:22-alpine AS web
WORKDIR /app/frontend
ARG NPM_REGISTRY=https://registry.npmjs.org
COPY frontend/package.json frontend/package-lock.json ./
RUN npm config set registry "$NPM_REGISTRY" && npm config set replace-registry-host always && npm ci
COPY frontend/ ./
COPY backend/app/modules/spoken_math.json /app/backend/app/modules/spoken_math.json
RUN npm run build:online

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    AXIOM_ONLINE_HOST=0.0.0.0 \
    AXIOM_ONLINE_PORT=8080
WORKDIR /app
ARG PIP_INDEX_URL=https://pypi.org/simple
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir --index-url "$PIP_INDEX_URL" -r /app/backend/requirements.txt
COPY backend/ /app/backend/
COPY deploy/ /app/deploy/
COPY --from=web /app/frontend/dist-online/ /app/frontend/dist-online/
RUN chmod +x /app/deploy/start.sh
WORKDIR /app/backend
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/health', timeout=3)"
CMD ["/app/deploy/start.sh"]
