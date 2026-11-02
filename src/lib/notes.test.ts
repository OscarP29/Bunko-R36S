import { test } from "node:test";
import assert from "node:assert/strict";
import { gameTitleSuggestions, noteFitsSystem, noteSystem } from "./notes.ts";

const note = (patch: Record<string, string>) => ({ id: "1", text: "Juego", done: false, ...patch });

test("noteSystem usa el campo o el paréntesis final del texto", () => {
  assert.equal(noteSystem(note({ system: " GBA " })), "GBA");
  assert.equal(noteSystem(note({ text: "Metroid Fusion (GBA)" })), "GBA");
  assert.equal(noteSystem(note({ text: "Sin consola" })), "");
});

test("noteFitsSystem acepta el mismo emulador por carpeta o nombre, y las notas sin consola", () => {
  assert.equal(noteFitsSystem(note({ system: "GBA" }), "GBA"), true);
  assert.equal(noteFitsSystem(note({ system: "Game Boy Advance" }), "GBA"), true);
  assert.equal(noteFitsSystem(note({ text: "Zelda (gba)" }), "GBA"), true);
  assert.equal(noteFitsSystem(note({ folder: "SFC", system: "Super Nintendo" }), "SFC"), true);
  assert.equal(noteFitsSystem(note({}), "GBA"), true);
  assert.equal(noteFitsSystem(note({ system: "PS" }), "GBA"), false);
  assert.equal(noteFitsSystem(note({ text: "Mario (FC)" }), "GBA"), false);
});

test("gameTitleSuggestions quita la región, no repite y prioriza los que empiezan por la búsqueda", () => {
  const names = [
    "Super Mario World (USA)",
    "Super Mario World (Europe) (Rev 1)",
    "Mario Kart - Super Circuit (USA)",
    "Super Mario Advance (USA, Europe)",
    "Zelda",
  ];
  assert.deepEqual(gameTitleSuggestions(names, "mario"), [
    "Mario Kart - Super Circuit",
    "Super Mario Advance",
    "Super Mario World",
  ]);
  assert.deepEqual(gameTitleSuggestions(names, "m"), []);
});
