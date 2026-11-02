import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { formatBytes } from "../lib/format.ts";

export type ChecklistItem = {
  relative: string;
  title: string;
  system: string;
  bytes: number;
  /** No se puede elegir; `note` explica por qué. */
  disabled?: boolean;
  /** Aviso corto bajo el archivo. */
  note?: string;
};

type SaveChecklistProps = {
  items: ChecklistItem[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
};

/** `states/GBA/x.sv2` → «Guardado rápido, ranura 2». */
export function describeSave(relative: string) {
  if (!relative.startsWith("states/")) return "Guardado del juego";
  const slot = relative.match(/\.sv(\d+)$/i)?.[1];
  return slot ? `Guardado rápido, ranura ${slot}` : "Guardado rápido";
}

type Group = { key: string; title: string; system: string; items: ChecklistItem[] };

/** Partidas agrupadas por juego, con casilla por juego y por archivo. */
export function SaveChecklist({ items, selected, onChange }: SaveChecklistProps) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const byGame = new Map<string, Group>();
    for (const item of items) {
      const key = `${item.system}/${item.title}`;
      const group = byGame.get(key) ?? { key, title: item.title, system: item.system, items: [] };
      group.items.push(item);
      byGame.set(key, group);
    }
    return [...byGame.values()].sort((a, b) =>
      a.title.localeCompare(b.title, "es", { sensitivity: "base", numeric: true }),
    );
  }, [items]);

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? groups.filter((group) => group.title.toLowerCase().includes(needle))
    : groups;
  const selectable = items.filter((item) => !item.disabled);
  const allSelected = selectable.length > 0 && selectable.every((item) => selected.has(item.relative));

  function toggle(relatives: string[], on: boolean) {
    const next = new Set(selected);
    for (const relative of relatives) {
      if (on) next.add(relative);
      else next.delete(relative);
    }
    onChange(next);
  }

  return (
    <div className="save-checklist">
      <div className="save-checklist-tools">
        <label className="check-row">
          <input
            type="checkbox"
            className="check"
            checked={allSelected}
            disabled={!selectable.length}
            onChange={(event) => toggle(selectable.map((item) => item.relative), event.target.checked)}
          />
          <span>Seleccionar todas</span>
        </label>
        {groups.length > 7 && (
          <div className="search-box">
            <Search size={16} />
            <input
              placeholder="Buscar un juego..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        )}
      </div>

      {!visible.length && <p className="save-checklist-empty">Ningún juego coincide.</p>}

      <ul className="save-groups">
        {visible.map((group) => {
          const groupSelectable = group.items.filter((item) => !item.disabled);
          const checked =
            groupSelectable.length > 0 && groupSelectable.every((item) => selected.has(item.relative));
          return (
            <li key={group.key} className="save-group">
              <label className="check-row save-group-title">
                <input
                  type="checkbox"
                  className="check"
                  checked={checked}
                  disabled={!groupSelectable.length}
                  onChange={(event) =>
                    toggle(groupSelectable.map((item) => item.relative), event.target.checked)
                  }
                />
                <strong>{group.title}</strong>
                <span className="save-system">{group.system}</span>
              </label>
              <ul>
                {group.items.map((item) => (
                  <li key={item.relative}>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        className="check"
                        checked={selected.has(item.relative)}
                        disabled={item.disabled}
                        onChange={(event) => toggle([item.relative], event.target.checked)}
                      />
                      <span>{describeSave(item.relative)}</span>
                      <span className="save-size">{formatBytes(item.bytes)}</span>
                    </label>
                    {item.note && <p className="save-note">{item.note}</p>}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
