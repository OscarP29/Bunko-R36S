import Fuse from "fuse.js";
import type { ArtworkEntry, ArtworkMatch } from "./types.ts";
import { cleanRomName, regionRank } from "./rom.ts";

export const ARTWORK_CATEGORIES = ["Named_Boxarts", "Named_Titles", "Named_Snaps"] as const;
export type ArtworkCategory = (typeof ARTWORK_CATEGORIES)[number];

export const ARTWORK_TTL = 7 * 24 * 60 * 60 * 1000;
export const FUZZY_THRESHOLD = 0.34;

/** Umbral para elegir automáticamente una carátula en la búsqueda individual. */
const AUTO_SCORE = 0.12;
const AUTO_GAP = 0.09;
/** Umbral (más estricto) para la búsqueda masiva de faltantes. */
const BATCH_SCORE = 0.18;
const BATCH_GAP = 0.08;

export const isArtworkCategory = (value: string): value is ArtworkCategory =>
  (ARTWORK_CATEGORIES as readonly string[]).includes(value);

/** `Nintendo - Game Boy Advance` → `Nintendo___Game_Boy_Advance` (nombre del repo). */
export const githubRepoName = (libretroSystem: string) =>
  libretroSystem.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export const categoryOfPath = (path: string): ArtworkCategory =>
  ARTWORK_CATEGORIES.find((category) => path.split("/").includes(category)) ?? "Named_Boxarts";

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const entryFor = (category: ArtworkCategory, fileName: string): ArtworkEntry => {
  const name = fileName.split("/").pop()!.replace(/\.png$/i, "");
  return { name, path: `${category}/${name}.png` };
};

/** Extrae las carátulas de las tres categorías del árbol recursivo de GitHub. */
export function parseGithubTree(tree: { path: string; type: string }[]): ArtworkEntry[] {
  const entries: ArtworkEntry[] = [];
  for (const item of tree) {
    if (item.type !== "blob" || !/\.png$/i.test(item.path)) continue;
    const category = ARTWORK_CATEGORIES.find((candidate) =>
      new RegExp(`(?:^|/)${candidate}/`, "i").test(item.path),
    );
    if (category) entries.push(entryFor(category, item.path));
  }
  return entries;
}

/** Extrae los nombres de un listado HTML de `thumbnails.libretro.com`. */
export function parseLibretroListing(html: string, category: ArtworkCategory): ArtworkEntry[] {
  return Array.from(html.matchAll(/href=["']([^"']+\.png)["']/gi), (match) =>
    entryFor(category, safeDecode(match[1])),
  );
}

/** Búsqueda difusa de carátulas: primero por región, luego por puntuación. */
export function rankArtworkMatches(files: ArtworkEntry[], query: string): ArtworkMatch[] {
  const fuse = new Fuse(files, {
    keys: ["name"],
    includeScore: true,
    threshold: FUZZY_THRESHOLD,
    ignoreLocation: true,
    minMatchCharLength: 3,
    getFn: (entry) => cleanRomName(entry.name),
  });
  return fuse
    .search(cleanRomName(query))
    .filter((match) => (match.score ?? 1) <= FUZZY_THRESHOLD)
    .map((match) => ({ ...match.item, score: match.score ?? 1 }))
    .sort((a, b) => regionRank(a.name) - regionRank(b.name) || a.score - b.score)
    .slice(0, 8);
}

/**
 * Decide si una lista de coincidencias es lo bastante clara como para usarla sin
 * preguntar al usuario.
 */
export function pickAutomaticMatch(matches: ArtworkMatch[]): ArtworkMatch | null {
  const [first, second] = matches;
  if (!first) return null;
  if (matches.length === 1) return first;
  const gap = (second?.score ?? 1) - first.score;
  return first.score < AUTO_SCORE && gap > AUTO_GAP ? first : null;
}

/** Igual que `pickAutomaticMatch`, con un umbral más estricto para procesos masivos. */
export function pickConfidentMatch(matches: ArtworkMatch[]): ArtworkMatch | null {
  const [first, second] = matches;
  if (!first) return null;
  const gap = (second?.score ?? 1) - first.score;
  return first.score < BATCH_SCORE && gap > BATCH_GAP ? first : null;
}

/** Deduplica coincidencias manteniendo el orden (la primera puntuación manda). */
export function dedupeMatches(matches: ArtworkMatch[]): ArtworkMatch[] {
  const seen = new Set<string>();
  return matches.filter((match) => {
    if (seen.has(match.path)) return false;
    seen.add(match.path);
    return true;
  });
}
