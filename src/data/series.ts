// Post series. A post joins one by setting `series: <id>` in its front matter;
// parts are ordered by date.
export const series = {
  "monolith-to-saas": {
    title: "From monolith to multi-tenant SaaS",
    description:
      "How we moved an enterprise Java EE platform, one migration at a time, from GlassFish and Oracle to Quarkus services on a shared Kubernetes platform.",
  },
} as const;

export type SeriesId = keyof typeof series;
