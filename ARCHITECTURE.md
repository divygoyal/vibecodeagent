# VibeCode Agent: Architecture (God Mode)

## Overview
VibeCode Agent is a multi-tenant, sandboxed AI Personal Assistant service built on top of the OpenClaw engine. It allows users to authenticate via GitHub, connect their own Telegram bots (BYOB), and interact with their private data (GSC, GitHub, GA) in a secure, isolated environment.

## Core Pillars

### 1. Multi-Tenant Isolation
*   **Single Gateway:** A central OpenClaw Gateway manages all connections.
*   **Isolated Agents:** Every user is provisioned a unique `Agent ID`.
*   **Scoped Workspaces:** Each agent has a dedicated directory (`/data/users/{github_id}/`) for its memory, logs, and files.
*   **Docker Sandboxing:** All code execution and sensitive data processing happen within an ephemeral Docker container scoped to that user.

### 2. Authentication & Provisioning
*   **Web Portal:** Users log in via GitHub OAuth.
*   **Dynamic Provisioning:** On login, the system checks for an existing agent or creates a new one using the `provision_user.py` script.
*   **Pairing:** The portal displays a pairing code which the user sends to their Telegram bot to link their identities.

### 3. Bring Your Own Bot (BYOB)
*   **Shared Infrastructure, Private Interface:** Users provide their `@BotFather` token on the VibeCode dashboard.
*   **Hot Reload:** The system dynamically injects the new Telegram channel into the user's specific OpenClaw agent and restarts the gateway listener.

### 4. Data Connectors (The "Ghost" Suite)
*   **GitHub Plugin:** Monitors repos, audits PRs, and summarizes commits.
*   **Google Suite:** Pulls GSC and Analytics data for cross-app intelligence and automated reporting.

## Security
*   **Data Leakage Prevention:** Agents are prevented from reading outside their scoped workspace via OS-level permissions and Docker volume mapping.
*   **Token Vaulting:** User API keys (GitHub, Google) are stored encrypted and injected into the environment only during active sessions.
