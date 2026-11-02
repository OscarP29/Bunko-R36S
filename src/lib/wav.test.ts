import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeWav } from "./wav.ts";

test("encodeWav escribe un WAV PCM de 16 bits con canales intercalados", () => {
  const wav = encodeWav([new Float32Array([0, 1]), new Float32Array([-1, 0.5])], 22050);
  const view = new DataView(wav.buffer);
  const text = (from: number) => String.fromCharCode(...wav.slice(from, from + 4));
  assert.equal(text(0), "RIFF");
  assert.equal(text(8), "WAVE");
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 22050);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 8);
  assert.deepEqual(
    [0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true)),
    [0, -32768, 32767, 16384],
  );
});

test("encodeWav recorta las muestras fuera de rango", () => {
  const wav = encodeWav([new Float32Array([2, -3])], 11025);
  const view = new DataView(wav.buffer);
  assert.equal(view.getInt16(44, true), 32767);
  assert.equal(view.getInt16(46, true), -32768);
});
