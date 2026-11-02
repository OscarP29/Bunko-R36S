import {
  AlertCircle,
  ArrowUpDown,
  CheckCircle2,
  ChevronRight,
  Disc3,
  FolderOpen,
  Gamepad2,
  HardDrive,
  Image as ImageIcon,
  LayoutGrid,
  ListOrdered,
  LoaderCircle,
  Plus,
  Search,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { Button } from "../components/ui/Button.tsx";
import { GameCard } from "../components/GameCard.tsx";
import { Skeleton } from "../components/ui/Skeleton.tsx";
import type { LibraryView } from "../hooks/useLibraryView.ts";
import { formatSize } from "../lib/format.ts";
import type { Game, SortBy, System, ViewMode } from "../lib/types.ts";

const SORT_LABELS: Record<SortBy, string> = {
  name: "Nombre",
  file: "Archivo",
  console: "Orden de la consola",
};

const NEXT_SORT: Record<SortBy, SortBy> = {
  name: "file",
  file: "console",
  console: "name",
};

function GamesSkeleton({ viewMode }: { viewMode: ViewMode }) {
  return (
    <div
      className={`games-grid ${viewMode === "list" ? "list-mode" : ""}`}
      role="status"
      aria-label="Cargando juegos"
    >
      {Array.from({ length: 10 }, (_, index) => (
        <article className="game-card" key={index}>
          <div className="game-cover">
            <Skeleton shape="fill" />
          </div>
          <div className="game-info skeleton-stack">
            <Skeleton />
            <Skeleton shape="line short" />
          </div>
        </article>
      ))}
    </div>
  );
}

type LibraryPageProps = {
  view: LibraryView;
  root: string;
  systems: System[];
  selected: System | null;
  totalGames: number;
  error: string;
  loadingSystems: boolean;
  loadingGames: boolean;
  batchProgress: { done: number; total: number } | null;
  markedNoCover: string[];
  isFavorite: (game: Game) => boolean;
  onChooseRoot: () => void;
  onOpenFolder: (path: string) => void;
  onAddGame: () => void;
  onDismissError: () => void;
  onSearchMissingCovers: () => void;
  onChangeImage: (game: Game) => void;
  onEditGame: (game: Game) => void;
  onOrganize: () => void;
  onRemoveGame: (game: Game) => void;
};

export function LibraryPage({
  view,
  root,
  systems,
  selected,
  totalGames,
  error,
  loadingSystems,
  loadingGames,
  batchProgress,
  markedNoCover,
  isFavorite,
  onChooseRoot,
  onOpenFolder,
  onAddGame,
  onDismissError,
  onSearchMissingCovers,
  onChangeImage,
  onEditGame,
  onOrganize,
  onRemoveGame,
}: LibraryPageProps) {
  const {
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
  } = view;
  const noImageTotal = systems.reduce(
    (total, system) => total + system.missingImages,
    0,
  );

  return (
      <div className="content">
        {!root ? (
          <section className="welcome-card">
            <div className="welcome-orb">
              <Disc3 size={42} />
            </div>
            <span className="eyebrow">TU CONSOLA, A TU MANERA</span>
            <h1>
              Todo tu catálogo.
              <br />
              <em>En un solo lugar.</em>
            </h1>
            <p>
              Conecta la microSD de tu R36S para organizar juegos, carátulas
              y tu próxima lista de partidas.
            </p>
            <Button variant="primary" onClick={onChooseRoot}>
              <FolderOpen size={16} /> Elegir carpeta ROMS{" "}
              <ChevronRight size={15} />
            </Button>
            <div className="welcome-note">
              <CheckCircle2 size={15} /> Tus archivos se quedan en la
              tarjeta
            </div>
          </section>
        ) : (
          <>
            <section className="page-heading">
              <div>
                <div className="eyebrow">
                  BIBLIOTECA DE JUEGOS <span className="eyebrow-line" />
                </div>
                <h1>
                  {selected?.name || "Tu colección"}
                  <span className="heading-period">.</span>
                </h1>
                <p>
                  {selected
                    ? `Explora y organiza tus juegos de ${selected.name}.`
                    : "Selecciona un emulador para ver sus juegos."}
                </p>
              </div>
              <div className="heading-actions">
                {selected && (
                  <Button
                    onClick={() => onOpenFolder(selected.path)}
                  >
                    <FolderOpen size={14} /> Abrir emulador
                  </Button>
                )}
                {selected && (
                  <Button onClick={onOrganize} disabled={!selected.gameCount}>
                    <ListOrdered size={14} /> Organizar
                  </Button>
                )}
                <Button
                  variant="primary"
                  className="add-button"
                  onClick={onAddGame}
                  disabled={!selected}
                >
                  <Plus size={17} /> Añadir juego
                </Button>
              </div>
            </section>

            {loadingSystems ? (
              <div className="stats-row" role="status" aria-label="Cargando biblioteca">
                {[0, 1, 2].map((index) => (
                  <div className="stat-card" key={index}>
                    <div className="skeleton-stack">
                      <Skeleton />
                      <Skeleton shape="title" />
                      <Skeleton shape="line short" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <section className="stats-row">
                <div className="stat-card">
                  <div className="stat-icon purple">
                    <Gamepad2 size={17} />
                  </div>
                  <div>
                    <span>JUEGOS EN TOTAL</span>
                    <strong>{formatSize(totalGames)}</strong>
                    <small>en {systems.length} sistemas</small>
                  </div>
                  <div className="stat-spark">✦─✦╰✦╯✦</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon teal">
                    <ImageIcon size={17} />
                  </div>
                  <div>
                    <span>CARÁTULAS PENDIENTES</span>
                    <strong>{formatSize(noImageTotal)}</strong>
                    <small>
                      {noImageTotal
                        ? "Algunos juegos esperan imagen"
                        : "Toda la colección tiene imagen"}
                    </small>
                  </div>
                  <div className="stat-status">
                    <span />
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon amber">
                    <HardDrive size={17} />
                  </div>
                  <div>
                    <span>SISTEMAS DETECTADOS</span>
                    <strong>{systems.length}</strong>
                    <small>carpetas de emuladores</small>
                  </div>
                  <div className="stat-device">
                    <Disc3 size={29} />
                  </div>
                </div>
              </section>
            )}

            {error && (
              <div className="error-banner">
                <AlertCircle size={16} />
                <span>{error}</span>
                <button onClick={onDismissError}>
                  <X size={15} />
                </button>
              </div>
            )}

            {loadingSystems ? (
              <GamesSkeleton viewMode={viewMode} />
            ) : !systems.length ? (
              <div className="no-systems">
                <Gamepad2 size={25} />
                <div>
                  <strong>Sin emuladores todavía</strong>
                  <span>
                    Elige la carpeta que contiene las carpetas de tus
                    sistemas.
                  </span>
                </div>
                <Button onClick={onChooseRoot}>
                  Elegir otra carpeta
                </Button>
              </div>
            ) : (
              <>
                <div className="toolbar">
                  <div className="search-box">
                    <Search size={16} />
                    <input
                      placeholder="Buscar un juego..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                    <kbd>Ctrl F</kbd>
                  </div>
                  <div className="filter-group">
                    <button
                      className={filter === "all" ? "filter-active" : ""}
                      onClick={() => setFilter("all")}
                    >
                      Todos <span>{selected?.gameCount ?? 0}</span>
                    </button>
                    <button
                      className={
                        filter === "missing" ? "filter-active" : ""
                      }
                      onClick={() => setFilter("missing")}
                    >
                      <span className="mini-dot" />
                      Sin carátula{" "}
                      <span>{selected?.missingImages ?? 0}</span>
                    </button>
                    {favoriteCount > 0 && (
                      <button
                        className={filter === "favorites" ? "filter-active" : ""}
                        onClick={() => setFilter("favorites")}
                      >
                        <Star size={12} />
                        Favoritos <span>{favoriteCount}</span>
                      </button>
                    )}
                  </div>
                  <Button
                    className="sort-button"
                    onClick={() => setSortBy((value) => NEXT_SORT[value])}
                    title="Cambiar orden"
                  >
                    <ArrowUpDown size={13} />
                    {SORT_LABELS[sortBy]}
                  </Button>
                  <Button
                    className="view-toggle"
                    onClick={() =>
                      setViewMode((value) =>
                        value === "grid" ? "list" : "grid",
                      )
                    }
                    title="Cambiar vista"
                  >
                    <LayoutGrid size={13} />
                    {viewMode === "grid" ? "Cuadrícula" : "Lista"}
                  </Button>
                  <div className="view-label">
                    {formatSize(visibleGames.length)} juegos
                  </div>
                  <Button
                    onClick={onSearchMissingCovers}
                    disabled={Boolean(batchProgress) || !noImageTotal}
                  >
                    <Sparkles size={13} /> Buscar faltantes
                  </Button>
                </div>

                {batchProgress && (
                  <div className="batch-progress">
                    <span>
                      <LoaderCircle size={14} className="spin" /> Buscando
                      carátulas: {batchProgress.done} de{" "}
                      {batchProgress.total}
                    </span>
                    <div>
                      <i
                        style={{
                          width: `${
                            batchProgress.total
                              ? (batchProgress.done / batchProgress.total) *
                                100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {loadingGames ? (
                  <GamesSkeleton viewMode={viewMode} />
                ) : (
                  <div
                    className={`games-grid ${viewMode === "list" ? "list-mode" : ""}`}
                  >
                    {visibleGames.map((game) => (
                      <GameCard
                        key={game.id}
                        game={game}
                        onImage={() => onChangeImage(game)}
                        onEdit={() => onEditGame(game)}
                        favorite={isFavorite(game)}
                        onRemove={() => onRemoveGame(game)}
                        markedNoCover={markedNoCover.includes(game.fileName)}
                      />
                    ))}
                  </div>
                )}

                {!loadingGames && !visibleGames.length && (
                  <div className="empty-state">
                    <div>
                      <Search size={20} />
                    </div>
                    <strong>No hay juegos para mostrar</strong>
                    <span>
                      {filter === "missing"
                        ? "¡Todos los juegos de este sistema tienen carátula!"
                        : "Prueba otra búsqueda o añade un juego a tu colección."}
                    </span>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
  );
}
