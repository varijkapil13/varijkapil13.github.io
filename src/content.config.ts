import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { series } from "./data/series";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date(),
    tags: z.array(z.string()).optional().default([]),
    image: z.string().optional(),
    draft: z.boolean().optional().default(false),
    series: z.enum(Object.keys(series) as [keyof typeof series]).optional(),
  }),
});

export const collections = { blog };
