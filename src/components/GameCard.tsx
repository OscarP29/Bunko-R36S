import { useState } from "react";
import { Check, Gamepad2, Image as ImageIcon, ListPlus, Pencil, Star, Trash2 } from "lucide-react";
import type { Game } from "../lib/types.ts";
import { fileUrl } from "../lib/format.ts";
import { ContextMenu } from "./ui/ContextMenu.tsx";

type GameCardProps = {
  game: Game;
  markedNoCover: boolean;
  /** Marcado como favorito en la consola. */
  favorite: boolean;
  onImage: () => void;
  onEdit: () => void;
  onRemove: () => void;
  /** Quitar del catálogo y apuntarlo en pendientes, para reemplazar una ROM mala. */
  onReplace: () => void;
};

export function GameCard({
  game,
  markedNoCover,
  favorite,
  onImage,
  onEdit,
  onRemove,
  onReplace,
}: GameCardProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  function openMenu(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();
    // Con la tecla de menú no hay coordenadas: se abre junto a la tarjeta.
    if (!event.clientX && !event.clientY) {
      const rect = event.currentTarget.getBoundingClientRect();
      setMenu({ x: rect.left + 16, y: rect.top + 16 });
    } else {
      setMenu({ x: event.clientX, y: event.clientY });
    }
  }

  return (
    <article className="game-card" onContextMenu={openMenu}>
      <div className={`game-cover ${game.hasImage ? "has-art" : "no-art"}`}>
        {game.imagePath ? (
          <img src={fileUrl(game.imagePath)} alt={`Carátula de ${game.title}`} loading="lazy" />
        ) : (
          <>
            <div className="cover-glow" />
            <Gamepad2 size={29} />
            <span>{game.title.slice(0, 1).toUpperCase()}</span>
          </>
        )}
        <div className="cover-hover">
          <button onClick={onImage}>
            <ImageIcon size={14} />
            {game.hasImage ? "Cambiar imagen" : "Añadir carátula"}
          </button>
        </div>
        {favorite && (
          <span className="favorite-badge" title="Favorito en la consola" aria-label="Favorito en la consola">
            <Star size={14} />
          </span>
        )}
        {!game.hasImage && (
          <span className="missing-badge">
            <ImageIcon size={10} /> {markedNoCover ? "Sin carátula" : "Sin imagen"}
          </span>
        )}
      </div>
      <div className="game-info">
        <div className="game-title" title={game.title}>
          {game.title}
        </div>
        <div className="game-meta">
          <span>{game.fileName.split(".").pop()?.toUpperCase()}</span>
          <span className="meta-divider" />
          {game.hasImage ? (
            <span className="meta-art">
              <Check size={11} /> Carátula
            </span>
          ) : (
            <span className="meta-missing">{markedNoCover ? "Sin carátula" : "Pendiente"}</span>
          )}

          <button
            className="edit-game"
            title="Editar nombre y saga"
            aria-label={`Editar ${game.title}`}
            onClick={onEdit}
          >
            <Pencil size={13} />
          </button>
          <button
            className="remove-game"
            title="Quitar del catálogo"
            aria-label={`Quitar ${game.title} del catálogo`}
            onClick={onRemove}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: "Editar", icon: <Pencil size={16} />, onSelect: onEdit },
            {
              label: game.hasImage ? "Cambiar imagen" : "Añadir carátula",
              icon: <ImageIcon size={16} />,
              onSelect: onImage,
            },
            { label: "Borrar", icon: <Trash2 size={16} />, danger: true, onSelect: onRemove },
            {
              label: "Borrar y añadir a pendientes",
              icon: <ListPlus size={16} />,
              danger: true,
              onSelect: onReplace,
            },
          ]}
        />
      )}
    </article>
  );
}
