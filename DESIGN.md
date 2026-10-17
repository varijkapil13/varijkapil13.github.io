---
name: varij.dev
description: Personal site and engineering writing of Varij Kapil
colors:
  signal-green: "#4ade80"
  signal-green-strong: "#86efac"
  forest-green: "#15803d"
  night-ground: "#09090b"
  night-panel: "#111113"
  night-line: "#232326"
  night-line-strong: "#3f3f46"
  night-ink: "#ededef"
  night-muted: "#8b8b93"
  day-ground: "#ffffff"
  day-panel: "#fafafa"
  day-line: "#e4e4e7"
  day-ink: "#09090b"
  day-muted: "#71717a"
  code-ground: "#0d0d10"
typography:
  display:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1.06
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
  body:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "16.5px"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  full: "9999px"
spacing:
  gutter-mobile: "20px"
  gutter: "32px"
  section: "56px"
  container: "1040px"
  reading: "700px"
components:
  button-primary:
    backgroundColor: "{colors.night-ink}"
    textColor: "{colors.night-ground}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.night-ink}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  card:
    backgroundColor: "{colors.night-panel}"
    rounded: "{rounded.lg}"
  pill:
    textColor: "{colors.night-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
---

<!-- SNAPSHOT: records the incumbent "direction B" design before the impeccable redesign. The redesign replaces this file at finish. -->

# Design System: varij.dev

## Overview

**Creative North Star: "The Build Log"**

The site reads like a well-kept engineering log. Entries are dated rows separated by hairlines, labels are set in a small monospace face, and a single green status dot marks what is live. Nothing is decorated; hierarchy comes from weight, size and the muted/ink contrast.

Dark is the default (near-black ground). A light theme exists behind a toggle and mirrors the same structure on white. Density is moderate: a 1040px container, generous section padding, and a 700px reading column for posts with a sticky table of contents beside it.

**Key Characteristics:**
- One accent, used as a signal (dots, active states, link underlines on hover), never as a fill.
- Monospace for metadata: dates, tags, reading time, eyebrows.
- Hairline borders and tonal panels instead of shadows.
- Code blocks are always dark, in both themes.

## Colors

A neutral zinc palette with a single green signal.

### Primary
- **Signal Green** (dark theme accent): status dots, series numbering, hover colour for titles, focus outlines, blockquote rule.
- **Forest Green** (light theme accent): the same roles on white.

### Neutral
- **Night Ground / Day Ground**: page background.
- **Night Panel / Day Panel**: cards, inline code, the hero facts panel.
- **Night Line / Day Line**: every hairline divider and card border; **Line Strong** on hover.
- **Night Ink / Day Ink**: headings and primary text; also the primary button fill.
- **Night Muted / Day Muted**: secondary text, labels, the muted half of headlines.
- **Code Ground**: every `<pre>` regardless of theme.

### Named Rules
**The Signal Rule.** Green appears only as a signal (dot, number, hover, focus). It never fills a region or a button.

## Typography

**Display / Body Font:** Geist (variable)
**Label/Mono Font:** Geist Mono (variable)

**Character:** A neutral grotesk with tight negative tracking at display sizes, paired with its own mono sibling for all metadata.

### Hierarchy
- **Display** (600, 48px on desktop / 36px mobile, 1.06): page titles and the home headline; second clause set in muted.
- **Headline** (600, 24px): post `h2`, preceded by a hairline and top padding.
- **Title** (600, 20px): section titles on Home, card titles.
- **Body** (400, 16.5px, 1.75): post prose in a 700px column.
- **Label** (400, 12px mono, muted): eyebrows, dates, tags, reading time, pills.

### Named Rules
**The Mono Metadata Rule.** Anything that is data about content (date, tag, count, minutes) is mono and muted; content itself is never mono.

## Layout

A 1040px centered container with 20px gutters on mobile and 32px from `sm`. Sections are full-width bands separated by a bottom hairline, padded 56–96px vertically. Home: hero grid (1.4fr / 1fr, headline left, facts list right), series timeline as a 7-column cell grid, latest writing as table-like rows (date · title · tags · minutes). Post page: 700px reading column plus a sticky table-of-contents sidebar from `lg`; an inline TOC above the body on smaller screens. All grids use `minmax(0,1fr)` columns so long code never widens the page.

## Elevation & Depth

Flat. Depth comes from tonal layering (panel on ground) and hairline borders. The only blur is the translucent sticky header (85% ground with backdrop blur).

### Named Rules
**The No-Shadow Rule.** No box shadows anywhere; a border colour change is the hover state.

## Shapes

Softly rounded rectangles: 12px for cards, code blocks and images; 8px for buttons; 6px for inline code and copy buttons; full pills for tags and the hero badge. Cells in the series timeline share one rounded outer frame with 1px gaps as dividers.

## Components

### Buttons
- **Shape:** gently rounded (8px).
- **Primary:** ink fill with ground-coloured text; hover lowers opacity to 90%.
- **Secondary:** transparent with a hairline border; hover adds the panel fill and the strong line colour.

### Chips
- **Pill:** mono 12px muted text in a full-round hairline outline, often led by a green dot.
- **Tag filters (blog index):** pills with `aria-pressed`; pressed state uses ink text and the strong line.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** panel.
- **Shadow Strategy:** none (see Elevation).
- **Border:** 1px line, line-strong on hover.

### Navigation
- Sticky translucent header: VK monogram, four text links (Home, Blog, About, Projects), language switcher, theme toggle; collapses to a menu button on mobile. Footer carries LinkedIn only.

### Series Timeline (signature)
A strip of seven equal cells, each with a green two-digit index, the year in muted mono, and a short label; the strip wraps to 2 and 4 columns on smaller screens.

## Do's and Don'ts

### Do:
- **Do** keep metadata mono and muted, content in Geist.
- **Do** separate list rows with hairlines rather than cards.
- **Do** keep code blocks dark in both themes.

### Don't:
- **Don't** add shadows or gradients.
- **Don't** use the green accent as a fill.
- **Don't** let any element widen the page beyond the viewport on a 320px screen.
