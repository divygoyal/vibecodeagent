# Custom ClawBot Image - "God Mode" Edition
# Extends OpenClaw with full tooling: GitHub CLI, Browser, Python, Bun

FROM ghcr.io/openclaw/openclaw:latest

# Switch to root to install packages
USER root

# 1. Install Bun (for fast skill installation - matches nodeManager: "bun" in config)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# 2. Install Browser dependencies (CRITICAL for browser skill - GSC, web scraping, etc.)
RUN apt-get update && apt-get install -y \
    # Browser engine
    chromium \
    # Required shared libraries for headless Chrome
    libnss3 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    # Python runtime (for data analysis scripts)
    python3 \
    python3-pip \
    # Dev tools
    curl \
    git \
    jq \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 3. Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
    apt-get update && \
    apt-get install -y gh && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 4. Set Chromium env for Puppeteer/Playwright
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/bin

# 5. Ensure data directories exist with correct permissions
RUN mkdir -p /data/workspace /data/.openclaw && chown -R node:node /data

# 6. Switch back to node user (UID 1000) for security
USER node

# Keep the original entrypoint - tools auth via env vars (GITHUB_TOKEN, etc.)
