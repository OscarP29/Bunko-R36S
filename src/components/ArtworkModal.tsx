import { useRef } from "react";
import {
  AlertCircle,
  Check,
  ChevronRight,
  Gamepad2,
  Image as ImageIcon,
  LoaderCircle,
  Sparkles,
  X,
} from "lucide-react";
import type { ArtworkMatch, Game, ImageStatus } from "../lib/types.ts";
import { Button } from "./ui/Button.tsx";
import { fileUrl } from "../lib/format.ts";
import { ModalBackdrop, ModalHeader } from "./ui/Modal.tsx";

type ArtworkModalProps = {
  game: Game | null;
  imagePreview: string;
  imageStatus: ImageStatus;
  imageBytes: number[] | null;
  progress: string;
  warning: string;
  matches: ArtworkMatch[];
  loading: boolean;
  onClose: () => void;
  onSearch: () => void;
  onChooseMatch: (match: ArtworkMatch) => void;
  onSelectImage: (file: File) => void;
  onSave: () => void;
  onMarkNoCover: () => void;
};

export function ArtworkModal(props: ArtworkModalProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const searching = props.imageStatus === "searching";

  return (
    <ModalBackdrop onClose={props.onClose}>
      <section className="modal">
        <ModalHeader
          eyebrow="PERSONALIZA TU CATÁLOGO"
          title="Carátula del juego"
          onClose={props.onClose}
        />

        <div className="modal-body">
          <div className="target-game">
            <div className="target-cover">
              {props.game?.imagePath ? (
                <img src={fileUrl(props.game.imagePath, props.game.imageVersion)} alt="" />
              ) : (
                <Gamepad2 size={20} />
              )}
            </div>
            <div>
              <span>JUEGO SELECCIONADO</span>
              <strong>{props.game?.title}</strong>
            </div>
          </div>

          <div className="artwork-search-card">
            <div className="search-art-icon">
              <Sparkles size={17} />
            </div>
            <div>
              <strong>Buscar en Libretro Thumbnails</strong>
              <span>Carátulas PNG de la comunidad para tu consola</span>
            </div>
            <Button onClick={props.onSearch} disabled={searching}>
              {searching ? <LoaderCircle size={14} className="spin" /> : "Buscar"}
            </Button>
          </div>

          {props.warning && (
            <div className="inline-info">
              <AlertCircle size={14} />
              {props.warning}
            </div>
          )}

          {props.progress && (
            <div className="inline-info">
              <LoaderCircle size={14} className="spin" />
              {props.progress}
            </div>
          )}

          {props.matches.length > 1 && (
            <div className="candidate-list">
              <div className="field-label">VARIAS COINCIDENCIAS · ELIGE UNA</div>
              {props.matches.map((match) => (
                <button key={match.path} onClick={() => props.onChooseMatch(match)}>
                  <span>{match.name}</span>
                  <small>
                    {Math.round((1 - match.score) * 100)}% ·{" "}
                    {match.name.match(/\(([^)]*)\)/)?.[1] || "Otra región"}
                  </small>
                </button>
              ))}
            </div>
          )}

          {props.imagePreview ? (
            <div className="artwork-large-preview">
              <img src={props.imagePreview} alt="Carátula seleccionada" />
              <div>
                <strong>
                  {props.imageStatus === "found" ? "Carátula encontrada" : "Vista previa"}
                  <span className="found-badge">
                    <Check size={11} /> Lista
                  </span>
                </strong>
                <span>Se redimensionará a 512 × 512 px y se guardará en images/.</span>
              </div>
            </div>
          ) : (
            <button
              className="image-drop image-drop-large"
              onClick={() => fileInput.current?.click()}
            >
              <ImageIcon size={18} />
              <span>
                {props.imageStatus === "missing"
                  ? "Sin resultados. Sube una imagen desde tu equipo."
                  : "O selecciona una imagen desde tu equipo"}
              </span>
              <ChevronRight size={15} />
            </button>
          )}

          <input
            type="file"
            ref={fileInput}
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) props.onSelectImage(file);
              event.target.value = "";
            }}
          />

          {props.imageStatus === "missing" && (
            <div className="inline-info">
              <AlertCircle size={14} /> No hay una coincidencia exacta en Libretro. Puedes añadir
              una imagen manualmente.
            </div>
          )}

          <Button variant="text" className="no-cover-button" onClick={props.onMarkNoCover}>
            <X size={13} /> Marcar como sin carátula
          </Button>

          <div className="modal-footer">
            <span>
              <ImageIcon size={14} /> Formato PNG · 512 × 512 px
            </span>
            <Button
              variant="primary"
              disabled={!props.imageBytes || props.loading}
              onClick={props.onSave}
            >
              {props.loading ? <LoaderCircle size={15} className="spin" /> : <Check size={16} />}{" "}
              Guardar carátula
            </Button>
          </div>
        </div>
      </section>
    </ModalBackdrop>
  );
}
