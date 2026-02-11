# MEMORY.md

## Identity & User
- **User:** Divy (Dinesh).
- **Agent Name:** Jarvis.
- **Project:** VibeCode Agent - A SaaS platform for AI Personal Assistants.
  - Allows users to sign up via GitHub.
  - BYOB (Bring Your Own Bot) - users provide Telegram tokens.
  - Integration with GitHub, Google Analytics/Search Console.
  - Architecture: OpenClaw as the engine, Docker sandboxing.
- **Domain:** `agent.divygoyal.in`.
- **Repo:** `https://github.com/divygoyal/vibecodeagent`.

## Constraints & Preferences
- **API Limit:** 1 Million TPM (Tokens Per Minute) on Gemini API key.
- **Optimization Strategy:**
  - Aggressive compaction/pruning of context.
  - Local embeddings/memory search to save tokens.
  - Truncating large tool outputs.

## History
- **2026-02-11:** Divy moved from another VPS where data was lost/agent disconnected ("went out of the blue").
- Previous work involved fixing the web portal (NextAuth/TypeScript), implementing a GitHub Ghost Plugin, and optimizing OpenClaw config for TPM limits.
