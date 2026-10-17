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

THESIS: The modernization is a transit network. Every migration is a station on one of six coloured lines (Runtime, Data, Platform, Operations, Security, Team) that run into one interchange, today's multi-tenant SaaS platform; lines still being built are dashed. Refuses the category default: a near-black console with a neon accent, hero plus card grid.

OWN-WORLD: White map ground, ink black type, six saturated line colours used as categorical data; navy station-sign bands (white Barlow Condensed) for mastheads; a yellow departure-board field for the writing list. Line bullets (rounded squares with a letter), station ticks, white interchange pills with black outline, dashed under-construction segments. Barlow body, Barlow Condensed signage. No shadows, no gradients.

STORY: Visitors learn who he is (sign), see the whole modernization at a glance (map), pick a station to read (post), and contact him on LinkedIn.

FIRST VIEWPORT: Full-width navy sign: name in white condensed at display scale, role and team scope below, LinkedIn as a white sign button with arrow, right-aligned. Directly beneath, the network map fills the container width: six horizontal lines with labelled stations converging on a tall interchange marked "Today". On phones the map becomes stacked strip maps per line.

FORM: Transit line map (U-Bahn / DB network diagram), position 1 on my ordered list (chosen by the user as IMPECCABLE'S PICK over assigned index 5). seed:90e7552925ed1a6d

Signature interaction: hovering or focusing a line on the map (any of its stations or its name) brings that line forward and dims the others. Motion grammar: one authored moment, the hovered line's highlight easing out (200ms); content always visible by default; respects reduced motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
