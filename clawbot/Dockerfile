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

# Create startup script that authenticates gh if GITHUB_TOKEN is present
RUN echo '#!/bin/bash\n\
if [ -n "$GITHUB_TOKEN" ]; then\n\
  echo "$GITHUB_TOKEN" | gh auth login --with-token 2>/dev/null || true\n\
fi\n\
exec "$@"' > /usr/local/bin/clawbot-entrypoint.sh && \
    chmod +x /usr/local/bin/clawbot-entrypoint.sh

# Switch back to node user
USER node

# Use our custom entrypoint that sets up gh auth
ENTRYPOINT ["/usr/local/bin/clawbot-entrypoint.sh"]
CMD ["openclaw"]
