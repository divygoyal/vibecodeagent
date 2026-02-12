# Custom ClawBot Image
# Extends OpenClaw with GitHub CLI pre-installed

FROM ghcr.io/openclaw/openclaw:latest

# Switch to root to install packages
USER root

# Install GitHub CLI
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
    apt-get update && \
    apt-get install -y gh && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Switch back to node user
USER node

# Keep the original entrypoint - gh will auth on first use with GITHUB_TOKEN env var
