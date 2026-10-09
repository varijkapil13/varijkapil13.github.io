import { getCollection, type CollectionEntry } from "astro:content";
import type { SeriesId } from "../data/series";

// Published posts in a series, oldest first
export async function getSeriesPosts(id: SeriesId): Promise<CollectionEntry<"blog">[]> {
  const posts = await getCollection("blog", ({ data }) => !data.draft && data.series === id);
  return posts.sort((a, b) => a.data.date.getTime() - b.data.date.getTime());
}
