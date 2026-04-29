# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

# Copy package files and install dependencies
COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps

# Copy frontend source and build
COPY frontend/ ./
# We set REACT_APP_BACKEND_URL to empty so the frontend fetches API endpoints relative to the current host (since they will be served together)
ENV REACT_APP_BACKEND_URL=""
RUN npm run build

# Stage 2: Build the Python backend and serve everything
FROM python:3.12-slim
WORKDIR /app/backend

# Install system dependencies (ffmpeg is needed for yt-dlp, media processing, etc.)
RUN apt-get update && \
    apt-get install -y ffmpeg curl && \
    rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./

# Copy frontend build from stage 1 into backend/frontend_build
COPY --from=frontend-builder /app/frontend/build /app/backend/frontend_build

# Expose port (Render/Railway use the PORT env var, but we'll default to 8080)
EXPOSE 8080

# Command to run the FastAPI application
# We use $PORT if it's set by the cloud provider, otherwise fallback to 8080
CMD uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080}
