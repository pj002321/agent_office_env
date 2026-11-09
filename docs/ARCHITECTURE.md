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

Each floor keeps its claude session id in floors.json and resumes it on every order. Headless `-p` has no
`/resume` or `/clear`, so the app handles them: app/history.cjs reads the CLI's own transcripts
(`~/.claude/projects/<folder>/<session>.jsonl`) to refill the journal on launch and to list past sessions;
`/resume` (or 지난 대화) switches the floor's session, `/new` starts a fresh one.

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
| auto | PreToolUse hook on a 자동 승인 floor | allowed at once; mint bubble, no walk |
| auth | `claude` run failed with a login error | "Claude 권한 받아와" quest toast |

The renderer only knows OfficeEvents, so Codex, terminal-session watching, and demo playback plug in as new producers.

## Login

At startup the app runs `claude auth status` and `codex login status` (after `where`/`which`). Missing or signed-out CLIs get a quest toast whose button opens the CLI's own login (`claude auth login` / `codex login`) in a new terminal, then polls until signed in.

## Skills & store (app/skills.cjs)

- Installed: `SKILL.md` folders under `~/.claude/skills`, each floor's `.claude/skills`, enabled Claude plugins' `skills/`, `~/.agents/skills`, `~/.codex/skills` (+ `.system`), and installed Codex plugins.
- Store: `claude plugin list --available --json` (deduped by name, most installs wins; categories from local marketplace.json) and Codex marketplace snapshots from `codex plugin marketplace list` + `.codex-plugin/plugin.json` (logo, brand color, prompts).
- Install / remove: `claude plugin install|uninstall <id> --json -s user`, `codex plugin add|remove <id>`. IDs are validated before reaching the shell. A marketplace-declared install command is shown to 대표 and passed back with `--accept-command <sha256>` only after approval.
- Using a skill: a picked Claude skill is sent in front of the order as `/name` (verified: `claude -p` runs it as a slash command).

## Points & 꾸미기 상점 (app/shop.cjs, web/deco.js)

- Every order earns `EARN` points (main, in `run()`); the wallet lives in `%APPDATA%/agent-office/wallet.json` and is pushed as a `{ kind: 'wallet' }` event.
- Items are priced in points only: building tier (house → small → tower, in order), wallpaper, floor, toggleable furniture. Buying equips. `world.setLook()` restyles every floor.
- Cash buys point packs (`PACKS`) — the single place a payment provider plugs in. Not connected yet.

## Sound (web/sound.js, web/soundui.js, app/music.cjs)

- BGM and button SFX are off by default; settings live in renderer localStorage.
- The built-in healing track is generated live with Web Audio (no bundled audio, no license to track).
- 내 음악: picked files are copied into `%APPDATA%/agent-office/music` and played from `file://`.

## Roadmap

1. ✅ One floor, Claude runner, approvals, subagents
2. ✅ One building, a floor per project (persisted in `%APPDATA%/agent-office/floors.json`), elevator panel, a runner per floor
   — next: watch terminal-launched sessions
3. Codex runner (`codex exec --json`)
4. ✅ Art pass: picture-book tower, toon villagers (see DESIGN.md)
5. Decorate mode (grid furniture, A* walking)
6. Installer (electron-builder) + download site; check Anthropic commercial terms before release
