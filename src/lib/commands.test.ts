import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterCommands,
  formatShortcut,
  shortcutFromEvent,
  type Command,
} from "./commands.ts";

const command = (label: string, group = "Acciones", keywords?: string): Command => ({
  id: label,
  label,
  group,
  keywords,
  run: () => {},
});
const labels = (commands: Command[]) => commands.map((item) => item.label);
const press = (key: string, extra = {}) => ({
  key,
  ctrlKey: true,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...extra,
});

test("filterCommands sin búsqueda conserva todo en orden", () => {
  const all = [command("Uno"), command("Dos")];
  assert.deepEqual(filterCommands(all, "  "), all);
});

test("filterCommands ignora acentos y mayúsculas", () => {
  const all = [command("Configuración"), command("Biblioteca")];
  assert.deepEqual(labels(filterCommands(all, "CONFIGURACION")), ["Configuración"]);
});

test("filterCommands exige todas las palabras y mira grupo y palabras clave", () => {
  const all = [command("GBA", "Sistemas", "game boy"), command("SFC", "Sistemas")];
  assert.deepEqual(labels(filterCommands(all, "sistemas boy")), ["GBA"]);
});

test("filterCommands antepone lo que empieza por la búsqueda", () => {
  const all = [command("Ir a Pendientes"), command("Pendientes rápidos")];
  assert.deepEqual(labels(filterCommands(all, "pend")), [
    "Pendientes rápidos",
    "Ir a Pendientes",
  ]);
});

test("shortcutFromEvent normaliza combinaciones", () => {
  assert.equal(shortcutFromEvent(press("k")), "Ctrl+K");
  assert.equal(shortcutFromEvent(press("k", { ctrlKey: false, metaKey: true })), "Ctrl+K");
  assert.equal(shortcutFromEvent(press("L", { shiftKey: true })), "Ctrl+Shift+L");
  assert.equal(shortcutFromEvent(press("=")), "Ctrl+Plus");
  assert.equal(shortcutFromEvent(press("+", { shiftKey: true })), "Ctrl+Plus");
  assert.equal(shortcutFromEvent(press("-")), "Ctrl+Minus");
  assert.equal(shortcutFromEvent(press("F5", { ctrlKey: false })), "F5");
});

test("shortcutFromEvent descarta lo que no es un atajo", () => {
  assert.equal(shortcutFromEvent(press("k", { ctrlKey: false })), null);
  assert.equal(shortcutFromEvent(press("Control")), null);
  assert.equal(shortcutFromEvent(press("k", { altKey: true })), null);
});

test("formatShortcut produce texto legible", () => {
  assert.equal(formatShortcut("Ctrl+K"), "Ctrl K");
  assert.equal(formatShortcut("Ctrl+Shift+L"), "Ctrl Shift L");
  assert.equal(formatShortcut("Ctrl+Plus"), "Ctrl +");
  assert.equal(formatShortcut("Ctrl+Minus"), "Ctrl -");
  assert.equal(formatShortcut("F5"), "F5");
});
