import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBytes } from "./format.ts";

const NBSP = /\u00a0/g;
const text = (bytes: number) => formatBytes(bytes).replace(NBSP, " ");

test("formatBytes usa la unidad adecuada en base 1024", () => {
  assert.equal(text(512), "512 B");
  assert.equal(text(2048), "2 KB");
  assert.equal(text(5 * 1024 ** 2), "5 MB");
  assert.equal(text(2 * 1024 ** 3), "2 GB");
  assert.equal(text(1.5 * 1024 ** 4), "1,5 TB");
});

test("formatBytes da un decimal desde los GB y ninguno por debajo", () => {
  assert.equal(text(29.72 * 1024 ** 3), "29,7 GB");
  assert.equal(text(1.6 * 1024 ** 2), "2 MB");
  assert.equal(text(0), "0 B");
});
