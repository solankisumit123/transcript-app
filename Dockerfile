# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

# Copy package files and install dependencies
COPY frontend/package*.json ./

# Use --legacy-peer-deps to handle peer dependency conflicts
RUN npm install --legacy-peer-deps

# Copy full frontend source
COPY frontend/ ./

# Fix OpenSSL issue with Node 20 + Webpack 4 (used by react-scripts/craco)
ENV NODE_OPTIONS=--openssl-legacy-provider
ENV REACT_APP_BACKEND_URL=""
ENV CI=false

# Build the React app
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Python backend + serve frontend static files
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim
WORKDIR /app/backend

# Install system dependencies (ffmpeg for yt-dlp / audio processing)
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl && \
    rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY backend/ ./

# Copy built React app from Stage 1
COPY --from=frontend-builder /app/frontend/build /app/backend/frontend_build

# Render / Railway sets $PORT automatically; fallback to 8080
EXPOSE 8080

CMD uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080}
