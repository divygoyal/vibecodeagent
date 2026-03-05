# Admin API Dockerfile
FROM python:3.11-slim-bookworm

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    gcc \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for caching (context is root now)
COPY admin/requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code configuration templates
COPY admin/. .
COPY templates /app/templates
COPY plugins /app/plugins

# Copy nanobot build assets (used by docker_manager to build nanobot image at runtime)
# Layout mirrors project root so Dockerfile.nanobot COPY paths work unchanged
COPY Dockerfile.nanobot /app/nanobot-build/Dockerfile.nanobot
COPY scripts/nanobot_entrypoint.sh /app/nanobot-build/scripts/nanobot_entrypoint.sh
COPY plugins/google-analytics /app/nanobot-build/plugins/google-analytics
COPY plugins/google-search-console /app/nanobot-build/plugins/google-search-console

# Pre-install plugin dependencies (eliminates Node.js cold-start on exec calls)
RUN cd /app/plugins/google-analytics && npm install --production 2>/dev/null || true
RUN cd /app/plugins/google-search-console && npm install --production 2>/dev/null || true

# Create data directory
RUN mkdir -p data

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run with uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
