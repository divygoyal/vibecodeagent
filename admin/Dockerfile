# Admin API Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (including build tools for Python packages)
RUN apt-get update && apt-get install -y \
    curl \
    gcc \
    python3-dev \
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

# Create data directory
RUN mkdir -p data

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run with uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
