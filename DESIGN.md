---
name: varij.dev
description: Personal site and engineering writing of Varij Kapil, drawn as a transit network map in a quiet, dark-first register
colors:
  ground: "#08090a"
  panel: "#0f1011"
  hairline: "#1d1e21"
  hairline-strong: "#2e3035"
  ink: "#f4f5f6"
  ink-muted: "#8b8f98"
  accent: "#8ab4ff"
  code-ground: "#0d0e10"
  glow: "rgb(110 140 255 / 0.10)"
  line-runtime: "#5b8cff"
  line-data: "#34c48b"
  line-platform: "#f5a524"
  line-operations: "#a78bfa"
  line-security: "#f2555a"
  line-team: "#c99a66"
typography:
  display:
    fontFamily: "Geist Variable, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "4.5rem"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.04em"
    fontFeature: "\"ss01\" 1"
  headline:
    fontFamily: "Geist Variable, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Geist Variable, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  lead:
    fontFamily: "Geist Variable, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.625
  body:
    fontFamily: "Geist Variable, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "16.5px"
    fontWeight: 400
    lineHeight: 1.75
  station:
    fontFamily: "Geist Variable, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.15
  label:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.33
  code:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.625
rounded:
  code-inline: "4px"
  bullet: "5px"
  bullet-lg: "6px"
  control: "8px"
  figure: "10px"
  panel: "12px"
  interchange: "8px"
spacing:
  gutter: "20px"
  gutter-wide: "32px"
  container: "1120px"
  rail: "3px"
  dot: "9px"
  map-row: "62px"
  control-height: "40px"
  section: "64px"
  section-wide: "80px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "{spacing.control-height}"
  button-secondary:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "{spacing.control-height}"
  button-secondary-hover:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
  panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.panel}"
    padding: "20px 24px"
  line-bullet:
    backgroundColor: "{colors.line-runtime}"
    textColor: "{colors.ground}"
    rounded: "{rounded.bullet}"
    size: "18px"
  line-bullet-lg:
    backgroundColor: "{colors.line-runtime}"
    textColor: "{colors.ground}"
    rounded: "{rounded.bullet-lg}"
    size: "24px"
  code-block:
    backgroundColor: "{colors.code-ground}"
    textColor: "{colors.ink}"
    typography: "{typography.code}"
    rounded: "{rounded.figure}"
    padding: "16px"
  code-inline:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.code-inline}"
    padding: "2px 6px"
  nav-link:
    textColor: "{colors.ink-muted}"
    padding: "0 12px"
    height: "56px"
  nav-link-active:
    textColor: "{colors.ink}"
---

# Design System: varij.dev

## Overview

**Creative North Star: "The Network Map"**

The site draws one platform's modernization as a transit network. Every migration is a station on one of six coloured lines (Runtime, Data, Platform, Operations, Security, Team), and every line runs into a single interchange: today's multi-tenant SaaS platform. Lines still being built continue past it as dashed track. The map is the memorable thing; everything else exists to get a reader into a post and through it.

The network is now rendered quietly, in the register of Linear and Vercel. The first rendition (navy sign bands, a yellow departure board, condensed signage type) read as dated, so the world keeps its map and drops its paint. Dark is the default theme: a near-black ground, hairline borders, quiet bordered panels, Geist set tight, and a faint light falling from above each page masthead. The map sits in a panel on a plotted dot grid. The six line colours are the only saturated colour anywhere, and they always mean a line.

Density is calm and editorial: generous section spacing, a 1120px container, one column of reading text at about 700px. The world rejects heavy colour fields, shadows as decoration, neon accents and the hero-plus-card-grid template.

**Key Characteristics:**
- Dark-first near-black ground with a light theme that swaps tokens, not structure
- Hairlines (1px) and 12px bordered panels instead of colour bands or shadows
- Six categorical line colours as the only saturation on a page
- Thin 3px rails, 9px station dots, a hairline interchange pill
- Geist for everything readable; Geist Mono only for code and data labels
- One authored motion: the hovered line comes forward and the rest dim

## Colors

A graphite-neutral system with one cool link accent and six categorical line colours; the neutrals do the work and the lines carry the meaning.

The frontmatter holds the dark (default) values. The light theme is the same set of roles on `:root`: white ground (#ffffff), panel (#fafafa), hairline (#ebebeb), strong hairline (#d4d4d4), ink (#0a0a0a), muted ink (#666670), accent (#2563eb), glow rgb(37 99 235 / 0.07), code ground (#0b0c0e, code stays dark in both themes), and deeper line colours: runtime #2563eb, data #0e8a5f, platform #d97706, operations #7c3aed, security #dc2626, team #a16207.

### Primary
- **Signal Blue** (accent): link hover, focus ring (2px outline, 2px offset), text selection at 35%, the hover state of a station label. Never a fill, never a background.

### Neutral
- **Near-Black Ground** (ground): page background, header at 80% with backdrop blur, the inner colour of the interchange.
- **Raised Graphite** (panel): bordered panels, inline code, open station dots, secondary-button hover.
- **Hairline** (hairline): every divider, panel border, table row and section rule.
- **Strong Hairline** (hairline-strong): secondary-button border, table header rule, quiet tracks (career and projects side lines), fact separators.
- **Paper Ink** (ink): headings, body emphasis, primary-button fill, the interchange outline.
- **Graphite Muted** (ink-muted): leads, metadata, unposted station labels, mono labels.
- **Code Night** (code-ground): fenced code blocks.
- **Masthead Glow** (glow): the radial light above each masthead, nothing else.

### Tertiary: the six lines
- **Runtime Blue** (line-runtime), **Data Green** (line-data), **Platform Amber** (line-platform), **Operations Violet** (line-operations), **Security Red** (line-security), **Team Bronze** (line-team). Used on rails, station dots, line bullets, the post page's list markers and table-of-contents track (`--post-line`), and generated cover art.

### Named Rules
**The Line Colours Are Data Rule.** The six line colours are categorical: each one means its line and nothing else. They are the only saturated colour on any page. Never use one as a decorative accent, a button fill or a section background, and never introduce a seventh saturated hue.

**The Hairline Rule.** Structure comes from 1px hairlines and quiet bordered panels, not from colour fields. No full-bleed colour bands, no tinted section backgrounds; the masthead glow is the only gradient and it stays below 10% opacity.

## Typography

**Display Font:** Geist Variable (with Noto Sans Devanagari, system-ui)
**Body Font:** Geist Variable (with Noto Sans Devanagari, system-ui)
**Label/Mono Font:** Geist Mono Variable (with ui-monospace)

**Character:** One neutral grotesque set tight at large sizes and relaxed in reading text, with stylistic set ss01 on throughout; the mono is a data voice, not a decoration. Devanagari falls back to Noto Sans Devanagari at 400/600 for the Hindi pages.

### Hierarchy
- **Display** (600, 2.75rem → 4.5rem on Home, 2.5–3.5rem on About/Projects, 2–3rem on posts; line-height 1.02; -0.04em): the page title in each masthead, balanced wrap, hyphenated.
- **Headline** (600, 22px → 26px, line-height 1.25, -0.03em): section headings ("The modernization, as a network", "Latest writing"). Post h2 is 24px / 1.2.
- **Title** (600, 18px, tight tracking): career roles, project names, education entries, prev/next station titles.
- **Lead** (400, 17px, 1.625, muted): the line under a title or heading, 58–65ch.
- **Body** (400, 16.5px, 1.75, ink at 86% toward muted): post prose in a ~700px column.
- **Station** (400, 12.5px, 1.15): map station labels; ink when the station has a post, muted when not.
- **Label** (Geist Mono 400, 12px, muted, sentence case): table-of-contents heading, departure-board column heads, dates and read times, table headers.

### Named Rules
**The Mono Is Data Rule.** Geist Mono appears only for code and for data labels: dates, read times, column heads, table headers. Never for headings, buttons, navigation or prose, and never uppercase-tracked as an eyebrow.

## Layout

A centred 1120px container with a 20px gutter (32px from 640px). Pages open with a masthead (title, muted lead, actions) closed by a hairline, then sections spaced 64px apart (80px from 768px). Posts use a two-column grid from 1024px: a 700px reading column and a sticky table of contents; below that the TOC collapses into a panel disclosure.

The network map is a CSS grid: a 128px line-name column, one equal column per station position, a 40px interchange column and a 168px column for stations still being built. Each line is a 62px row; stations are right-aligned so every line runs into the interchange. Below 768px the map becomes a two-column grid of vertical strip maps, one per line, ending at "Today". Nothing scrolls horizontally at 320px; long words hyphenate and code blocks scroll inside themselves.

## Elevation & Depth

Flat. Depth comes from tonal steps (ground → panel) and hairlines, plus two ambient lights: the masthead's radial glow from above and the map's dot grid (1px dots at 9% ink, 22px pitch). The header is translucent (ground at 80%, backdrop blur) over a hairline.

### Shadow Vocabulary
- **Station ring** (`box-shadow: 0 0 0 4px color-mix(in srgb, var(--c) 25%, transparent)`): a soft halo in the line's own colour on a hovered or focused station dot, and on the current station in a post's line strip. The TOC uses the same ring at 3px for the current section; the About career track uses it in ink at 15% on the current role, a neutral stop on a strong-hairline track.

### Named Rules
**The No-Shadow Rule.** Nothing casts a shadow. The only box-shadow in the system is the station ring, and it appears only as a response to hover, focus or "you are here".

## Shapes

Gently rounded rectangles on a strict small scale: inline code 4px, line bullets 5px (6px large), buttons 8px, code blocks and images 10px, panels and stop links 12px. Map geometry is round and thin: 3px rails with a 2px rounded start, 9px circular dots with a 2px line-coloured border, and the interchange as a 16px-wide pill with an 8px radius and a 2px ink outline spanning all six rows. Dashed track is a repeating gradient (6px dash, 5px gap horizontally; 5px/4px vertically).

### Named Rules
**The Filled Station Rule.** A filled dot is a station with a post and is a link; an open dot (panel-coloured centre) is a station without one. Never fill a dot that does not lead to a post.

**The Interchange Is Today Rule.** Every line runs into one interchange, and it means the present: today's multi-tenant SaaS platform. It is drawn in ink, never in a line colour, and nothing sits beyond it except work still being built.

**The Dashed Track Rule.** Dashed rail and open dots past the interchange mean "still being built". Never dash a line for decoration, and never draw finished work dashed.

**The One Arrow Rule.** Every directional cue is the same inline SVG arrow (`Arrow.astro`: square caps, miter joins, stroke 3, 1em), rotated for "back". No text-glyph arrows, chevrons or second icon set for direction.

## Components

### Buttons
Quiet and precise.
- **Shape:** gently rounded (8px), 40px tall, 16px side padding, Geist 500 at 14px.
- **Primary:** ink fill with ground text (a white button on the dark theme, a black one on light). Reserved for LinkedIn, the only contact. Hover drops to 85% opacity.
- **Secondary:** transparent with a strong-hairline border; hover fills with panel and lifts the border to muted.
- **Arrow:** buttons and onward links carry the one SVG arrow inline at 1em.

### Line Bullet
A small rounded square (18px, 5px radius; 24px/6px large) in the line's colour carrying its letter (R, D, P, O, S, T) in Geist 600. Letters are near-black on the dark theme; on light they are white except Platform, which stays dark for contrast. It labels a line wherever a line is named: map, board rows, post meta, line navigation, covers.

### Cards / Containers (Panel)
- **Corner Style:** 12px.
- **Background:** panel.
- **Shadow Strategy:** none (see Elevation).
- **Border:** 1px hairline.
- **Internal Padding:** 20–32px; the map panel adds the dot grid.

### Departure Board (post list)
A hairline table inside a panel: mono column heads (Date, Line, Post, Read), then rows of mono date, line bullet, title in Geist 500 at 15.5px, and mono read time. Rows divide with hairlines; hover turns the title accent. On phones the bullet leads and date/read time drop under the title. The name survives from the first rendition; the yellow board does not.

### Navigation
Sticky 56px header: "VK" monogram tile (24px, 6px radius, ink fill) and name on the left; 14px links in muted that go ink on hover; the current page in ink with a 1px ink bar on the header's bottom hairline. Language switcher and theme toggle (18px stroke icons) follow. On phones a menu button opens a stacked list with hairline separators. The footer repeats the links in muted 14px with a secondary LinkedIn button.

### Line Navigation (post footer)
At the end of a post: the line's large bullet and name, a horizontal strip of its stations on a 3px rail (current station enlarged with the station ring, past and posted stations filled, the interchange as an ink-outlined dot), then two bordered stop links for the previous and next station.

### Table of Contents
A thin vertical track in the post's line colour (45% mix) with small open dots; the current section's dot fills and takes the ring. Labelled "On this page" in the mono label style.

### The Network Map (signature)
Six rows on the dot-grid panel converging on the interchange pill, labelled "Today" with the hub name in muted. Hovering or focusing any part of a line brings it forward and dims the others to 18% opacity over 220ms (cubic-bezier(0.16, 1, 0.3, 1)); reduced motion removes the transition. Content is always visible by default.

### Generated Art
Cover images (`scripts/generate-covers.mjs`, 1200×630) and diagrams (`scripts/diagrams/`) use the same world: ground #08090a, the masthead glow, a 24px dot grid, Geist and Geist Mono embedded, bullets, a 4px strip map ending at an ink-outlined interchange.

## Do's and Don'ts

### Do:
- **Do** treat each line colour as data: use it only where its line is meant (rails, dots, bullets, a post's own markers and TOC).
- **Do** fill a station dot only when that station links to a post; leave it open otherwise.
- **Do** run every line into the single "Today" interchange, drawn in ink, and dash only work still being built.
- **Do** build structure from 1px hairlines and 12px bordered panels on the near-black ground.
- **Do** use the one SVG arrow (`Arrow.astro`, square-ended, stroke 3) for every directional cue, flipped for "back".
- **Do** keep the primary button for LinkedIn; everything else is secondary or a plain muted link.
- **Do** keep dark as the default and change themes by swapping tokens only.

### Don't:
- **Don't** add colour bands, tinted sections, sign-style navy headers or a yellow board; that was the first rendition and it read as dated.
- **Don't** introduce a saturated colour outside the six lines, or use a line colour as decoration.
- **Don't** use Geist Mono for headings, buttons, navigation or uppercase eyebrows.
- **Don't** add shadows to panels, buttons or cards; the station ring is the only one.
- **Don't** use text-glyph arrows (→, ›) or a second icon style for direction.
- **Don't** let anything scroll horizontally at 320px.
