import { test } from "node:test";
import assert from "node:assert/strict";
import { isMusicSlot, soundLabel } from "./consoleLook.ts";

test("soundLabel nombra los efectos conocidos y numera los demás", () => {
  assert.equal(soundLabel("bgm"), "Música de fondo");
  assert.equal(soundLabel("effect6"), "Volver");
  assert.equal(soundLabel("effect12"), "Efecto 12");
});

test("isMusicSlot distingue la música de los efectos por su archivo", () => {
  assert.equal(isMusicSlot("bgm.MP3"), true);
  assert.equal(isMusicSlot("PageBack.wav"), false);
});
