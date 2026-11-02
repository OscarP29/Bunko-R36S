import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Copy,
  FileJson,
  LoaderCircle,
  Sparkles,
  Wand2,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import type {
  AiOrganizerJson,
  Game,
  System,
} from "../lib/types.ts";
import { Button, IconButton } from "./ui/Button.tsx";
import { Chip } from "./ui/Chip.tsx";
import { ModalBackdrop, ModalHeader } from "./ui/Modal.tsx";

type FullEntry = Game & {
  systemName: string;
  systemPath: string;
  systemFolder: string;
};

type AiListOrganizerProps = {
  systems: System[];
  fullLibrary: FullEntry[];
  loadingLibrary: boolean;
  onLoadLibrary: () => void;
  onImport: (
    items: {
      text: string;
      title?: string;
      category?: string;
      system?: string;
      folder?: string;
      priority?: "alta" | "media" | "baja";
      reason?: string;
      notes?: string;
      suggestedFileName?: string;
    }[],
  ) => void;
};

type Priority = "alta" | "media" | "baja";

function priorityOf(item: { priority?: string }): Priority {
  const p = (item.priority || "").toLowerCase();
  if (p === "alta" || p === "media" || p === "baja") return p as Priority;
  return "media";
}

function buildPrompt(library: FullEntry[]) {
  const grouped = library.reduce<Record<string, FullEntry[]>>((acc, entry) => {
    const key = entry.systemName || entry.systemFolder;
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});

  const sections = Object.entries(grouped)
    .sort((a, b) => a[0].localeCompare(b[0], "es"))
    .map(([system, games]) => {
      const list = games
        .sort((a, b) =>
          a.title.localeCompare(b.title, "es", { sensitivity: "base" }),
        )
        .map((game) => `- ${game.title} (${game.fileName})`)
        .join("\n");
      return `## ${system}\n${list}`;
    })
    .join("\n\n");

  return `# PROMPT PARA RECOMENDAR JUEGOS PARA MI R36S

Actúa como un experto en videojuegos retro y curador de bibliotecas para consolas portátiles con emulación (R36S).

## OBJETIVO
Te paso la lista de juegos que YA TENGO en mi R36S. Úsala como contexto para
entender mis gustos y recomiéndame juegos NUEVOS que me falten y que merezca
la pena añadir. La lista que te paso NO es lo que quiero organizar: es la base
para saber qué tengo y qué me gusta.

## PROCESO (síguelo en este orden)
1. Analiza mi biblioteca: qué géneros predominan, qué sagas tengo, qué sistemas
   uso más y qué estilo de juego parece gustarme.
2. Detecta huecos: sagas incompletas (entregas que me faltan), clásicos
   imprescindibles de los sistemas que uso, y géneros poco representados.
3. Recomienda juegos que NO estén en mi lista.

## REGLAS ESTRICTAS
- NO recomiendes ningún juego que ya tenga, ni en otra versión. Considera
  duplicado cualquier variante de región, idioma, revisión, traducción,
  port o remake del mismo título en el mismo sistema
  (ej.: "Golden Sun (Spain)" ya cubre "Golden Sun (USA)").
- Si una versión en otro sistema aporta algo claramente distinto, puedes
  recomendarla.
- Recomienda SOLO juegos reales que existan. Si no estás seguro de que
  exista o de su nombre exacto, NO lo incluyas. Nunca inventes títulos.
- Usa SOLO sistemas compatibles con R36S: FC (NES), SFC (SNES), GB, GBC, GBA,
  MD (Mega Drive), MS (Master System), PCE (PC Engine), PS (PlayStation 1),
  MAME/arcade, Neo Geo, etc. No propongas sistemas que no se emulen bien
  en esta consola (PS2, GameCube, Wii, etc.).
- Cada categoría tiene que tener entre 3 y 8 recomendaciones, de calidad
  antes que cantidad. Máximo 40 recomendaciones en total.
- Cada juego aparece en UNA sola categoría.
- NO escribas descripciones, motivos ni notas: solo los campos del esquema.
- Prioriza juegos que encajen con mis gustos, pero incluye 2-3 "descubrimientos"
  fuera de mi zona habitual si crees que me pueden gustar.

## CATEGORÍAS
Usa nombres cortos en español: Acción, Plataformas, JRPG, RPG Occidental,
Aventura, Lucha, Carreras, Shoot 'em up, Puzzle, Estrategia, Metroidvania,
Terror, Deportes, Party, Arcade, etc. Crea solo las que tengan sentido.

## FORMATO DE RESPUESTA
Devuelve ÚNICAMENTE un JSON VÁLIDO. SIN markdown, SIN explicaciones, SIN texto extra.

Esquema EXACTO:

{
  "version": 1,
  "generatedAt": "FECHA_ISO",
  "profile": {
    "summary": "Resumen breve de mis gustos según mi biblioteca",
    "topGenres": ["género 1", "género 2"],
    "favoriteSagas": ["saga 1", "saga 2"],
    "gaps": ["hueco detectado 1", "hueco detectado 2"]
  },
  "categories": [
    {
      "name": "Nombre de categoría",
      "items": [
        {
          "title": "Título del juego recomendado",
          "system": "Sistema donde jugarlo",
          "folder": "Carpeta sugerida del emulador (ej. GBA, SFC, PS)",
          "suggestedFileName": "Nombre de archivo estilo No-Intro/Redump, sin extensión",
          "priority": "alta | media | baja"
        }
      ]
    }
  ]
}

## MI BIBLIOTECA ACTUAL (NO recomendar nada de esto)
Total de juegos: ${library.length}

${sections}

## INSTRUCCIÓN FINAL
Genera ÚNICAMENTE el JSON con tus recomendaciones. Ningún juego recomendado
puede estar en mi biblioteca actual.`;
}

export function AiListOrganizer({
  systems,
  fullLibrary,
  loadingLibrary,
  onLoadLibrary,
  onImport,
}: AiListOrganizerProps) {
  const [prompt, setPrompt] = useState("");
  const [jsonInput, setJsonInput] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [parsed, setParsed] = useState<AiOrganizerJson | null>(null);
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set());
  const [removedStack, setRemovedStack] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<"all" | Priority>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandAll, setExpandAll] = useState(true);
  const [profileOpen, setProfileOpen] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  const hasLibrary = fullLibrary.length > 0;

  const stats = useMemo(() => {
    const countBySystem = systems.reduce<Record<string, number>>((acc, system) => {
      acc[system.name] = system.gameCount;
      return acc;
    }, {});
    return { countBySystem };
  }, [systems]);

  // Auto-parse when JSON changes.
  useEffect(() => {
    if (!jsonInput.trim()) {
      setParsed(null);
      setRemovedKeys(new Set());
      setRemovedStack([]);
      return;
    }
    try {
      const data = JSON.parse(jsonInput) as AiOrganizerJson;
      if (Array.isArray(data.categories)) {
        setParsed(data);
        setRemovedKeys(new Set());
        setRemovedStack([]);
        setExpanded(new Set(data.categories.map((c) => c.name)));
      }
    } catch {
      // Keep previous parsed; don't spam errors while typing.
    }
  }, [jsonInput]);

  function generate() {
    setError("");
    setCopied(false);
    if (!hasLibrary) return;
    setPrompt(buildPrompt(fullLibrary));
  }

  async function copyPrompt() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("No se ha podido copiar al portapapeles");
    }
  }

  function parseJson() {
    setError("");
    try {
      const data = JSON.parse(jsonInput) as AiOrganizerJson;
      if (!Array.isArray(data.categories)) {
        throw new Error("El JSON debe tener un array 'categories'");
      }
      setParsed(data);
      setRemovedKeys(new Set());
      setRemovedStack([]);
      setExpanded(new Set(data.categories.map((c) => c.name)));
    } catch (e) {
      setError(`JSON inválido: ${String(e)}`);
    }
  }

  const itemKey = (ci: number, ii: number) => `${ci}:${ii}`;

  function removeItem(ci: number, ii: number) {
    const key = itemKey(ci, ii);
    setRemovedKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    setRemovedStack((prev) => [...prev, key]);
  }

  function removeCategory(ci: number) {
    if (!parsed) return;
    const cat = parsed.categories[ci];
    if (!cat?.items) return;
    const keys = cat.items.map((_, ii) => itemKey(ci, ii));
    setRemovedKeys((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => next.add(k));
      return next;
    });
    setRemovedStack((prev) => [...prev, ...keys]);
  }

  function undoLast() {
    const last = removedStack[removedStack.length - 1];
    if (!last) return;
    setRemovedKeys((prev) => {
      const next = new Set(prev);
      next.delete(last);
      return next;
    });
    setRemovedStack((prev) => prev.slice(0, -1));
  }

  function restoreAll() {
    setRemovedKeys(new Set());
    setRemovedStack([]);
  }

  function toggleAll() {
    if (!parsed) return;
    if (expandAll) {
      setExpanded(new Set());
      setExpandAll(false);
    } else {
      setExpanded(new Set(parsed.categories.map((c) => c.name)));
      setExpandAll(true);
    }
  }

  // Visible categories (non-empty after removals and filter).
  const visibleCategories = useMemo(() => {
    if (!parsed) return [];
    return parsed.categories
      .map((cat, ci) => {
        const items = (cat.items || [])
          .map((item, ii) => ({ item, ii, key: itemKey(ci, ii) }))
          .filter(({ key }) => !removedKeys.has(key))
          .filter(({ item }) =>
            priorityFilter === "all"
              ? true
              : priorityOf(item as { priority?: string }) === priorityFilter,
          );
        return { cat, ci, items };
      })
      .filter(({ items }) => items.length > 0);
  }, [parsed, removedKeys, priorityFilter]);

  const totalVisible = visibleCategories.reduce(
    (t, c) => t + c.items.length,
    0,
  );

  const priorityCounts = useMemo(() => {
    const counts = { alta: 0, media: 0, baja: 0 };
    if (!parsed) return counts;
    parsed.categories.forEach((cat, ci) => {
      (cat.items || []).forEach((item, ii) => {
        if (removedKeys.has(itemKey(ci, ii))) return;
        counts[priorityOf(item as { priority?: string })]++;
      });
    });
    return counts;
  }, [parsed, removedKeys]);

  function importToList() {
    if (!parsed) return;
    const items: {
      text: string;
      title?: string;
      category?: string;
      system?: string;
      folder?: string;
      priority?: "alta" | "media" | "baja";
      reason?: string;
      notes?: string;
      suggestedFileName?: string;
    }[] = [];

    // Build from visible (non-removed) items across all categories.
    parsed.categories.forEach((category, ci) => {
      (category.items || []).forEach((item, ii) => {
        if (removedKeys.has(itemKey(ci, ii))) return;
        const systemLabel = item.system || item.folder;
        const base = item.title || (item as { fileName?: string }).fileName;
        if (!base) return;
        const priorityRaw = (item as { priority?: string }).priority?.trim().toLowerCase();
        const priority =
          priorityRaw === "alta" || priorityRaw === "media" || priorityRaw === "baja"
            ? (priorityRaw as "alta" | "media" | "baja")
            : undefined;
        const suggestedFileName = (item as { suggestedFileName?: string }).suggestedFileName?.trim();
        const folder = (item as { folder?: string }).folder?.trim();
        items.push({
          text: systemLabel
            ? `[${category.name}] ${base} (${systemLabel})`
            : `[${category.name}] ${base}`,
          title: base,
          category: category.name,
          system: systemLabel || undefined,
          folder: folder || undefined,
          priority,
          suggestedFileName: suggestedFileName || undefined,
        });
      });
    });

    if (Array.isArray(parsed.uncategorized)) {
      parsed.uncategorized.forEach((item) => {
        const systemLabel = item.system || item.folder;
        const base = item.title || (item as { fileName?: string }).fileName;
        if (!base) return;
        const priorityRaw = (item as { priority?: string }).priority
          ?.trim()
          .toLowerCase();
        const priority =
          priorityRaw === "alta" || priorityRaw === "media" || priorityRaw === "baja"
            ? (priorityRaw as "alta" | "media" | "baja")
            : undefined;
        items.push({
          text: systemLabel
            ? `[Sin categorizar] ${base} (${systemLabel})`
            : `[Sin categorizar] ${base}`,
          title: base,
          category: "Sin categoría",
          system: systemLabel || undefined,
          folder: (item as { folder?: string }).folder?.trim() || undefined,
          priority,
          suggestedFileName:
            (item as { suggestedFileName?: string }).suggestedFileName?.trim() ||
            undefined,
        });
      });
    }

    const unique = Array.from(
      new Map(items.map((item) => [item.text.toLowerCase(), item])).values(),
    );
    onImport(unique);
    setJsonInput("");
    setParsed(null);
    setRemovedKeys(new Set());
    setRemovedStack([]);
    setError("");
  }

  return (
    <>
      <Button
        title="Genera un prompt, revisa las recomendaciones y añádelas a tus pendientes"
        onClick={() => setIsOpen(true)}
      >
        <Sparkles size={16} /> Recomendar con IA
      </Button>

      {isOpen && (
      <ModalBackdrop className="ai-modal-backdrop" onClose={() => setIsOpen(false)}>
        <section className="modal ai-organizer-modal">
          <ModalHeader
            eyebrow="RECOMENDAR CON IA"
            title="Generar recomendaciones"
            subtitle="Prepara el prompt, pega la respuesta, revisa y añade los juegos."
            closeLabel="Cerrar generador IA"
            onClose={() => setIsOpen(false)}
          />

          <div className="modal-body ai-organizer-modal-body">
      <div className="ai-organizer">
      <div className="ai-organizer-actions">
        <Button
          onClick={onLoadLibrary}
          disabled={loadingLibrary}
        >
          {loadingLibrary ? <LoaderCircle size={14} className="spin" /> : <Wand2 size={14} />}
          {hasLibrary ? "Recargar biblioteca completa" : "Cargar biblioteca completa"}
        </Button>
        <Button variant="primary" onClick={generate} disabled={!hasLibrary}>
          <Sparkles size={16} /> Generar prompt
        </Button>
      </div>

      {Object.keys(stats.countBySystem).length > 0 && (
        <div className="ai-system-chips">
          {Object.entries(stats.countBySystem).map(([name, count]) => (
            <span key={name}>{name}: {count}</span>
          ))}
        </div>
      )}

      {prompt && (
        <section className="ai-block">
          <header>
            <div>
              <strong>1) Copia este prompt</strong>
              <span>
                Pégalo tal cual en ChatGPT, Claude, Gemini, Grok...
              </span>
            </div>
            <Button onClick={copyPrompt}>
              {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
              {copied ? "Copiado" : "Copiar prompt"}
            </Button>
          </header>
          <textarea
            className="ai-textarea"
            value={prompt}
            readOnly
            spellCheck={false}
          />
        </section>
      )}

      <section className="ai-block">
        <header>
          <div>
            <strong>2) Pega el JSON devuelto por la IA</strong>
            <span>
              Las recomendaciones se añadirán a "Lista de pendientes". No se
              modificarán juegos existentes.
            </span>
          </div>
          <Button
            onClick={parseJson}
            disabled={!jsonInput.trim()}
          >
            <FileJson size={14} /> Previsualizar
          </Button>
        </header>
        <textarea
          className="ai-textarea"
          placeholder='{"version":1,"profile":{...},"categories":[...]}'
          value={jsonInput}
          onChange={(event) => setJsonInput(event.target.value)}
          spellCheck={false}
        />
      </section>

      {parsed && (
        <>
          {/* Resumen superior */}
          <section className="ai-summary">
            <div className="ai-summary-stats">
              <span>
                <strong>{totalVisible}</strong> juegos
              </span>
              <span>
                <strong>{visibleCategories.length}</strong> categorías
              </span>
              <span className="ai-prio-count alta">
                {priorityCounts.alta} alta
              </span>
              <span className="ai-prio-count media">
                {priorityCounts.media} media
              </span>
              <span className="ai-prio-count baja">
                {priorityCounts.baja} baja
              </span>
            </div>
            {parsed.profile && (
              <details
                className="ai-profile"
                open={profileOpen}
                onToggle={(e) =>
                  setProfileOpen((e.target as HTMLDetailsElement).open)
                }
              >
                <summary>
                  <span>Perfil detectado</span>
                  <ChevronDown size={14} />
                </summary>
                <div className="ai-profile-body">
                  {parsed.profile.summary && (
                    <p>{parsed.profile.summary}</p>
                  )}
                  {parsed.profile.topGenres?.length ? (
                    <div className="ai-chip-row">
                      <span className="ai-chip-label">Géneros:</span>
                      {parsed.profile.topGenres.map((g, i) => (
                        <Chip key={i}>{g}</Chip>
                      ))}
                    </div>
                  ) : null}
                  {parsed.profile.favoriteSagas?.length ? (
                    <div className="ai-chip-row">
                      <span className="ai-chip-label">Sagas:</span>
                      {parsed.profile.favoriteSagas.map((g, i) => (
                        <Chip key={i}>{g}</Chip>
                      ))}
                    </div>
                  ) : null}
                  {parsed.profile.gaps?.length ? (
                    <div className="ai-chip-row">
                      <span className="ai-chip-label">Huecos:</span>
                      {parsed.profile.gaps.map((g, i) => (
                        <Chip tone="gap" key={i}>{g}</Chip>
                      ))}
                    </div>
                  ) : null}
                </div>
              </details>
            )}
          </section>

          {/* Controles */}
          <div className="ai-controls">
            <div className="ai-filter-group">
              <span>Filtrar:</span>
              {(["all", "alta", "media", "baja"] as const).map((p) => (
                <button
                  key={p}
                  className={priorityFilter === p ? "filter-active" : ""}
                  onClick={() => setPriorityFilter(p)}
                >
                  {p === "all" ? "Todas" : p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
            <Button onClick={toggleAll}>
              {expandAll ? "Contraer todo" : "Expandir todo"}
            </Button>
            {removedStack.length > 0 && (
              <Button onClick={undoLast}>
                <Undo2 size={14} /> Deshacer
              </Button>
            )}
            {removedKeys.size > 0 && (
              <Button onClick={restoreAll}>
                Restaurar todos
              </Button>
            )}
          </div>

          {/* Previsualización */}
          <section className="ai-preview">
            <header>
              <strong>Previsualización</strong>
              <span>
                {totalVisible} en categorías · {removedKeys.size} quitados
              </span>
            </header>
            <div className="ai-preview-groups">
              {visibleCategories.map(({ cat, ci, items }) => {
                const isOpen = expanded.has(cat.name);
                return (
                  <details
                    key={cat.name + ci}
                    open={isOpen}
                    onToggle={(e) =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if ((e.target as HTMLDetailsElement).open)
                          next.add(cat.name);
                        else next.delete(cat.name);
                        return next;
                      })
                    }
                  >
                    <summary>
                      <span className="ai-cat-name">
                        {isOpen ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronRight size={14} />
                        )}
                        {cat.name}
                      </span>
                      <div className="ai-cat-actions">
                        <small>{items.length}</small>
                        <IconButton
                          label={`Quitar categoría ${cat.name}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            removeCategory(ci);
                          }}
                        >
                          <Trash2 size={13} />
                        </IconButton>
                      </div>
                    </summary>
                    <ul>
                      {items.map(({ item, ii, key }) => {
                        const prio = priorityOf(
                          item as { priority?: string },
                        );
                        const system = item.system || item.folder;
                        const title = item.title || item.fileName || "";
                        const suggested =
                          (item as { suggestedFileName?: string })
                            .suggestedFileName;
                        return (
                          <li key={key} className="ai-game-card">
                            <div className="ai-game-top">
                              <strong>{title}</strong>
                              <IconButton
                                label={`Quitar ${title}`}
                                onClick={() => removeItem(ci, ii)}
                              >
                                <X size={14} />
                              </IconButton>
                            </div>
                            <div className="ai-game-chips">
                              <Chip tone={prio}>{prio.toUpperCase()}</Chip>
                              {system && (
                                <Chip tone="system">{system}</Chip>
                              )}
                            </div>
                            {suggested && (
                              <div className="ai-game-file">
                                <code>{suggested}</code>
                                <Button
                                  variant="text"
                                  onClick={() =>
                                    navigator.clipboard.writeText(suggested)
                                  }
                                  aria-label={`Copiar nombre de archivo ${suggested}`}
                                >
                                  <Copy size={12} /> Copiar
                                </Button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                );
              })}
              {visibleCategories.length === 0 && (
                <div className="empty-state">
                  <strong>Sin juegos para mostrar</strong>
                  <span>
                    {removedKeys.size > 0
                      ? "Has quitado todos. Usa “Restaurar todos” para recuperarlos."
                      : "No hay recomendaciones en el JSON."}
                  </span>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {error && (
        <div className="error-banner">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}
      </div>
          </div>
          <div className="modal-footer ai-organizer-modal-footer">
            <span>
              {parsed ? `${totalVisible} juegos listos para añadir` : "Pega la respuesta de la IA para previsualizarla"}
            </span>
            {parsed && (
              <Button variant="primary" onClick={() => { importToList(); setIsOpen(false); }} disabled={totalVisible === 0}>
                <CheckCircle2 size={16} /> Añadir {totalVisible} juego{totalVisible === 1 ? "" : "s"}
              </Button>
            )}
          </div>
        </section>
      </ModalBackdrop>
      )}
    </>
  );
}
