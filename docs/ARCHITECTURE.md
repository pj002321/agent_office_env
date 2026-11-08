# Agent Office — Architecture

Goal: a downloadable desktop app. Each project folder is an office floor; the user (대표) gives orders,
their own locally installed `claude` / `codex` CLIs do the real work, and the office shows it like a game.

## Rules we don't break

- The app never touches credentials. It only spawns the user's unmodified, already-logged-in CLIs
  (Anthropic docs: third-party apps may not offer claude.ai login or route subscription credentials).
- Don't use "Claude"/"Anthropic" in the product name or logo.
- Anything that changes files or runs commands needs 대표's approval in the office.

## Flow

```
renderer (web/index.html + app.js UI, world.js Three.js building)
   ▲ OfficeEvent (IPC)            │ order / approve
main (app/main.cjs, Electron)     ▼
   spawn: claude -p --output-format stream-json --verbose --settings <PreToolUse hook> [--resume <session>]
   stdout lines ──► app/stream.cjs ──► OfficeEvent
   hook (app/hook.cjs) ──HTTP 127.0.0.1 + token──► main ──► "ask" card ──► allow/deny back to the CLI
```

## OfficeEvent

`{ agent: 'lead' | <Agent tool_use id>, kind, text }`

| kind | from | in the office |
|---|---|---|
| start | system/init | 팀장 says "바로 시작하겠습니다" |
| say | assistant text | speech bubble |
| work | assistant tool_use | walks to desk, types, "📖 x 읽는 중" |
| hire | tool_use `Agent`/`Task` | new 사원 enters by the door, takes a desk |
| leave | tool_result for that Agent | reports to 팀장, says bye, leaves |
| ask / answer | PreToolUse hook | walks to 대표, hops with a red bubble until approved |
| done | result | 팀장 reports to 대표 |
| exit | process close | resets the floor |

The renderer only knows OfficeEvents, so Codex, terminal-session watching, and demo playback plug in as new producers.

## Roadmap

1. ✅ One floor, Claude runner, approvals, subagents
2. ✅ One building, a floor per project (persisted in `%APPDATA%/agent-office/floors.json`), elevator panel, a runner per floor
   — next: watch terminal-launched sessions
3. Codex runner (`codex exec --json`)
4. ✅ Art pass: picture-book tower, toon villagers (see DESIGN.md)
5. Decorate mode (grid furniture, A* walking)
6. Installer (electron-builder) + download site; check Anthropic commercial terms before release
