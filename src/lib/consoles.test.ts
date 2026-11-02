import { test } from "node:test";
import assert from "node:assert/strict";
import { backupLabel, CONSOLE_PROFILES, consoleProfile } from "./consoles.ts";

test("backupLabel usa fecha y hora locales con ceros a la izquierda", () => {
  assert.equal(
    backupLabel("partidas", new Date(2026, 0, 5, 9, 7)),
    "partidas-2026-01-05_0907",
  );
});

test("solo R36SX está disponible por ahora y es el perfil por defecto", () => {
  assert.deepEqual(
    CONSOLE_PROFILES.filter((profile) => profile.available).map((profile) => profile.id),
    ["r36sx"],
  );
  assert.equal(consoleProfile("r36sx").cubegm, true);
  assert.equal(consoleProfile("arkos").available, false);
});
