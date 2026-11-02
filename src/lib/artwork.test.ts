import { test } from "node:test";
import assert from "node:assert/strict";
import {
  categoryOfPath,
  dedupeMatches,
  githubRepoName,
  parseGithubTree,
  parseLibretroListing,
  pickAutomaticMatch,
  pickConfidentMatch,
  rankArtworkMatches,
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
