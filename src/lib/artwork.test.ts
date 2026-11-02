import { test } from "node:test";
import assert from "node:assert/strict";
import {
  categoryOfPath,
  dedupeMatches,
  exactArtworkTargets,
  findArtworkMatches,
  githubRepoName,
  parseGithubTree,
  parseLibretroListing,
  pickAutomaticMatch,
  pickBatchMatch,
  pickConfidentMatch,
  preferSavedChoice,
  rankArtworkMatches,
  uniqueQueries,
} from "./artwork.ts";
import type { ArtworkEntry, ArtworkMatch } from "./types.ts";

const match = (name: string, score: number): ArtworkMatch => ({
  name,
  path: `Named_Boxarts/${name}.png`,
  score,
});

test("githubRepoName convierte el nombre de consola en nombre de repositorio", () => {
  assert.equal(githubRepoName("Nintendo - Game Boy Advance"), "Nintendo_Game_Boy_Advance");
  assert.equal(githubRepoName("FB Neo - Arcade Games"), "FB_Neo_Arcade_Games");
});

test("parseGithubTree solo conserva PNG de las categorías de carátulas", () => {
  const tree = [
    { path: "Named_Boxarts/Sonic (USA).png", type: "blob" },
    { path: "Named_Titles/Sonic (USA).png", type: "blob" },
    { path: "Named_Snaps/Sonic (USA).png", type: "blob" },
    { path: "Named_Boxarts/Sonic (USA).jpg", type: "blob" },
    { path: "Support/readme.md", type: "blob" },
    { path: "Named_Boxarts", type: "tree" },
  ];
  const entries = parseGithubTree(tree);
  assert.deepEqual(
    entries.map((entry) => entry.path),
    [
      "Named_Boxarts/Sonic (USA).png",
      "Named_Titles/Sonic (USA).png",
      "Named_Snaps/Sonic (USA).png",
    ],
  );
});

test("parseLibretroListing lee enlaces y decodifica el nombre", () => {
  const html = `<a href="Sonic%20(Spain).png">Sonic (Spain).png</a>
    <a href="../">..</a>
    <a href="Sonic%20(USA).png">Sonic (USA).png</a>`;
  const entries = parseLibretroListing(html, "Named_Boxarts");
  assert.deepEqual(entries, [
    { name: "Sonic (Spain)", path: "Named_Boxarts/Sonic (Spain).png" },
    { name: "Sonic (USA)", path: "Named_Boxarts/Sonic (USA).png" },
  ]);
});

test("categoryOfPath detecta la categoría de una ruta", () => {
  assert.equal(categoryOfPath("Named_Titles/Algo.png"), "Named_Titles");
  assert.equal(categoryOfPath("ruta/sin/categoria.png"), "Named_Boxarts");
});

test("rankArtworkMatches ordena por región y descarta resultados lejanos", () => {
  const files: ArtworkEntry[] = [
    { name: "Sonic the Hedgehog (USA)", path: "Named_Boxarts/Sonic the Hedgehog (USA).png" },
    { name: "Sonic the Hedgehog (Spain)", path: "Named_Boxarts/Sonic the Hedgehog (Spain).png" },
    { name: "Zelda II (USA)", path: "Named_Boxarts/Zelda II (USA).png" },
  ];
  const matches = rankArtworkMatches(files, "Sonic the Hedgehog");
  assert.ok(matches.length >= 2);
  assert.equal(matches[0].name, "Sonic the Hedgehog (Spain)");
  assert.ok(matches.every((entry) => entry.name.includes("Sonic")));
});

test("rankArtworkMatches devuelve como máximo 8 coincidencias", () => {
  const files: ArtworkEntry[] = Array.from({ length: 20 }, (_, index) => ({
    name: `Mario Game ${index}`,
    path: `Named_Boxarts/Mario Game ${index}.png`,
  }));
  assert.ok(rankArtworkMatches(files, "Mario Game").length <= 8);
});

test("pickAutomaticMatch acepta una única coincidencia y rechaza empates", () => {
  assert.deepEqual(pickAutomaticMatch([match("A", 0.3)]), match("A", 0.3));
  assert.equal(pickAutomaticMatch([match("A", 0.2), match("B", 0.21)]), null);
  assert.deepEqual(pickAutomaticMatch([match("A", 0.05), match("B", 0.4)]), match("A", 0.05));
  assert.equal(pickAutomaticMatch([]), null);
});

test("pickConfidentMatch exige una puntuación más baja que la búsqueda individual", () => {
  assert.deepEqual(
    pickConfidentMatch([match("A", 0.15), match("B", 0.5)]),
    match("A", 0.15),
  );
  assert.equal(pickConfidentMatch([match("A", 0.2), match("B", 0.5)]), null);
  assert.equal(pickConfidentMatch([match("A", 0.05), match("B", 0.1)]), null);
});

test("dedupeMatches conserva el primer resultado de cada ruta", () => {
  const entries = dedupeMatches([match("A", 0.1), match("B", 0.2), match("A", 0.9)]);
  assert.deepEqual(
    entries.map((entry) => entry.name),
    ["A", "B"],
  );
});

const entry = (category: string, name: string): ArtworkEntry => ({
  name,
  path: `${category}/${name}.png`,
});
const noRemote = async () => {
  throw new Error("no debería pedir categorías remotas");
};

test("uniqueQueries quita vacíos y repetidos conservando el orden", () => {
  assert.deepEqual(uniqueQueries([null, "Sonic", undefined, "", "Mario", "Sonic"]), [
    "Sonic",
    "Mario",
  ]);
});

test("findArtworkMatches prefiere las carátulas a títulos y capturas", async () => {
  const boxart = entry("Named_Boxarts", "Metroid Fusion (USA)");
  const files = [boxart, entry("Named_Titles", "Metroid Fusion (USA)")];
  const { matches, searchFiles } = await findArtworkMatches(files, ["Metroid Fusion"], noRemote);
  assert.equal(matches[0].path, boxart.path);
  assert.deepEqual(searchFiles, [boxart]);
});

test("findArtworkMatches cae a títulos del índice si no hay carátula", async () => {
  const title = entry("Named_Titles", "Metroid Fusion (USA)");
  const files = [entry("Named_Boxarts", "Zelda"), title];
  const { matches, searchFiles } = await findArtworkMatches(files, ["Metroid Fusion"], noRemote);
  assert.equal(matches[0].path, title.path);
  assert.deepEqual(searchFiles, [title]);
});

test("findArtworkMatches pide categorías remotas si el índice solo trae carátulas", async () => {
  const snap = entry("Named_Snaps", "Metroid Fusion (USA)");
  let calls = 0;
  const { matches } = await findArtworkMatches(
    [entry("Named_Boxarts", "Zelda")],
    ["Metroid Fusion"],
    async () => {
      calls++;
      return [{ category: "Named_Snaps", entries: [snap] }];
    },
  );
  assert.equal(calls, 1);
  assert.equal(matches[0].path, snap.path);
});

test("findArtworkMatches sin índice no consulta alternativas", async () => {
  assert.deepEqual(await findArtworkMatches([], ["Metroid"], noRemote), {
    matches: [],
    searchFiles: [],
  });
});

test("preferSavedChoice antepone la elección guardada si sigue disponible", () => {
  const usa = match("Sonic (USA)", 0.1);
  const europe = match("Sonic (Europe)", 0.2);
  const files = [entry("Named_Boxarts", "Sonic (USA)"), entry("Named_Boxarts", "Sonic (Europe)")];
  assert.deepEqual(
    preferSavedChoice([usa, europe], files, europe).map((item) => [item.name, item.score]),
    [
      ["Sonic (Europe)", 0],
      ["Sonic (USA)", 0.1],
    ],
  );
  assert.deepEqual(preferSavedChoice([usa], files, match("Otro", 0.1)), [usa]);
  assert.deepEqual(preferSavedChoice([usa], files, null), [usa]);
});

test("exactArtworkTargets sin índice prueba cada nombre en cada categoría", () => {
  assert.deepEqual([...exactArtworkTargets([], ["Sonic", ""])], [
    { category: "Named_Boxarts", name: "Sonic" },
    { category: "Named_Titles", name: "Sonic" },
    { category: "Named_Snaps", name: "Sonic" },
  ]);
});

test("exactArtworkTargets con índice solo propone entradas que existen", () => {
  const files = [entry("Named_Titles", "Sonic (USA)"), entry("Named_Boxarts", "Zelda")];
  assert.deepEqual([...exactArtworkTargets(files, ["Sonic"])], [
    { category: "Named_Titles", name: "Sonic (USA)" },
  ]);
});

test("pickBatchMatch usa carátula, luego títulos, y descarta lo ambiguo", () => {
  assert.deepEqual(
    pickBatchMatch([entry("Named_Boxarts", "Metroid Fusion (USA)")], "Metroid Fusion", null),
    { category: "Named_Boxarts", name: "Metroid Fusion (USA)" },
  );
  assert.equal(
    pickBatchMatch([entry("Named_Boxarts", "Zelda")], "Metroid Fusion", null),
    null,
  );
  assert.equal(
    pickBatchMatch(
      [entry("Named_Boxarts", "Metroid Fusion (USA)"), entry("Named_Boxarts", "Metroid Fusion (Europe)")],
      "Metroid Fusion",
      null,
    ),
    null,
  );
});
