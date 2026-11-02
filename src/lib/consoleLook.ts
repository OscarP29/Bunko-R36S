/** Qué hace cada sonido de `cubegm/setting.xml` en el menú de CubeGM. */
const SOUND_LABELS: Record<string, string> = {
  bgm: "Música de fondo",
  effect0: "Moverse por el menú",
  effect1: "Abrir un juego",
  effect2: "Asignar teclas",
  effect3: "Confirmar",
  effect4: "Transición vertical",
  effect5: "Transición horizontal",
  effect6: "Volver",
  effect7: "Ventana emergente",
  effect8: "Recorrer la lista",
};

export const soundLabel = (slot: string) => SOUND_LABELS[slot] ?? `Efecto ${slot.replace(/\D/g, "")}`;

/** La música es un MP3 que se copia tal cual; los efectos se convierten a WAV. */
export const isMusicSlot = (file: string) => file.toLowerCase().endsWith(".mp3");
