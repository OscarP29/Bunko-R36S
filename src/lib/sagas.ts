/** Agrupación de juegos por saga y orden del catálogo. Funciones puras. */

/** Saga elegida a mano por archivo de juego. `""` significa «sin saga». */
export type SagaOverrides = Record<string, string>;

/** Sagas por carpeta de sistema, tal como se guardan en la tarjeta. */
export type SagaStore = Record<string, SagaOverrides>;

export type OrganizeMode = "alpha" | "saga";

type Titled = { fileName: string; title: string };

export type GameGroup<T extends Titled> = {
  /** Nombre de la saga, o `null` para un juego suelto. */
  saga: string | null;
  games: T[];
};

/**
 * Sagas conocidas. La clave es una expresión sobre el título normalizado
 * (minúsculas, sin acentos ni signos); el valor, el nombre que se muestra.
 */
const KNOWN_SAGAS: [RegExp, string][] = [
  [/\bpokemon\b/, "Pokémon"],
  [/\bzelda\b/, "The Legend of Zelda"],
  [/\bmario kart\b/, "Mario Kart"],
  [/\bmario party\b/, "Mario Party"],
  [/\b(super )?mario\b/, "Mario"],
  [/\bwario\b/, "Wario"],
  [/\byoshi\b/, "Yoshi"],
  [/\bdonkey kong\b/, "Donkey Kong"],
  [/\bkirby\b/, "Kirby"],
  [/\bmetroid\b/, "Metroid"],
  [/\bfire emblem\b/, "Fire Emblem"],
  [/\bgolden sun\b/, "Golden Sun"],
  [/\badvance wars\b/, "Advance Wars"],
  [/\bfinal fantasy\b/, "Final Fantasy"],
  [/\bdragon quest\b/, "Dragon Quest"],
  [/\bkingdom hearts\b/, "Kingdom Hearts"],
  [/\bmega ?man\b|\brockman\b/, "Mega Man"],
  [/\bcastlevania\b|\bakumajou\b/, "Castlevania"],
  [/\bsonic\b/, "Sonic"],
  [/\bstreet fighter\b/, "Street Fighter"],
  [/\bmortal kombat\b/, "Mortal Kombat"],
  [/\bking of fighters\b/, "The King of Fighters"],
  [/\bmetal slug\b/, "Metal Slug"],
  [/\bcontra\b/, "Contra"],
  [/\bdragon ball\b/, "Dragon Ball"],
  [/\bnaruto\b/, "Naruto"],
  [/\byu gi oh\b/, "Yu-Gi-Oh!"],
  [/\bdigimon\b/, "Digimon"],
  [/\bcrash bandicoot\b/, "Crash Bandicoot"],
  [/\bspyro\b/, "Spyro"],
  [/\bharry potter\b/, "Harry Potter"],
  [/\blego\b/, "LEGO"],
  [/\btony hawk\b/, "Tony Hawk's"],
  [/\bfifa\b/, "FIFA"],
  [/\bbomberman\b/, "Bomberman"],
  [/\btetris\b/, "Tetris"],
  [/\bpac man\b/, "Pac-Man"],
  [/\bmetal gear\b/, "Metal Gear"],
  [/\bresident evil\b|\bbiohazard\b/, "Resident Evil"],
  [/\bspider man\b/, "Spider-Man"],
  [/\bbatman\b/, "Batman"],
  [/\bstar wars\b/, "Star Wars"],
  [/\bteenage mutant\b|\btmnt\b/, "Tortugas Ninja"],
  [/\bninja gaiden\b/, "Ninja Gaiden"],
  [/\bdouble dragon\b/, "Double Dragon"],
  [/\bfinal fight\b/, "Final Fight"],
  [/\bgradius\b/, "Gradius"],
  [/\bmetroid\b/, "Metroid"],
  [/\bharvest moon\b|\bbokujou monogatari\b/, "Harvest Moon"],
  [/\bphantasy star\b/, "Phantasy Star"],
  [/\bshining force\b/, "Shining Force"],
  [/\bstreets of rage\b|\bbare knuckle\b/, "Streets of Rage"],
  [/\bcrash\b/, "Crash Bandicoot"],
];

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[([][^)\]]*[)\]]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Saga probable a partir del título, o `null` si no se reconoce ninguna. */
export function autoSaga(title: string): string | null {
  const key = normalize(title);
  for (const [pattern, saga] of KNOWN_SAGAS) {
    if (pattern.test(key)) return saga;
  }
  // «Saga: subtítulo» o «Saga - subtítulo»
  const prefix = title.split(/\s*(?::|\s-\s)\s*/)[0]?.trim();
  return prefix && prefix !== title.trim() ? prefix : null;
}

/** Saga efectiva de un juego: la elegida a mano o, si no hay, la automática. */
export function sagaOf(game: Titled, overrides: SagaOverrides): string | null {
  const manual = overrides[game.fileName];
  if (manual !== undefined) return manual.trim() || null;
  return autoSaga(game.title);
}

const compare = (a: string, b: string) =>
  a.localeCompare(b, "es", { sensitivity: "base", numeric: true });

const byTitle = <T extends Titled>(a: T, b: T) =>
  compare(a.title, b.title) || compare(a.fileName, b.fileName);

/**
 * Agrupa y ordena los juegos. En modo `saga`, una saga necesita al menos dos
 * juegos (o una elección manual) para formar grupo; el resto queda suelto y
 * se intercala por título con los grupos.
 */
export function organizeGames<T extends Titled>(
  games: T[],
  mode: OrganizeMode,
  overrides: SagaOverrides = {},
): GameGroup<T>[] {
  const sorted = [...games].sort(byTitle);
  if (mode === "alpha") return sorted.map((game) => ({ saga: null, games: [game] }));

  const sagas = new Map<string, { name: string; games: T[]; manual: boolean }>();
  for (const game of sorted) {
    const name = sagaOf(game, overrides);
    if (!name) continue;
    const key = normalize(name);
    const group = sagas.get(key) ?? { name, games: [], manual: false };
    group.games.push(game);
    group.manual ||= Boolean(overrides[game.fileName]?.trim());
    sagas.set(key, group);
  }

  const grouped = new Set<T>();
  const groups: GameGroup<T>[] = [];
  for (const group of sagas.values()) {
    if (group.games.length < 2 && !group.manual) continue;
    group.games.forEach((game) => grouped.add(game));
    groups.push({ saga: group.name, games: group.games });
  }
  for (const game of sorted) {
    if (!grouped.has(game)) groups.push({ saga: null, games: [game] });
  }
  return groups.sort((a, b) =>
    compare(a.saga ?? a.games[0].title, b.saga ?? b.games[0].title),
  );
}

/** Orden plano de archivos para escribir en `filelist.csv`. */
export const flattenOrder = <T extends Titled>(groups: GameGroup<T>[]) =>
  groups.flatMap((group) => group.games.map((game) => game.fileName));

/** Lee el JSON de sagas guardado en la tarjeta; ignora contenido inválido. */
export function parseSagaStore(content: string): SagaStore {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const store: SagaStore = {};
    for (const [system, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      store[system] = Object.fromEntries(
        Object.entries(value).filter(([, saga]) => typeof saga === "string"),
      ) as SagaOverrides;
    }
    return store;
  } catch {
    return {};
  }
}
