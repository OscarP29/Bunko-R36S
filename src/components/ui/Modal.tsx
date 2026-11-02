import type { ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "./Button.tsx";

type ModalBackdropProps = {
  className?: string;
  onClose: () => void;
  children: ReactNode;
};

/** Fondo del modal: cierra al pulsar fuera del contenido. */
export function ModalBackdrop({
  className = "",
  onClose,
  children,
}: ModalBackdropProps) {
  return (
    <div
      className={`modal-backdrop ${className}`.trim()}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}

type ModalHeaderProps = {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  /** Con `onClose` muestra el botón de cerrar; `actions` lo sustituye. */
  onClose?: () => void;
  closeLabel?: string;
  actions?: ReactNode;
};

export function ModalHeader({
  eyebrow,
  title,
  subtitle,
  onClose,
  closeLabel = "Cerrar",
  actions,
}: ModalHeaderProps) {
  return (
    <div className="modal-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
        {subtitle && <p className="modal-subtitle">{subtitle}</p>}
      </div>
      {actions}
      {onClose && (
        <IconButton label={closeLabel} onClick={onClose}>
          <X size={17} />
        </IconButton>
      )}
    </div>
  );
}
