/**
 * Conversión de sonidos al formato de la consola: WAV PCM de 16 bits, estéreo
 * y 22050 Hz, como los efectos originales de CubeGM.
 */
export const CONSOLE_RATE = 22050;
/** Los efectos del menú son cortos; uno largo taparía al siguiente. */
export const MAX_EFFECT_SECONDS = 5;

/** WAV PCM de 16 bits con los canales intercalados. */
export function encodeWav(channels: Float32Array[], sampleRate: number): Uint8Array {
  const frames = channels[0]?.length ?? 0;
  const dataBytes = frames * channels.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) =>
    [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels.length * 2, true);
  view.setUint16(32, channels.length * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, dataBytes, true);
  let offset = 44;
  for (let frame = 0; frame < frames; frame++) {
    for (const channel of channels) {
      const sample = Math.max(-1, Math.min(1, channel[frame]));
      view.setInt16(offset, Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff), true);
      offset += 2;
    }
  }
  return new Uint8Array(buffer);
}

/** Decodifica cualquier audio que entienda el navegador y lo deja listo para la consola. */
export async function toConsoleWav(file: File): Promise<Uint8Array> {
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error("No se pudo leer ese archivo de audio");
  } finally {
    void context.close();
  }
  if (decoded.duration > MAX_EFFECT_SECONDS) {
    throw new Error(`El efecto dura más de ${MAX_EFFECT_SECONDS} s; usa un sonido más corto`);
  }
  const frames = Math.max(1, Math.ceil(decoded.duration * CONSOLE_RATE));
  const offline = new OfflineAudioContext(2, frames, CONSOLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return encodeWav([rendered.getChannelData(0), rendered.getChannelData(1)], CONSOLE_RATE);
}
