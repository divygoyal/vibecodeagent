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
- Settings (/dashboard/settings): tabs Profile, Google, Appearance, Notifications, Data & privacy, Danger zone in `?tab=`
  (profile is the default and has no param). Old values: account -> profile, connections/sites -> google,
  leaderboard -> redirect to /dashboard/leaderboard. Telegram, GitHub, Vercel, WordPress and bot-error rows are gone.
  - Hydration fix: invite link origin via useSyncExternalStore (server snapshot ''), referral counter and notification
    prefs via lib/useLocalStorage.ts (null on the server / during hydration).
  - Google tab: connected account (session email when Google is the sign-in provider), Reconnect, scopes explained
    (webmasters.readonly, analytics.readonly, openid email profile), link to Google permissions.
  - Appearance: Light / Dark / System radio cards, previews drawn with data-theme wrappers, uses lib/theme.
  - Data & privacy: "Export my data" builds a JSON file in the browser from existing endpoints (plan, workspace,
    dashboards, Ask threads + memory, support messages, device settings).
  - Danger zone: sign out; Delete account is a REQUEST (typed DELETE -> POST /api/support/messages). There was no
    self-serve deletion before; the admin DELETE /api/users/{id} (superadmin console) still performs it, and the privacy
    policy promises 30 days.
  - Left in place on purpose: settings/{LeaderboardOptIn,AdSlotsEditor,AdSlotRequestsInbox}.tsx. They are still imported by
    dashboard/leaderboard/page.tsx and (marketing)/leaderboard/join/page.tsx in this branch; tc/leaderboard replaces
    both, then these three files can be deleted.
  - Removed '/dashboard/settings' from LEGACY_ROUTE_PREFIXES.
- Plan (/dashboard/plan): plan/billing.ts holds the config (Free 5 messages, Growth $19 / 50, Pro $29 / 100, Starter kept
  for people who have it; the live Dodo product ids are unchanged). Usage card (messages left, renewal or "active until",
  Cancel subscription modal -> POST /api/subscription/cancel as before), three plan cards (Free, Growth, Pro; checkout link
  pattern and ?upgraded=true handshake unchanged), "Recent questions" table from the Ask threads on the server (replaces
  the old localStorage-only usage list, which only the removed widget wrote), FAQ. No Telegram, no site limits, no
  "up to 3 sites". "Manage billing" is not shown: there is no Dodo customer-portal integration to link to.
  Removed '/dashboard/plan' from LEGACY_ROUTE_PREFIXES.
- Support (/dashboard/support): same thread logic (SWR, optimistic send, mark read, length limits), new layout: header,
  conversation card (log region, neutral bubbles, composer with counter), side cards (Docs, Email us, how support works,
  private). The old "Priority support" and gradient/ping decorations are gone.
- Docs (/dashboard/docs): rewritten as one page with an "on this page" list: Getting started, Portfolio, Site pages,
  Dashboards, Leaderboard, Connect AI, Ask, Help. No Telegram. Example questions link to /dashboard/ask?q=...&prefill=1.
  Removed '/dashboard/support' and '/dashboard/docs' from LEGACY_ROUTE_PREFIXES.
