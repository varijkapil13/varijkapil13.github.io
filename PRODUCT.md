# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Fellow engineers.** Backend developers, architects and tech leads who arrive on a post from search or LinkedIn, usually mid-problem (a migration, a pooling bug, a Kubernetes tenancy question), and read it for the lessons.
- **Recruiters and hiring managers.** People sizing Varij up for a senior engineering leadership role. They scan experience, scope (team size, what was led) and skills quickly, often on a phone, often in German or English.

## Product Purpose

varij.dev is the personal site of Varij Kapil, Head of Backend Software Engineering, based in Germany. It holds long-form engineering writing, an About/CV page, and a short list of side projects.

Success means the visitor:
1. **Remembers him** as the person who took an enterprise Java EE monolith to a multi-tenant SaaS platform, and
2. **Reaches out on LinkedIn**, the only contact channel.

## Positioning

A first-hand, multi-year record of one platform's modernization, told by the person who led it: GlassFish → Payara → WildFly → Quarkus, Oracle → PostgreSQL, VM-per-customer → shared Kubernetes, manual pipelines → GitOps, individual contributors → Team Topologies. The "monolith to SaaS" series is the spine; other engineers' blogs can copy topics, not this sequence of lived decisions.

## Operating Context

- Readers come from LinkedIn shares and search, land directly on a post, and may never see the home page.
- Recruiters land on Home or About and decide within a minute.
- Home, About and Projects exist in English, German and Hindi (`/`, `/de/`, `/hi/`). Blog posts are English only.
- Content: 18 posts in `src/content/blog/`, a 7-part series defined in `src/data/series.ts`, CV data in `src/data/about.ts`, skills in `src/data/skills.ts`, RSS at `/rss.xml`.

## Capabilities and Constraints

- Astro 7 static site, Tailwind CSS v4, deployed by Cloudflare Workers Builds from `master` (Node 22).
- Posts are Markdown content collections; features include table of contents, code copy buttons, heading anchors, series navigation, tag filters, generated cover images (`scripts/generate-covers.mjs`).
- Contact is LinkedIn only. No email, Twitter/X, GitHub or other channels are shown.
- Posts must not include employer-internal or commercially sensitive details (company names in narrative, customers, trade details).

## Brand Commitments

- Name: Varij Kapil. Domain: varij.dev. "VK" monogram exists but is not a binding asset.
- Voice: first person, plain, story-led; explains background before conclusions; no hype.
- Nothing visual is fixed; the user explicitly opened layout, look, languages and series presentation to change.

## Evidence on Hand

- Real: the CV (roles, periods, team of ~15, migration highlights), the 18 posts and their diagrams in `public/images/blog/`, side projects listed in `src/pages/projects.astro`.
- Absent, never to be fabricated: testimonials, client logos, employer branding, metrics not stated in the posts, photos of Varij (none in the repo).
- Some numbers in posts (startup times, benchmark tables, defect percentages) are pending the author's verification; do not promote them to headline claims.

## Product Principles

1. The writing is the proof; the site's shell exists to get people into a post and through it.
2. The modernization sequence is the memorable thing; make it legible at a glance.
3. One clear next step: LinkedIn.
4. Readable everywhere: long code-heavy posts must work on a 320px phone without horizontal scroll.
5. Plain, honest claims; nothing the posts themselves do not support.

## Accessibility & Inclusion

Multilingual (EN/DE/HI, including Devanagari). Long-form reading with code: contrast, line length and code legibility matter. No product-specific standard was set beyond WCAG AA as a baseline.
