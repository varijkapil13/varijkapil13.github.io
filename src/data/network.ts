// The site's map: the platform's modernization drawn as transit lines.
// Each line is one part of the platform; each station is a step on it,
// usually a post. All lines run into one interchange, today's platform.
// Stations in `future` are still being built (drawn dashed).
import network from "./network.json";

export type Lang = "en" | "de" | "hi";
type Text = string | Partial<Record<Lang, string>>;

export interface Station {
  label: Text;
  post?: string;
}

export interface Line {
  id: string;
  code: string;
  name: Record<Lang, string>;
  stations: Station[];
  future: Station[];
}

export const lines = network.lines as Line[];
export const hubName = network.hub as Record<Lang, string>;

// Longest line, in stations before the interchange; the map has this many columns
export const mapColumns = Math.max(...lines.map((l) => l.stations.length));

export const text = (value: Text, lang: Lang = "en") =>
  typeof value === "string" ? value : value[lang] ?? value.en ?? "";

// The line and station a post sits on
export function findStation(postId: string) {
  for (const line of lines) {
    const index = line.stations.findIndex((s) => s.post === postId);
    if (index >= 0) return { line, index, station: line.stations[index] };
  }
  return undefined;
}
