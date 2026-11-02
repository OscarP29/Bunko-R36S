import { useMemo, useState } from "react";
import type { Filter, Game, SortBy, ViewMode } from "../lib/types.ts";

/** Estado de vista de la biblioteca; vive fuera de la página para sobrevivir al cambio de pestaña. */
export function useLibraryView(games: Game[], isFavorite: (game: Game) => boolean) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const visibleGames = useMemo(
    () =>
      games
        .filter((game) => {
          const query = search.toLowerCase();
          const matches =
            game.title.toLowerCase().includes(query) ||
            game.fileName.toLowerCase().includes(query);
          if (!matches) return false;
          if (filter === "missing") return !game.hasImage;
          if (filter === "favorites") return isFavorite(game);
          return true;
        })
        .sort((a, b) =>
          // `console` conserva el orden de filelist.csv, que es el de la consola.
          sortBy === "console"
            ? 0
            : sortBy === "name"
              ? a.title.localeCompare(b.title, "es", { sensitivity: "base" })
              : a.fileName.localeCompare(b.fileName, "es", {
                  sensitivity: "base",
                }),
        ),
    [games, search, filter, sortBy, isFavorite],
  );

  const favoriteCount = useMemo(
    () => games.filter(isFavorite).length,
    [games, isFavorite],
  );

  function resetFilters() {
    setSearch("");
    setFilter("all");
  }

  return {
    search,
    setSearch,
    filter,
    setFilter,
    sortBy,
    setSortBy,
    viewMode,
    setViewMode,
    visibleGames,
    favoriteCount,
    resetFilters,
  };
}

export type LibraryView = ReturnType<typeof useLibraryView>;
