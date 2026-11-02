import {
  ARTWORK_TTL,
  findArtworkMatches,
  githubRepoName,
  parseGithubTree,
  parseLibretroListing,
  preferSavedChoice,
  type ArtworkFallback,
  type ArtworkTarget,
} from "./artwork.ts";
import { webFetch } from "./http.ts";
import {
  cleanRomName,
  guessLibretroSystem,
  makeArtworkUrl,
  systemFolder,
} from "./rom.ts";
import {
  readCachedJson,
  readLocalJson,
  writeCachedJson,
  writeLocalJson,
} from "./store.ts";
import type {
  ArtworkEntry,
  ArtworkIndex,
  ArtworkMatch,
  System,
} from "./types.ts";

const ARTWORK_CACHE_PREFIX = "r36s-artwork-index:";
const ARTWORK_CHOICE_PREFIX = "r36s-artwork-choice:";

export type ArtworkFile = { blob: Blob; bytes: number[] };

export const libretroSystemOf = (system: System) =>
  guessLibretroSystem(systemFolder(system));

const choiceKey = (libretroSystem: string, fileName: string) =>
  `${ARTWORK_CHOICE_PREFIX}${libretroSystem}:${cleanRomName(fileName)}`;

export const saveArtworkChoice = (
  libretroSystem: string,
  fileName: string,
  match: ArtworkMatch,
) => writeLocalJson(choiceKey(libretroSystem, fileName), match);

/** Índice de carátulas de un sistema: caché, GitHub y, si llega truncado, el listado público. */
export async function loadArtworkIndex(
  libretroSystem: string,
  onWarning: (message: string) => void,
): Promise<ArtworkEntry[]> {
  const cacheKey = ARTWORK_CACHE_PREFIX + libretroSystem;
  const cached = await readCachedJson<ArtworkIndex>(cacheKey);
  if (
    cached &&
    Date.now() - cached.savedAt < ARTWORK_TTL &&
    Array.isArray(cached.files)
  ) {
    return cached.files;
  }

  const repo = githubRepoName(libretroSystem);
  const response = await webFetch(
    `https://api.github.com/repos/libretro-thumbnails/${encodeURIComponent(repo)}/git/trees/master?recursive=1`,
    { headers: { Accept: "application/vnd.github+json" } },
  );
  if (!response.ok) {
    throw new Error(
      `GitHub respondió ${response.status} al cargar el índice de ${libretroSystem}.`,
    );
  }
  const tree = (await response.json()) as {
    truncated?: boolean;
    tree?: { path: string; type: string }[];
  };

  if (tree.truncated) {
    onWarning(
      `GitHub devolvió un índice truncado para ${libretroSystem}. Probé el listado público del servidor de thumbnails como alternativa.`,
    );
    const fallback = await webFetch(
      `https://thumbnails.libretro.com/${encodeURIComponent(libretroSystem)}/Named_Boxarts/`,
    );
    if (!fallback.ok) {
      throw new Error(
        "El índice de GitHub llegó truncado y el servidor de thumbnails no ofreció un listado alternativo. Puedes probar una búsqueda exacta.",
      );
    }
    const files = parseLibretroListing(await fallback.text(), "Named_Boxarts");
    if (!files.length)
      throw new Error(
        "La alternativa pública no devolvió nombres de carátulas.",
      );
    await writeCachedJson(cacheKey, {
      savedAt: Date.now(),
      files,
    } satisfies ArtworkIndex);
    return files;
  }

  const files = parseGithubTree(tree.tree ?? []);
  if (!files.length) {
    throw new Error(
      `No encontré Named_Boxarts en el repositorio ${repo}. Revisa el nombre del sistema.`,
    );
  }
  await writeCachedJson(cacheKey, {
    savedAt: Date.now(),
    files,
  } satisfies ArtworkIndex);
  return files;
}

async function loadCategoryFallbacks(
  libretroSystem: string,
): Promise<ArtworkFallback[]> {
  const result: ArtworkFallback[] = [];
  for (const category of ["Named_Titles", "Named_Snaps"] as const) {
    try {
      const response = await webFetch(
        `https://thumbnails.libretro.com/${encodeURIComponent(libretroSystem)}/${category}/`,
      );
      if (!response.ok) continue;
      const entries = parseLibretroListing(await response.text(), category);
      if (entries.length) result.push({ category, entries });
    } catch {
      // fallback no disponible para este sistema
    }
  }
  return result;
}

/** Coincidencias para un juego, con la elección guardada del usuario en primer lugar. */
export async function searchArtworkMatches(
  libretroSystem: string,
  files: ArtworkEntry[],
  queries: string[],
  fileName: string,
): Promise<ArtworkMatch[]> {
  const { matches, searchFiles } = await findArtworkMatches(files, queries, () =>
    loadCategoryFallbacks(libretroSystem),
  );
  return preferSavedChoice(
    matches,
    searchFiles,
    readLocalJson<ArtworkMatch>(choiceKey(libretroSystem, fileName)),
  );
}

async function readArtworkFile(response: Response): Promise<ArtworkFile> {
  const blob = await response.blob();
  return { blob, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
}

export async function fetchArtwork(
  libretroSystem: string,
  { category, name }: ArtworkTarget,
): Promise<ArtworkFile> {
  const response = await webFetch(makeArtworkUrl(libretroSystem, category, name));
  if (!response.ok)
    throw new Error(`No se pudo descargar ${name} (${response.status}).`);
  return readArtworkFile(response);
}

/** Primera imagen que exista entre `targets`, o `null` si ninguna responde. */
export async function fetchFirstArtwork(
  libretroSystem: string,
  targets: Iterable<ArtworkTarget>,
): Promise<ArtworkFile | null> {
  for (const { category, name } of targets) {
    const response = await webFetch(
      makeArtworkUrl(libretroSystem, category, name),
    );
    if (response.ok) return readArtworkFile(response);
  }
  return null;
}
