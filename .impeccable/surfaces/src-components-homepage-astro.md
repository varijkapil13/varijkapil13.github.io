---
version: 1
slug: "src-components-homepage-astro"
primary_target: "src/components/HomePage.astro"
related_targets: ["src/pages/blog/index.astro","src/pages/blog/[...slug].astro","src/components/AboutPage.astro"]
---

# Surface brief: varij.dev (whole site)

Scope: site-wide redesign. Home is Persuade; blog index, posts and series page are Read; About and Projects are Persuade/Read hybrids inside the same world.

Audience: fellow engineers (arrive on a post) and recruiters (arrive on Home/About, often on a phone). Action: reach out on LinkedIn; be remembered as the person who took a Java EE monolith to multi-tenant SaaS. First view on Home: who he is and his role. Avoid: generic dev-blog template; flashy or gimmicky motion.

Constraints: LinkedIn is the only contact; no employer-internal details; EN/DE/HI for Home, About, Projects; no horizontal scroll at 320px.

## Direction contract

THESIS: The modernization is a transit network. Every migration is a station on one of six coloured lines (Runtime, Data, Platform, Operations, Security, Team) that run into one interchange, today's multi-tenant SaaS platform; every line ends there, and the map shows only what was done, never plans. Refuses the category default: a near-black console with a neon accent, hero plus card grid.

OWN-WORLD: Rendered in the register of Linear and Vercel (user's reference after the first rendition read as outdated): dark-first near-black ground (light theme supported), hairline borders, quiet bordered panels, Geist and Geist Mono, a faint light from above each masthead and a dot grid under the map. The six line colours are the only saturated colour on a page and stay categorical data. Thin 3px rails, small station dots (filled when the station has a post, open when not), a hairline interchange pill where every line ends. No heavy colour bands, no shadows except a soft focus/hover ring on station dots.

STORY: Visitors learn who he is (sign), see the whole modernization at a glance (map), pick a station to read (post), and contact him on LinkedIn.

FIRST VIEWPORT: Name in Geist semibold at display scale, role in muted below, one-line lead, a small fact row, then the primary LinkedIn button and a secondary "Read the writing" button. Directly beneath, the network map in a bordered panel on a dot grid: six lines with labelled stations converging on the "Today" interchange. On phones the map becomes stacked strip maps per line.

FORM: Transit line map (U-Bahn / DB network diagram), position 1 on my ordered list (chosen by the user as IMPECCABLE'S PICK over assigned index 5). seed:90e7552925ed1a6d

Signature interaction: hovering or focusing a line on the map (any of its stations or its name) brings that line forward and dims the others. Motion grammar: one authored moment, the hovered line's highlight easing out (200ms); content always visible by default; respects reduced motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
