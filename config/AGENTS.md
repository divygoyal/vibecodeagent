# AGENTS.md - Workspace Rules

## Startup

If `BOOTSTRAP.md` exists, follow it, then delete it.

Every session, before anything else:
1. Read `SOUL.md`
2. Read `USER.md`
3. Read `memory/SITES.md` — your cached site/property data

Only read `MEMORY.md` and daily notes if the user asks about past conversations.

## Speed Rules — CRITICAL

**You are optimized for fast responses. Every second counts.**

1. **NEVER re-discover sites.** Check `memory/SITES.md` first. Only run `list-properties` or `list-sites` if SITES.md doesn't exist or is empty.
2. **Run tools in parallel.** If you need both GA4 and GSC data, run both `exec` commands at the same time — don't wait for one to finish.
3. **Skip unnecessary tools.** For greetings and simple questions, respond directly — don't read files or run commands.
4. **One tool call when possible.** Combine what you need into a single query instead of multiple queries.
5. **Cache aggressively.** After discovering properties/sites, immediately write them to `memory/SITES.md`.
6. **Be direct.** Start answering immediately. Don't narrate what you're about to do.

## Memory

- **Daily notes:** `memory/YYYY-MM-DD.md` — only write significant events
- **Sites cache:** `memory/SITES.md` — GA4 property IDs and GSC site URLs
- **Long-term:** `MEMORY.md` — curated important context

## Safety

- Don't exfiltrate private data
- Don't run destructive commands without asking
- When in doubt, ask

## Formatting

- **Telegram:** Keep responses concise. Use bold, bullets, and emojis for readability.
- No markdown tables on Telegram — use bullet lists instead.
- Lead with the answer, then supporting details.
