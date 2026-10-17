---
name: varij.dev
description: Personal site and engineering writing of Varij Kapil, drawn as a transit network map
colors:
  map-ground: "#ffffff"
  map-panel: "#f3f4f6"
  map-line: "#d8dbe0"
  map-line-strong: "#9aa1ab"
  ink: "#101318"
  ink-muted: "#565d68"
  link-blue: "#0060a8"
  code-ground: "#12161d"
  sign-navy: "#0b2b5e"
  sign-white: "#ffffff"
  sign-muted: "#bccbe3"
  board-yellow: "#ffd400"
  board-ink: "#111111"
  board-muted: "#4a3f00"
  board-rule: "#1111112e"
  line-runtime: "#0067b1"
  line-data: "#007a4d"
  line-platform: "#ef7d00"
  line-operations: "#8a3d99"
  line-security: "#d3131c"
  line-team: "#8c6239"
typography:
  display:
    fontFamily: "Barlow Condensed, Noto Sans Devanagari, Barlow, system-ui, sans-serif"
    fontSize: "6rem"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Barlow Condensed, Noto Sans Devanagari, Barlow, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Barlow Condensed, Noto Sans Devanagari, Barlow, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.1
  station:
    fontFamily: "Barlow Condensed, Noto Sans Devanagari, Barlow, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.05
  body:
    fontFamily: "Barlow, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "17.5px"
    fontWeight: 400
    lineHeight: 1.7
    fontFeature: "\"tnum\""
  label:
    fontFamily: "Barlow, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1
  code:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.625
rounded:
  code: "3px"
  plate: "4px"
  bullet: "5px"
  figure: "6px"
  bullet-lg: "7px"
  interchange: "14px"
spacing:
  gutter: "16px"
  gutter-wide: "32px"
  container: "1200px"
  rail: "6px"
  map-row: "74px"
  section: "56px"
  section-wide: "80px"
components:
  button-primary:
    backgroundColor: "{colors.sign-navy}"
    textColor: "{colors.sign-white}"
    typography: "{typography.label}"
    rounded: "{rounded.plate}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sign-white}"
  button-plate:
    backgroundColor: "{colors.sign-white}"
    textColor: "{colors.sign-navy}"
    typography: "{typography.label}"
    rounded: "{rounded.plate}"
    padding: "12px 20px"
  button-plate-hover:
    backgroundColor: "{colors.board-yellow}"
    textColor: "{colors.board-ink}"
  button-secondary:
    backgroundColor: "{colors.map-ground}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.plate}"
    padding: "12px 20px"
  button-secondary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.map-ground}"
  line-bullet:
    backgroundColor: "{colors.line-runtime}"
    textColor: "{colors.sign-white}"
    rounded: "{rounded.bullet}"
    size: "24px"
  line-bullet-lg:
    backgroundColor: "{colors.line-runtime}"
    textColor: "{colors.sign-white}"
    rounded: "{rounded.bullet-lg}"
    size: "36px"
  station-sign:
    backgroundColor: "{colors.sign-navy}"
    textColor: "{colors.sign-white}"
    typography: "{typography.display}"
  departure-board:
    backgroundColor: "{colors.board-yellow}"
    textColor: "{colors.board-ink}"
  line-filter:
    backgroundColor: "{colors.board-yellow}"
    textColor: "{colors.board-ink}"
    rounded: "{rounded.plate}"
    height: "40px"
  line-filter-active:
    backgroundColor: "{colors.board-ink}"
    textColor: "{colors.board-yellow}"
  code-inline:
    backgroundColor: "{colors.map-panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "2px 6px"
---

# Design System: varij.dev

## Overview

**Creative North Star: "The Network Map"**

The platform's modernization, from a Java EE monolith to a multi-tenant SaaS platform, is drawn as a transit network. Six coloured lines (Runtime, Data, Platform, Operations, Security, Team) carry stations, each station a migration step and usually a post, and every line runs into one tall interchange marked "Today". The site borrows the whole vocabulary of a U-Bahn or DB network diagram: navy station signs name every page, line bullets mark which line a thing belongs to, station ticks and strip maps show sequence, and a yellow departure board lists the writing. Lines still being built are dashed and end in an open circle.

The ground is a white map with ink black type. Colour is spent almost entirely on data: the six line colours appear only where they identify a line, and the navy and yellow fields are structural bands, not accents. Density is that of a real wayfinding system: compact condensed signage over readable Barlow body text, flat planes, hard edges with small plate radii, and no ornament that does not mean something on the map. Motion is a single authored moment: pointing at a line on the map brings it forward and dims the others (opacity to 0.22, 200ms, cubic-bezier(0.16, 1, 0.3, 1)); everything is visible by default and reduced motion turns transitions off.

The world explicitly refuses the developer-blog default it replaced: a near-black console with a neon accent, a hero and a card grid.

**Key Characteristics:**
- Navy station-sign band (white Barlow Condensed) opens every page and closes it as the footer.
- Six saturated line colours, one per line, used as categorical data only.
- Line bullets: rounded squares in the line's colour carrying its letter (R, D, P, O, S, T).
- Rails 6px thick with square station ticks; the interchange is a white pill with a heavy ink outline.
- Dashed rails and open circles mean "still being built"; the interchange means "today".
- Yellow departure-board field is the one place lists of posts appear.
- Flat: no shadows, no gradients, no glass.

## Colors

A white map with ink type, two structural fields (navy signs, yellow board) and six categorical line colours. The `.dark` theme redraws the same map at night: ground #0a111c, panel #111b2b, ink #e9eef6, muted #9aa7bb, link #6cb4ff, sign #13366f, and the board becomes a black split-flap field (#050709) with amber type (#ffbf2e); line colours lift to brighter variants (runtime #3b93e0, data #1fb877, platform #ff9a2e, operations #b06cc2, security #f0484f, team #b98a5c) and bullets switch to dark letters.

### Primary
- **Station-Sign Navy** (sign-navy): the sign band behind every page masthead, the footer, the "VK" monogram plate and the primary button. It names places; it is never a tint or a card fill.
- **Sign White** (sign-white) and **Sign Haze** (sign-muted): type on the navy band. White for names and titles, haze for supporting lines, facts and secondary links.

### Secondary
- **Departure Yellow** (board-yellow): the departure-board field on Home and the full list on /blog, plus text selection. **Board Ink** (board-ink), **Board Umber** (board-muted) and the translucent **Board Rule** (board-rule) carry its type and row dividers. Hover on a white sign plate also turns it yellow, as if the plate were lit.

### Tertiary: the six lines
- **Runtime Blue** (line-runtime), **Data Green** (line-data), **Platform Orange** (line-platform), **Operations Violet** (line-operations), **Security Red** (line-security), **Team Brown** (line-team). Each colours its line's rails, ticks, bullet, strip maps, the post's list markers and table-of-contents strip, and its cover image. Platform Orange carries a dark letter (#1b1200) on its bullet for contrast; the others carry white.

### Neutral
- **Map White** (map-ground): page ground and the interior of interchange and future-station circles.
- **Platform Grey** (map-panel): inline code, blockquotes, quiet hover fills.
- **Hairline** (map-line) and **Side-Line Grey** (map-line-strong): row dividers, image borders, and the neutral rail of the side-projects branch line.
- **Ink** (ink) and **Ink Muted** (ink-muted): text, the interchange outline, the active-nav bar, the 2px rules over lists; muted for unvisited stations and metadata.
- **Link Blue** (link-blue): prose links and the 3px focus ring. Not a line colour; it never appears on the map.
- **Tunnel** (code-ground): code block ground in both themes.

### Named Rules
**The Line Colour Is Data Rule.** Each of the six line colours belongs to exactly one line and appears only where it identifies that line: rails, ticks, bullets, list markers, a post's strip map. Never use a line colour for decoration, emphasis, buttons or backgrounds, and never introduce a seventh hue on the map.

**The Sign Names the Page Rule.** Every page opens with a full-width navy sign band carrying its title in white Barlow Condensed; the footer closes on the same band. Navy is for naming, not for panels or cards inside content.

**The Departure Board Rule.** Lists of posts appear on the yellow (night: black and amber) departure board and nowhere else. Board rows read date, line bullet, title, minutes; filtering happens with line-bullet chips on the board itself.

## Typography

**Display Font:** Barlow Condensed 600/700 (with Noto Sans Devanagari, Barlow, system-ui)
**Body Font:** Barlow 400/500/600/700, italic 400 (with Noto Sans Devanagari, system-ui)
**Mono Font:** Geist Mono Variable (code only)

**Character:** Barlow Condensed is the signage voice, tall and narrow like station names on enamel plates; Barlow is its humanist body sibling, so signs and running text read as one system. Numerals are tabular site-wide. Hindi falls back to Noto Sans Devanagari in both roles.

### Hierarchy
- **Display** (Barlow Condensed 700, 3.5rem / 5rem / 6rem by breakpoint, line-height 0.98, -0.01em): the name or page title on a sign band. Inner pages use 3.25rem to 5rem; post titles 2.4rem to 3.75rem, max 22ch.
- **Headline** (Barlow Condensed 700, 28px mobile / 34px desktop, line-height 1): section headings in the map world ("The modernization, as a network", "Latest departures"). Prose h2 uses the same face at 30px.
- **Title** (Barlow Condensed 700, 20 to 24px): line names, career roles, project names, skill groups.
- **Station** (Barlow Condensed 600, 15px on the map, 16px on strip maps, line-height 1.05): station labels, board dates and minutes, nav links (18px), footer links.
- **Body** (Barlow 400, 17.5px, line-height 1.7 in posts; 16 to 18px elsewhere): post text capped by a 700px column; leads and descriptions held to 60 to 70ch.
- **Label** (Barlow 600, 15px): button text.
- **Code** (Geist Mono, 13px in blocks, 0.84em inline).

### Named Rules
**The Signage Face Rule.** Anything that names a place (a page, a line, a station, a section, a nav destination) is set in Barlow Condensed. Running text, descriptions and button labels are Barlow.

**The Mono Is Code Rule.** Geist Mono appears only in code. Dates, counts and metadata use condensed signage with tabular figures, never mono.

## Layout

A single 1200px container with a 16px gutter on phones and 32px from 640px up. Pages stack full-bleed bands: navy sign, white map content, yellow board, white close, navy footer. Section rhythm is 56px vertical on phones and 64 to 80px on desktop. The sticky header is 60px, white, with a hairline bottom border.

The network map is a CSS grid: a 132px line-name column, one equal column per station position, a 44px interchange column and a 170px column for stations still being built. Rows are 74px; every line's stations are right-aligned so all six rails run into the interchange. Below 768px the map becomes a two-column grid of vertical strip maps, one per line, like the maps above train doors. Posts use a 700px reading column with a sticky table-of-contents strip map in the right column from 1024px; below that the contents collapse into a disclosure above the post. Nothing scrolls horizontally at 320px; long German compounds hyphenate and break.

## Elevation & Depth

Completely flat. There are no shadows anywhere. Depth comes from the order of planes: the navy sign and yellow board are full-width fields, and the interchange pill sits on a layer above the rails, its white fill cutting through them. Focus is a 3px Link Blue outline at 2px offset.

### Named Rules
**The Printed Map Rule.** Surfaces are printed, not lifted. No box-shadow, no glow, no blur, no gradients. The only gradient-built mark is the dashed rail of a station still being built (a repeating hard-stop gradient, 10px dash, 6px gap on the map; 8px/5px vertical on strip maps).

## Shapes

Hard geometry with small, consistent plate radii. Rails are 6px straight bars (5px on the table of contents) with square ends; station ticks are 6 by 9px square stubs on the map and short horizontal stubs on strip maps. The terminal end of a rail is lightly rounded (3px). Buttons, chips and stop links are 4px plates; line bullets are 5px (24px square) or 7px (36px square) rounded squares; code is 3px; figures and blockquotes 6px.

Circles carry meaning: a white circle with a 4px ink ring marks the interchange ("Today") and the "you are here" station; a white circle with a 3px line-coloured ring marks a station still being built. The desktop interchange is a 28px-wide pill (14px radius) spanning all six rows. The site's one arrow (square line caps, mitred joins, 3px stroke) is the only directional mark.

### Named Rules
**The Interchange Is Today Rule.** The ink-ringed white circle or pill means the present: the multi-tenant SaaS platform, or the reader's current station. Use it for nothing else.

**The Dashed Is Unbuilt Rule.** A dashed rail ending in an open circle means a station still under construction. Solid rails are built history. Never dash a line for style.

## Components

### Buttons
Sign plates: flat, square-ish, condensed in spirit but set in Barlow 600.
- **Shape:** 4px plate radius, 12px by 20px padding, 10px gap to the arrow.
- **Primary:** navy plate with white label on white ground; hover turns it ink. In dark mode it inverts to a white plate that lights yellow on hover.
- **Plate:** white plate with navy label, used on navy signs (the LinkedIn call to action, footer); hover lights it yellow with board ink.
- **Secondary:** 2px ink outline, ink label; hover fills ink with white label. On a navy sign the outline variant uses a 2px white border at 60% that goes solid on hover.
- **Arrow:** calls to action that leave or advance carry the one SVG arrow, never a text glyph.

### Chips (line filters)
- **Style:** on the yellow board, 40px tall 4px plates with a 2px board-ink border at 25%, a line bullet and the line name in Barlow Condensed 700 17px.
- **State:** hover makes the border solid; pressed fills board ink with yellow type. "All lines" carries no bullet.

### Cards / Containers
There are no cards. Lists are ruled: a 2px ink rule on top, 1px hairlines between rows. The only bordered boxes are the previous/next stop links at the foot of a post (2px hairline border, 4px radius, 16px padding, border turns ink on hover).

### Navigation
- **Header:** white, sticky, 60px. A navy "VK" bullet plate and the name in Barlow Condensed 700 21px on the left; links in Barlow Condensed 600 18px, muted until hover. The current page is marked like a platform indicator: a 4px ink bar under its name.
- **Mobile:** a hamburger with square caps opens a stacked list of 20px condensed links with hairline dividers and the language switcher.
- **Footer:** the navy sign band again, name at 34px, haze links, white LinkedIn plate.

### Line Bullet (signature)
A rounded square in the line's colour carrying its letter in Barlow Condensed 700 (15px in the 24px bullet, 22px in the 36px bullet). It is the line's identity wherever the line is referenced: the map, the board, post signs, filters, the About lines list, cover images.

### Network Map (signature)
Six horizontal rails converge on a tall white interchange pill labelled "Today / Multi-tenant SaaS". Stations with a post are ink links; stations without one are muted. Hovering or focusing any part of a line dims the other five to 0.22 opacity over 200ms.

### Strip Map (signature)
A vertical rail with ticks: used for the phone map, the post's line navigation ("Previous station / Next station", ending at the interchange), the table of contents (current section marked with the ink ring), and the side-projects branch line in neutral grey.

### Departure Board (signature)
The yellow field with a 3px board-ink rule under its column heads (date, line, post, read) and translucent rules between rows. Desktop columns are 7.5rem date, 3rem bullet, flexible title (Barlow 600 18px), 5.5rem minutes; on phones the bullet leads and date and minutes sit under the title.

### Post Sign and Covers
A post opens on a navy sign: a back link to Writing with the arrow, the post's line bullet with its line and station name, the title at display scale, the description in haze, and date and reading time. Cover images (1200 by 630) and diagrams are drawn in the same world: title on navy with the post's line drawn underneath and its station marked, in Barlow and Barlow Condensed.

## Do's and Don'ts

### Do:
- **Do** open every page with the navy sign band and its title in white Barlow Condensed 700.
- **Do** give each line exactly one colour and use it for that line's rails, ticks, bullet, markers and cover, nothing else.
- **Do** list posts only on the departure board, with date, line bullet, title and minutes.
- **Do** mark the present with the ink-ringed white interchange and unbuilt work with a dashed rail ending in an open circle.
- **Do** use the one SVG arrow for direction and calls to action.
- **Do** keep rails 6px, plates 4px and bullets 5px or 7px.
- **Do** keep content visible by default; the only motion is the 200ms line highlight, off under reduced motion.

### Don't:
- **Don't** use shadows, glows or gradients; the only gradient is the dashed under-construction rail.
- **Don't** use a line colour as decoration, an accent, a button fill or a section background.
- **Don't** put eyebrow or kicker labels above headings.
- **Don't** put coloured side borders on cards or panels, and don't build card grids.
- **Don't** use text arrow glyphs; use the SVG arrow.
- **Don't** set anything but code in mono.
- **Don't** dash a rail or draw an interchange circle for style; both carry meaning.
- **Don't** return to the near-black console with a neon accent, or a hero plus card grid.
