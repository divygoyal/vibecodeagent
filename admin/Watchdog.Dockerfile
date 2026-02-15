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

# Run with watchdog command (override in compose or here)
CMD ["python", "watchdog.py"]
