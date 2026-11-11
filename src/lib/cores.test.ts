import { test } from "node:test";
import assert from "node:assert/strict";
import { coreHint } from "./cores.ts";

test("explica los emuladores conocidos y calla los demás", () => {
  assert.match(coreHint("libemu_sfc.so") ?? "", /ligero/);
  assert.equal(coreHint("libemu_desconocido.so"), undefined);
});
