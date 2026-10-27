# Round 2 · WS1 Professional polish (tc/r2-polish, worktree tc-r2-polish, dev instance r2polish 3111/8111)

Inputs: /root/projects/tc-redesign-research/round2/{ROUND2,RULES,design-critique}.md.
Candidate screenshots: /root/projects/tc-redesign-research/round2/candidate/polish/ (same names as round2/shots/critique-*).

## Done

### 1. Tawk chat bubble (critique #1, D4)
- `components/ui/chatWidget.ts`: the only Tawk loader. Bubble on marketing pages and /dashboard/support at
  >= 768px; never on /dashboard/** (except Support), /share, /embed, /view, /admin, /superadmin, /oauth, /mcp,
  /preview-private; never on phones. `openLiveChat()` opens it anywhere (Support "Chat with us" card), it stays
  while a chat is open/ongoing and hides after it is minimised with no chat.
- No auto-greeting: `#message-preview` (Tawk's greeting card) and the unread badge stay hidden until the visitor
  opened the chat once (globals.css + a style tag in Tawk's same-origin launcher iframe). Dark app theme: the
  launcher gets a hairline ring.
- `components/shell/ChatWidget.tsx` mounted in app/providers.tsx (route + width watcher). AppShell no longer loads it.
- `useHideChatWidget` (Modal/Drawer/nav drawer) now goes through the same module, so closing a sheet never
  re-shows the bubble on a page where it does not belong.
- Owner action (optional): turn off the greeting trigger in the Tawk dashboard too; the code already hides it.
- Test: tests/chatWidget.test.mjs.

## For other workstreams
