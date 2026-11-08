---
name: Agent Office
description: A cozy picture-book office tower where every project is a floor and AI agents are the villagers working in it.
colors:
  leaf: "#287a41"
  leaf-soft: "#e3f4e4"
  coral: "#d9533d"
  coral-soft: "#ffe6df"
  butter: "#ffd45e"
  brass: "#f2cf72"
  teal: "#25786f"
  teal-deep: "#1c625b"
  plaque-wood: "#8a5a3c"
  ink: "#4a3a2e"
  ink-soft: "#7a6352"
  line: "#eadfce"
  card: "#ffffff"
  sky-top: "#93d3f2"
  sky-mid: "#c4ebf7"
  sky-peach: "#ffe4cf"
typography:
  display:
    fontFamily: "Jua, sans-serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.2
  title:
    fontFamily: "Jua, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.3
  body:
    fontFamily: "Gowun Dodum, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Jua, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.3
rounded:
  chip: "8px"
  button: "16px"
  card: "20px"
  panel: "26px"
  round: "50%"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
components:
  button-primary:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.card}"
    typography: "{typography.title}"
    rounded: "{rounded.button}"
    padding: "11px 18px"
  button-quiet:
    backgroundColor: "#f3ede4"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "11px 18px"
  button-brass:
    backgroundColor: "{colors.brass}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "11px"
  floor-button:
    backgroundColor: "{colors.teal}"
    textColor: "{colors.card}"
    typography: "{typography.title}"
    rounded: "14px"
  floor-button-active:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
  approval-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "13px 15px"
---

# Design System: Agent Office

## Overview

**Creative North Star: "The Picture-Book Tower"**

The whole product is one cozy building seen in cross-section, like the cutaway pages of a children's picture book. You read status from the building itself: glowing windows mean a team is working, a coral balloon means someone is waiting for you. Step inside a floor and its front wall swings open like a dollhouse, revealing toon-shaded animal villagers at their desks.

Everything is rounded, soft and toy-like, but the interface stays an instrument: the elevator panel, order bar and approval cards are plain, legible and always in the same place. Charm lives in the world. The chrome carries the task.

The art is original. The tone is the user's pinned "cozy life-sim village" reference, not a copy of any game's characters, assets or UI.

**Key Characteristics:**
- 3D world first; UI panels float above it on the left, right and bottom edges.
- Toon shading (3-step ramp) with warm-brown ink outlines on villagers and trees.
- Candy-pastel floors (mint, butter, peach, lilac, sky) on a white trim frame.
- Rounded everything: RoundedBox furniture, pill chips, 14–26px UI radii.
- Korean copy in a playful office-life voice.

## Colors

A full pastel world held together by a single warm-brown ink.

### Primary
- **Sprout Leaf** (leaf): the one "do it" color: 맡기기, 승인, empty-state call to action.

### Secondary
- **Elevator Teal** (teal / teal-deep): the elevator panel and its floor shaft; also links like "가 보기".
- **Brass Button** (brass): floor-number discs, "새 층 올리기", the exterior floor-sign discs.

### Tertiary
- **Alarm Coral** (coral / coral-soft): reserved for approvals: the ask card border, the villager's ask bubble, the exterior "!" balloon, and the "승인 대기" state.
- **Butter** (butter): 대표 rank chip, focus ring, text selection.

### Neutral
- **Bark Ink** (ink): all text and outlines in the 3D world (#5a4636 in three.js).
- **Soft Bark** (ink-soft): secondary text, timestamps.
- **Card White** (card) and **Dashed Line** (line): panels and journal dividers.
- **Plaque Wood** (plaque-wood): the floor title plaque only.
- **Sky** (sky-top → sky-mid → sky-peach): the page background gradient behind the transparent WebGL canvas.

### Named Rules
**The Coral Means You Rule.** Coral appears only when 대표 has to decide something. Never use it for decoration or errors that need no action.

**The Status Lives in the Building Rule.** Working floors glow (window glass #ffe7a3 at 62%), idle floors stay sky glass (#cfefff at 42%). Don't add separate stat cards for what the building already shows.

## Typography

**Display Font:** Jua (self-hosted via @fontsource, sans-serif fallback)
**Body Font:** Gowun Dodum (self-hosted via @fontsource)

**Character:** Jua is chunky and round like a hand-painted shop sign; Gowun Dodum is a calm, slightly soft body face that keeps long agent output readable.

### Hierarchy
- **Display** (Jua 22px): app title on the elevator panel; 24px for the empty-state heading.
- **Title** (Jua 15–20px): floor names, plaque, buttons, villager names.
- **Body** (Gowun Dodum 13–15px, 1.5): order input, approval text, journal entries.
- **Label** (Jua 11–12px): rank chips, floor chips, state pills.

## Layout

Fixed frame around a full-bleed 3D stage: elevator panel on the left (228px), journal and approvals on the right (330px), order bar centered between them at the bottom, and the floor plaque centered at the top. The camera uses a view offset so the building centers in the free space between the panels. Minimum window is 1100×700. The UI spacing rhythm is 6 / 10 / 16px.

## Elevation & Depth

The 3D world gets its depth from soft PCF shadows under a warm sun. UI panels float with one soft, offset shadow; there are no hard block shadows. Brass and floor-number buttons carry a small inset bottom shade so they read as pressable.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 6px 18px rgba(74,58,46,.16), 0 2px 4px rgba(74,58,46,.10)`): every floating panel, card, bubble and sign.
- **Button inset** (`box-shadow: inset 0 -3px 0 rgba(0,0,0,.12)`): brass buttons and floor-number discs.

## Shapes

Generous rounding at every scale: 26px panels, 20px cards, 14–16px buttons, 8px chips, circles for floor numbers, status lamps and the alert balloon. Speech bubbles have a small triangular tail. In 3D, all furniture is RoundedBox and characters are built from spheres and capsules.

## Components

### Buttons
- **Primary** (leaf, white Jua label, 16px radius) with a leading stroke icon.
- **Quiet** (#f3ede4) for 멈추기 and 거절.
- **Brass** for building actions (새 층 올리기).
- **Focus:** 3px butter outline, 2px offset.

### Elevator Panel (signature)
A teal panel with a darker inset shaft listing floors top-down, lobby last. Each floor is a brass number disc, its name and a status lamp: green with a halo when working, coral and blinking when waiting for approval. The active floor turns white. Deleting a floor takes two clicks (trash, then "정말?").

### Approval Card
White card with a 3px coral border and a pop-in animation. It shows the floor chip, who is asking and what, with 승인 / 거절, plus "가 보기" when you're on another floor.

### Villager Label (in-world)
A white name pill with a rank chip (대표 butter, 팀장 periwinkle, 대리 mint, 사원 pink), a mint "doing" chip with a tool icon, and a speech bubble that springs in. The ask bubble is coral.

### Floor Sign (exterior)
A white pill on the building's right side: brass floor disc, project name and a state pill (쉬는 중 / 작업 중 / 승인 대기). Clicking it enters the floor.

## Do's and Don'ts

### Do:
- **Do** use the stroke icons from `web/icons.js` (24 grid, 2.2–2.4 stroke, round caps) for tool kinds and actions.
- **Do** keep villagers toon-shaded with ink outlines and blush, built from rounded primitives.
- **Do** give every new floor the next pastel in the theme rotation.

### Don't:
- **Don't** use emoji as icons in chips, journal or buttons; emoji are fine only inside a villager's spoken line.
- **Don't** reuse characters, art or UI from existing games; the cozy tone is pinned, the art is ours.
- **Don't** use coral for anything that doesn't need 대표's decision.
