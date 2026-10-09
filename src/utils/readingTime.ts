// Rough reading time in minutes. Code blocks count too, since readers skim them.
export function readingTime(markdown: string, wordsPerMinute = 220): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / wordsPerMinute));
}
