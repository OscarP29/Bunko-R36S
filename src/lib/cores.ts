/**
 * Notas sobre los emuladores de la consola que se conocen bien. La clave es el
 * archivo que guarda `cubegm/cores/filelist.xml`.
 */
const HINTS: Record<string, string> = {
  "libemu_sfc.so": "El más ligero de Super Nintendo: va fluido, pero algunos juegos fallan.",
  "libemu_snes9x2010.so": "Término medio de Super Nintendo entre velocidad y compatibilidad.",
  "libemu_snes9x.so": "El más fiel de Super Nintendo y el que más exige: puede ir lento.",
  "libemu_nestopia.so": "Más fiel que FCEUmm y algo más exigente.",
  "libemu_fbafast.so": "Versión rápida para arcade: prueba con este si un juego va lento.",
};

export const coreHint = (file: string): string | undefined => HINTS[file];
