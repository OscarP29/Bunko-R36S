import aliases from "../aliases.json";
import { cleanRomName } from "./rom.ts";

/**
 * Busca un alias para un nombre de ROM. La comparación se hace sobre el nombre
 * normalizado, así que la clave de `aliases.json` no necesita extensión ni acentos.
 */
export function findAlias(fileNameOrTitle: string): string | undefined {
  const key = cleanRomName(fileNameOrTitle);
  return Object.entries(aliases as Record<string, string>).find(
    ([alias]) => cleanRomName(alias) === key,
  )?.[1];
}
