import { Check, Gamepad2, Image as ImageIcon, Trash2 } from "lucide-react";
import type { Game } from "../lib/types.ts";
import { fileUrl } from "../lib/format.ts";

type GameCardProps = {
  game: Game;
  markedNoCover: boolean;
  onImage: () => void;
  onRemove: () => void;
};

export function GameCard({ game, markedNoCover, onImage, onRemove }: GameCardProps) {
  return (
    <article className="game-card">
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
          <button className="remove-game" title="Quitar del catálogo" onClick={onRemove}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </article>
  );
}
