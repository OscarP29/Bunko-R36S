import { test } from "node:test";
import assert from "node:assert/strict";
import { backgroundInfo, groupBackgrounds, isMusicSlot, soundLabel } from "./consoleLook.ts";

test("soundLabel nombra los efectos conocidos y numera los demás", () => {
  assert.equal(soundLabel("bgm"), "Música de fondo");
  assert.equal(soundLabel("effect6"), "Volver");
  assert.equal(soundLabel("effect12"), "Efecto 12");
});

test("isMusicSlot distingue la música de los efectos por su archivo", () => {
  assert.equal(isMusicSlot("bgm.MP3"), true);
  assert.equal(isMusicSlot("PageBack.wav"), false);
});

test("backgroundInfo nombra los fondos conocidos y deja el nombre del archivo si no", () => {
  assert.deepEqual(backgroundInfo("GBA.raw"), { label: "Game Boy Advance", group: "Sistemas" });
  assert.deepEqual(backgroundInfo("Nuevo.raw"), { label: "Nuevo", group: "Ajustes" });
});

test("groupBackgrounds ordena por grupo y por la lista del menú", () => {
  const groups = groupBackgrounds([{ name: "SetVolume.raw" }, { name: "GBA.raw" }, { name: "FC.raw" }, { name: "AllEMU.raw" }]);
  assert.deepEqual(
    groups.map((g) => [g.group, g.items.map((i) => i.name)]),
    [["Menú", ["AllEMU.raw"]], ["Sistemas", ["FC.raw", "GBA.raw"]], ["Ajustes", ["SetVolume.raw"]]],
  );
});
