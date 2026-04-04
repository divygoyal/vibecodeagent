# AGENTS.md

This file is for coding agents working in `vibecodeagent/`.
It captures the repo's real commands, conventions, and pitfalls.

## Scope
- Multi-service repo: `web/` (Next.js dashboard), `admin/` (FastAPI admin API), `plugins/`, Docker assets, and `templates/`.
- Most day-to-day product work happens in `web/`.
- `CLAUDE.md` is the main repo-specific instruction source today; this file condenses the useful parts.
- No `.cursor/rules/`, `.cursorrules`, or `.github/copilot-instructions.md` files exist in this repo.
- `templates/AGENTS.md` is a runtime template for spawned bot workspaces, not contributor guidance for this repository.

## Repo Map
- `web/src/app/`: App Router pages, layouts, and API routes.
- `web/src/components/`: React UI components, mostly PascalCase files.
- `web/src/lib/`: shared helpers, hooks, auth, API utilities.
- `web/src/services/`: heavier business logic like AI tool execution.
- `web/src/stores/`: Zustand state.
- `admin/`: FastAPI app, SQLAlchemy models, Docker manager, watchdog.
- `plugins/`: Node packages executed by the admin service.
- `docker-compose.yml`: main local orchestration entry point.

## Canonical Commands
Run from repo root unless noted otherwise.

### Docker / Full Stack
```bash
docker compose up --build
docker compose up web
docker compose up admin-api
docker compose build web
docker compose build admin-api
docker compose ps
```

### Web
```bash
cd web
npm install
npm run dev
npm run build
npm run lint
npx tsc --noEmit
npx eslint src/path/to/file.tsx
npx eslint src/path/to/file.ts
```
- Use single-file ESLint for targeted validation.
- There is no single-file TypeScript mode configured; use `npx tsc --noEmit` for shared types/routes/helpers.

### Admin
```bash
pip install -r admin/requirements.txt
python admin/main.py
```
From inside `admin/` you can also run:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
- No admin-specific lint or test command is configured.

### Plugins
```bash
cd plugins/google-analytics && npm install
cd plugins/google-search-console && npm install
cd plugins/github-ghost && npm install
```
- Plugin packages do not define build, lint, or test scripts.

## Test Status
- No integrated automated test suite is configured right now.
- No `pytest`, `unittest`, `jest`, `vitest`, or Playwright project config is checked in.
- `web/package.json` has `dev`, `build`, and `lint`, but no `test` script.
- `test_db.py` is an ad hoc DB inspection script, not regression coverage.
- There is currently no supported "run one test" command.
- Do not claim that you ran a single test unless you first add real test tooling and a real test.
- Current fallback validation:
```bash
cd web && npx eslint src/path/to/file.tsx
cd web && npx tsc --noEmit
cd web && npm run build
python test_db.py
```

## Style Sources
- Web linting comes from `web/eslint.config.mjs` using Next.js core-web-vitals + TypeScript rules.
- `web/tsconfig.json` is `strict`.
- There is no Prettier config or dedicated Python formatter/linter.
- Because formatting is not centrally enforced, preserve the local style of the file you edit.

## General Editing Rules
- Prefer minimal, surgical changes over broad rewrites.
- Do not mass-reformat files just because you touched them.
- Do not edit generated output like `web/.next/`.
- Keep comments rare and useful; explain non-obvious logic only.
- Never hardcode secrets, API keys, tokens, or credentials.

## Imports
- In `web/`, import external packages first, then `@/` aliases, then relative imports.
- Prefer the `@/*` path alias over long relative imports in the web app.
- Use `import type` when the file already uses it or it clearly improves clarity.
- In `admin/`, match the existing import style such as `from config import settings` and `from models import User`.
- Do not reorder imports in unrelated files for style alone.

## Formatting
- Match the quote style already used in the file; the repo contains both single-quote and double-quote files.
- Match the existing indentation; both 2-space and 4-space styles exist.
- Keep semicolon usage consistent with the file you are editing.
- Avoid whitespace-only drive-by diffs.

## Types
- Prefer explicit `interface`/`type` shapes over loose objects.
- Keep types close to the feature using them; this repo often colocates types.
- Avoid `any`; if you must use it at a boundary, keep it narrow and add a brief reason when it is not obvious.
- Exported helpers should usually have clear parameter and return types.
- Use `as const` for stable literal maps and arrays when helpful.
- Do not centralize every type into a global folder unless there is a clear reuse need.

## Naming
- React component files: PascalCase, e.g. `AIChatbot.tsx`.
- Hooks: `useSomething`.
- Utility modules and stores: camelCase filenames, e.g. `googleApi.ts`, `chatStore.ts`.
- App Router files must use `page.tsx`, `layout.tsx`, `route.ts`.
- Constants: `SCREAMING_SNAKE_CASE`.
- Python classes: PascalCase.
- Python functions/variables/helpers: snake_case.

## Web / Next.js Conventions
- This is an App Router project; default to server components unless client interactivity is required.
- Add `'use client'` only when hooks, browser APIs, or client-only libraries are needed.
- Keep reusable business logic in `lib/` or `services/`, not buried in large pages.
- Prefer existing SWR and Zustand patterns over new state libraries.
- Use `NextResponse.json()` with explicit status codes in route handlers.
- Authenticated route handlers commonly use `getServerSession(authOptions)`.
- Dark theme is the default; keep the zinc/emerald/cyan visual language unless the task requires a deliberate visual change.

## Python / Admin Conventions
- The admin service is async FastAPI with SQLAlchemy 2.0 and `aiosqlite`.
- Follow existing DB patterns: `select(...)`, `await db.execute(...)`, `scalar_one_or_none()`, explicit `commit()`.
- Roll back failed writes when the surrounding code expects recovery behavior.
- Raise `HTTPException` for API errors instead of returning ad hoc error objects.
- Do not introduce a new formatter/linter unless the task explicitly calls for it.

## Error Handling
- Validate inputs early and fail fast.
- For Next.js APIs, return consistent JSON shapes such as `{ error: 'Unauthorized' }`.
- Wrap external API/SDK calls in `try/catch` at integration boundaries.
- Log concise context with `console.error()` in web code and logger/print patterns in admin code.
- Treat external integrations as failure-prone and code defensively around bad responses.

## File Placement
- New reusable web utilities belong in `web/src/lib/`.
- New durable AI/data workflow logic belongs in `web/src/services/`.
- New Zustand state belongs in `web/src/stores/`.
- New routes belong in `web/src/app/...` using App Router conventions.
- Admin schema changes currently use manual migration scripts in `admin/migrations/`; there is no Alembic setup.

## Repo-Specific Gotchas
- `session.user.id` in the web app is the OAuth provider identifier string, not the numeric database `User.id`.
- Never `parseInt(session.user.id)` for admin API or database work.
- Web code should send that provider ID string to the admin API; the admin side resolves the real DB user.
- If you touch `web/src/app/api/ai-chat/route.ts`, preserve raw Gemini `chunk.candidates?.[0]?.content?.parts`.
- Do not manually reconstruct Gemini function-call parts; doing so can strip `thoughtSignature` and break Gemini 3+ tool calling.
- `types/` is not the only place for types; colocated feature types are common and preferred.

## Verification Expectations
- Web change touching one file: run targeted ESLint on that file when possible.
- Web change touching shared types, routes, or helpers: run `cd web && npx tsc --noEmit`.
- Broader web change or dependency change: run `cd web && npm run build`.
- Admin change: start the service locally if feasible; otherwise at least verify imports/syntax in the changed area.
- Docker/runtime change: run targeted `docker compose build <service>` or `docker compose up --build`.
- If you add real test tooling later, update this file with exact test and single-test commands.
