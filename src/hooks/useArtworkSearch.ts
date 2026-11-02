import { useRef, useState } from "react";
import { findAlias } from "../lib/aliases.ts";
import {
  categoryOfPath,
  exactArtworkTargets,
  pickAutomaticMatch,
  pickBatchMatch,
  uniqueQueries,
} from "../lib/artwork.ts";
import {
  artworkErrorMessage,
  fetchArtwork,
  fetchFirstArtwork,
  libretroSystemOf,
  loadArtworkIndex,
  saveArtworkChoice,
  searchArtworkMatches,
  type ArtworkFile,
} from "../lib/artworkSource.ts";
import { saveImage } from "../lib/backend.ts";
import { cleanTitle, stem } from "../lib/rom.ts";
import type {
  ArtworkEntry,
  ArtworkMatch,
  Game,
  ImageStatus,
  NewGameDraft,
  System,
} from "../lib/types.ts";

type UseArtworkSearchOptions = {
  selected: System | null;
  games: Game[];
  onError: (message: string) => void;
  /** Tras la búsqueda masiva: refrescar la lista del sistema. */
  onBatchFinished: (system: System, found: number, total: number) => Promise<void>;
};

const SEARCH_WORKERS = 6;

/** Ejecuta `task` sobre `items` con concurrencia limitada. */
async function runConcurrently<T>(
  items: T[],
  task: (item: T) => Promise<void>,
  shouldStop: () => boolean = () => false,
) {
  let next = 0;
  await Promise.all(
    Array.from({ length: SEARCH_WORKERS }, async () => {
      while (next < items.length) {
        if (shouldStop()) return;
        await task(items[next++]);
      }
    }),
  );
}

/** Búsqueda de carátulas: modal de un juego, juegos nuevos y faltantes en bloque. */
export function useArtworkSearch({
  selected,
  games,
  onError,
  onBatchFinished,
}: UseArtworkSearchOptions) {
  const [imageBytes, setImageBytes] = useState<number[] | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageStatus, setImageStatus] = useState<ImageStatus>("idle");
  const [artworkMatches, setArtworkMatches] = useState<ArtworkMatch[]>([]);
  const [artworkProgress, setArtworkProgress] = useState("");
  const [artworkWarning, setArtworkWarning] = useState("");
  const [markedNoCover, setMarkedNoCover] = useState<string[]>([]);
  const [batchProgress, setBatchProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const batchCancel = useRef(false);

  function resetArtwork() {
    setImageBytes(null);
    setImagePreview("");
    setImageStatus("idle");
    setArtworkMatches([]);
    setArtworkProgress("");
    setArtworkWarning("");
  }

  function showFoundArtwork({ blob, bytes }: ArtworkFile) {
    setImageBytes(bytes);
    setImagePreview(URL.createObjectURL(blob));
    setImageStatus("found");
    setArtworkProgress("");
  }

  async function selectImage(file: File) {
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    setImageBytes(bytes);
    setImagePreview(URL.createObjectURL(file));
    setImageStatus("idle");
  }

  async function previewArtworkMatch(match: ArtworkMatch, fileName: string) {
    if (!selected) return;
    const libretroSystem = libretroSystemOf(selected);
    setImageStatus("searching");
    setArtworkProgress(`Cargando ${match.name}…`);
    const file = await fetchArtwork(libretroSystem, {
      category: categoryOfPath(match.path),
      name: match.name,
    });
    await saveImage(selected.path, fileName, file.bytes);
    setImageBytes(file.bytes);
    setImagePreview(URL.createObjectURL(file.blob));
    setImageStatus("found");
    saveArtworkChoice(libretroSystem, fileName, match);
    setArtworkProgress("");
  }

  async function searchArtwork(gameTitle: string, fileName: string) {
    setImageStatus("searching");
    setImageBytes(null);
    setImagePreview("");
    setArtworkMatches([]);
    setArtworkWarning("");
    setArtworkProgress("Preparando índice…");
    try {
      const libretroSystem = selected ? libretroSystemOf(selected) : "";
      let files: ArtworkEntry[] = [];
      try {
        files = await loadArtworkIndex(libretroSystem, setArtworkWarning);
      } catch (indexError) {
        setArtworkWarning(
          `${artworkErrorMessage(indexError)} Se busca por nombre exacto.`,
        );
      }

      const original = stem(fileName);
      const matches = await searchArtworkMatches(
        libretroSystem,
        files,
        uniqueQueries([findAlias(original), gameTitle, original]),
        fileName,
      );

      if (!matches.length) {
        const file = await fetchFirstArtwork(
          libretroSystem,
          exactArtworkTargets(files, [original, gameTitle]),
        );
        if (file) {
          if (selected) await saveImage(selected.path, fileName, file.bytes);
          showFoundArtwork(file);
        } else {
          setImageStatus("missing");
          setArtworkProgress("");
        }
        return;
      }

      setArtworkMatches(matches);
      const automatic = pickAutomaticMatch(matches);
      if (automatic) {
        await previewArtworkMatch(automatic, fileName);
      } else {
        setImageStatus("idle");
        setArtworkProgress("");
      }
    } catch (e) {
      setImageStatus("missing");
      setArtworkProgress("");
      onError(artworkErrorMessage(e));
    }
  }

  async function chooseArtwork(match: ArtworkMatch, fileName: string) {
    try {
      await previewArtworkMatch(match, fileName);
    } catch (e) {
      onError(artworkErrorMessage(e));
      setImageStatus("missing");
    }
  }

  async function loadDraftIndex(libretroSystem: string) {
    try {
      return await loadArtworkIndex(libretroSystem, setArtworkWarning);
    } catch (indexError) {
      setArtworkWarning(artworkErrorMessage(indexError));
      return [];
    }
  }

  async function coverForDraft(
    draft: NewGameDraft,
    libretroSystem: string,
    files: ArtworkEntry[],
    updateDraft: (patch: Partial<NewGameDraft>) => void,
  ) {
    const showCover = ({ blob, bytes }: ArtworkFile) =>
      updateDraft({
        imageBytes: bytes,
        imagePreview: URL.createObjectURL(blob),
        imageStatus: "found",
        searching: false,
        error: "",
      });
    try {
      const original = stem(draft.fileName);
      const matches = await searchArtworkMatches(
        libretroSystem,
        files,
        uniqueQueries([
          findAlias(original),
          draft.title || cleanTitle(draft.fileName),
          original,
        ]),
        draft.fileName,
      );

      if (!matches.length) {
        const file = await fetchFirstArtwork(
          libretroSystem,
          exactArtworkTargets([], [original, draft.title]),
        );
        if (file) showCover(file);
        else
          updateDraft({
            searching: false,
            imageStatus: "missing",
            error: "Sin coincidencias.",
          });
        return;
      }

      const automatic = pickAutomaticMatch(matches) ?? matches[0];
      showCover(
        await fetchArtwork(libretroSystem, {
          category: categoryOfPath(automatic.path),
          name: automatic.name,
        }),
      );
    } catch (e) {
      updateDraft({
        searching: false,
        imageStatus: "missing",
        error: artworkErrorMessage(e),
      });
    }
  }

  async function searchDraftCover(
    draft: NewGameDraft,
    updateDraft: (patch: Partial<NewGameDraft>) => void,
  ) {
    if (!selected) return;
    updateDraft({ searching: true, error: "", imageStatus: "searching" });
    const libretroSystem = libretroSystemOf(selected);
    const files = await loadDraftIndex(libretroSystem);
    await coverForDraft(draft, libretroSystem, files, updateDraft);
  }

  /** Busca a la vez los juegos sin carátula; el índice se pide una sola vez. */
  async function searchAllDraftCovers(
    drafts: NewGameDraft[],
    updateDraft: (id: string, patch: Partial<NewGameDraft>) => void,
  ) {
    if (!selected) return;
    const pending = drafts.filter(
      (draft) => !draft.imageBytes && !draft.searching,
    );
    if (!pending.length) return;
    for (const draft of pending) {
      updateDraft(draft.id, {
        searching: true,
        error: "",
        imageStatus: "searching",
      });
    }
    const libretroSystem = libretroSystemOf(selected);
    const files = await loadDraftIndex(libretroSystem);
    await runConcurrently(pending, (draft) =>
      coverForDraft(draft, libretroSystem, files, (patch) =>
        updateDraft(draft.id, patch),
      ),
    );
  }

  async function searchMissingCovers() {
    if (!selected) return;
    batchCancel.current = false;
    const missing = games.filter(
      (game) => !game.hasImage && !markedNoCover.includes(game.fileName),
    );
    setBatchProgress({ done: 0, total: missing.length });
    const libretroSystem = libretroSystemOf(selected);

    // El índice se carga una vez para todos los juegos: antes cada worker lo pedía.
    let files: ArtworkEntry[] = [];
    try {
      files = await loadArtworkIndex(libretroSystem, setArtworkWarning);
    } catch {
      // sin índice se intenta la ruta exacta juego por juego
    }

    let found = 0;
    const work = runConcurrently(
      missing,
      async (game) => {
        try {
          const target = files.length
            ? pickBatchMatch(files, game.fileName, findAlias(game.fileName))
            : null;
          const file = await fetchFirstArtwork(
            libretroSystem,
            files.length
              ? target
                ? [target]
                : []
              : exactArtworkTargets([], [stem(game.fileName)]),
          );
          if (file) {
            await saveImage(selected.path, game.fileName, file.bytes);
            found += 1;
          }
        } catch {
          // un juego sin resultado no detiene la búsqueda del resto
        }
        setBatchProgress((value) =>
          value ? { ...value, done: value.done + 1 } : value,
        );
      },
      () => batchCancel.current,
    );

    try {
      await work;
      await onBatchFinished(selected, found, missing.length);
    } finally {
      setBatchProgress(null);
    }
  }

  function markNoCover(fileName?: string) {
    if (fileName) {
      setMarkedNoCover((items) => Array.from(new Set([...items, fileName])));
    }
    setArtworkMatches([]);
    setImageBytes(null);
    setImagePreview("");
    setImageStatus("missing");
  }

  function clearNoCover(fileName: string) {
    setMarkedNoCover((items) => items.filter((item) => item !== fileName));
  }

  return {
    imageBytes,
    imagePreview,
    imageStatus,
    artworkMatches,
    artworkProgress,
    artworkWarning,
    markedNoCover,
    batchProgress,
    resetArtwork,
    selectImage,
    searchArtwork,
    chooseArtwork,
    searchDraftCover,
    searchAllDraftCovers,
    searchMissingCovers,
    markNoCover,
    clearNoCover,
    cancelBatch: () => {
      batchCancel.current = true;
    },
    clearBatchProgress: () => setBatchProgress(null),
  };
}
