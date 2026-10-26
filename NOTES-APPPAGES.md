# App pages notes (tc/apppages, worktree tc-apppages, dev instance `apppages` 3109/8109)

Specs: /root/projects/tc-redesign-research/{PRODUCT,DESIGN}.md (DESIGN 5.3, 5.11, 5.14, 5.15, 3.14).
Shots go to /root/projects/tc-redesign-research/shots/apppages/ (NOT taken: coordinator said no dev server, RAM critical;
shots come from the merged integration server).

## Scope
Ask, Settings, Plan, Support, Docs, Setup wizard, embed/[siteId]; admin + superadmin consoles were restyled earlier
(ac96fa7, b279fca, 42e04cf).

## Done
- Ask (/dashboard/ask; /dashboard/ai-chat is a permanent redirect in next.config.ts, foundation):
  - ask/page.tsx rewritten around the same streaming logic (SSE, chatStore, persistMessage, credits, workspace data
    context). New: ask/{AskEmpty,Composer,HistoryDrawer,DeepLink,prompts}.
  - components/app/{SiteChip,Field,SettingsSection}: shared bits for the app pages.
  - GitHub/WordPress/Vercel connector rail, repo picker, nudge, star field removed from Ask. Request still sends
    selectedRepo: null.
  - `?q=`: sends when Ask can answer, otherwise (AI unavailable, 0 messages, no data source) puts the question in the
    composer. `&prefill=1` always only fills the composer. `&property=&site=` still switches workspace first.
    lib/askAi.ts buildAskAiUrl(q, {prefill}) documents it.
  - New GET /api/ai-chat/status -> {available} (isGoogleGenAIConfigured). With no key the page shows the "Ask is
    unavailable" banner and disables send. A JSON (non-SSE) 200 from /api/ai-chat is handled the same way.
  - Credits line ("N messages left · Get more" -> /dashboard/plan), live via the SSE `credits` event + useCredits refresh.
    At 0 messages a warn banner replaces the composer (Get more messages / Use ChatGPT or Claude via Connect AI).
  - ChatCharts rewritten on ChartCard/TimeSeriesChart/BarList/Donut/Table/StatCard (same exports and props).
    ChatMessageRenderer, ReasoningTrace, MessageFeedback, PlanCard, CriticBadge, ThinkingBlock use tokens.
  - 402 copy no longer mentions Telegram (api/ai-chat/route.ts string only).
  - Removed '/dashboard/ask' + '/dashboard/ai-chat' from LEGACY_ROUTE_PREFIXES (components/shell/nav.ts).
- Dead (unmounted, left for the Phase 2 clean-up): components/AIChatbot.tsx and components/chat/{ChatHeader,ChatInput,
  HistoryPanel,MessageBubble,QuickPrompts,ThinkingIndicator,ConnectorIntentNudge}.tsx.
