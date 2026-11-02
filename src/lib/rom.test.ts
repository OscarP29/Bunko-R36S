import { test } from "node:test";
import assert from "node:assert/strict";
import {
  archiveAdvice,
  cleanRomName,
  cleanTitle,
  guessLibretroSystem,
  libretroSafeName,
  makeArtworkUrl,
  regionRank,
  stem,
} from "./rom.ts";

test("stem y cleanTitle quitan solo la extensión final", () => {
  assert.equal(stem("Juego.v1.2.gba"), "Juego.v1.2");
  assert.equal(stem("SinExtension"), "SinExtension");
  assert.equal(cleanTitle("Mi_juego-2.gba"), "Mi juego 2");
});

test("cleanRomName normaliza acentos, regiones y signos", () => {
  assert.equal(cleanRomName("Pokémon Rubí (Spain) [Rev 1].gba"), "pokemon rubi");
  assert.equal(cleanRomName("Super Mario Bros. (USA).nes"), "super mario bros");
  assert.equal(cleanRomName("Zelda: A Link to the Past.zip"), "zelda a link to the past");
  assert.equal(cleanRomName("  espacios   raros  .gba"), "espacios raros");
});

test("cleanRomName elimina corchetes aunque no haya paréntesis", () => {
  assert.equal(cleanRomName("Juego [Europe].gba"), "juego");
});

test("regionRank prioriza España, Europa, USA/Europa, USA y World", () => {
  const names = [
    "Juego (World)",
    "Juego (USA)",
    "Juego (USA, Europe)",
    "Juego (Europe)",
    "Juego (Spain)",
    "Juego (Japan)",
  ];
  const sorted = [...names].sort((a, b) => regionRank(a) - regionRank(b));
  assert.deepEqual(sorted, [
    "Juego (Spain)",
    "Juego (Europe)",
    "Juego (USA, Europe)",
    "Juego (USA)",
    "Juego (World)",
    "Juego (Japan)",
  ]);
});

test("guessLibretroSystem traduce carpetas conocidas y conserva las desconocidas", () => {
  assert.equal(guessLibretroSystem("gba"), "Nintendo - Game Boy Advance");
  assert.equal(guessLibretroSystem("Snes9x"), "Nintendo - Super Nintendo Entertainment System");
  assert.equal(guessLibretroSystem("Nintendo_DS"), "Nintendo - Nintendo DS");
  assert.equal(guessLibretroSystem("mi_consola-rara"), "mi consola-rara");
});

test("libretroSafeName sustituye solo los caracteres reservados", () => {
  assert.equal(libretroSafeName("Kirby & The Amazing Mirror"), "Kirby _ The Amazing Mirror");
  assert.equal(libretroSafeName("Pokemon - Edicion Esmeralda"), "Pokemon - Edicion Esmeralda");
});

test("makeArtworkUrl codifica espacios y acentos", () => {
  assert.equal(
    makeArtworkUrl("Nintendo - Game Boy Advance", "Named_Boxarts", "Pokemon Rubi"),
    "https://thumbnails.libretro.com/Nintendo%20-%20Game%20Boy%20Advance/Named_Boxarts/Pokemon%20Rubi.png",
  );
  assert.ok(
    makeArtworkUrl("Sony - PlayStation", "Named_Titles", "Crash Bandicoot (Spain)").endsWith(
      "/Named_Titles/Crash%20Bandicoot%20(Spain).png",
    ),
  );
});

test("archiveAdvice avisa de .7z y de .zip en GBA y NES, nunca en arcade", () => {
  assert.equal(archiveAdvice("Juego.zip", "gba"), "zip");
  assert.equal(archiveAdvice("Juego.ZIP", "NES"), "zip");
  assert.equal(archiveAdvice("Juego.zip", "snes"), null);
  assert.equal(archiveAdvice("Juego.7z", "snes"), "7z");
  assert.equal(archiveAdvice("Juego.7z", "psx"), "7z");
  assert.equal(archiveAdvice("sf2.zip", "mame"), null);
  assert.equal(archiveAdvice("sf2.7z", "fbneo"), null);
  assert.equal(archiveAdvice("Juego.gba", "gba"), null);
});
