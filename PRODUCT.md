# Product <!-- impeccable:product-schema 1 -->

Sources: confirmed in chat with the user on 2026-11-08. Items marked _(inferred)_ were not asked directly.

## Platform

web (Electron desktop app; renderer is a web page)

## Users

A solo developer or small-team lead who runs several AI coding agents (Claude Code, and later Codex) across multiple projects at once. They want to give orders and see who is working, who needs approval, and what got done, without switching between terminal windows.

## Product Purpose

A downloadable desktop app that turns the user's locally installed AI CLIs into a cozy office building. Each project is an office floor. The user is 대표 (CEO). Orders go to a 팀장 (lead session), subagents arrive as staff, and every real action (reading, editing, running commands, asking for approval, reporting) is shown as a character doing it. Success: the user prefers giving orders here over the terminal, and enjoys watching it.

## Positioning

It is not a view-only dashboard. The office is the control surface: orders are typed in the office, and approvals happen by answering the staff member who walks up to the CEO desk. It runs the user's own logged-in CLIs, so it works with their existing subscriptions, and it never handles credentials.

## Operating Context

- Runs beside the user's IDE on Windows first, then macOS.
- One building, many floors (one per project folder). Several staff per floor, with ranks: 대표 (the user), 팀장 (main session), 대리/사원 (subagents).
- Long-running work: the window stays open for hours and is glanced at between other tasks _(inferred)_.

## Capabilities & Constraints

- Spawns `claude -p --output-format stream-json`; tools that write or execute need the user's approval through a PreToolUse hook.
- Never stores or proxies Claude or ChatGPT credentials. Never uses "Claude"/"Anthropic" in the product name or logo.
- Undecided: product name, Codex integration details, whether terminal-launched sessions also appear.

## Brand Commitments

- Tone pinned by the user: a cozy, pastel, rounded life-sim village feel, explicitly "like Animal Crossing", plus the cute look of the open-source claude-3d-frog-office. Art must be original: no characters, assets, or likenesses taken from those works.
- Korean UI copy, playful office-life voice ("퇴근합니다! 👋", "승인 대기").

## Evidence on Hand

No users, testimonials, or metrics yet. Real data comes from the user's own CLI sessions.

## Product Principles

1. The office is the interface: every real agent action has a visible counterpart.
2. People decide: anything that changes files or leaves the machine waits for 대표.
3. Glanceable from across the room: status is readable without reading text.
4. Cozy, not noisy: delight comes from charm, not alerts.
