import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type ContextMenuItem = {
  label: string;
  icon?: ReactNode;
  /** Acción destructiva: va separada del resto y en rojo. */
  danger?: boolean;
  onSelect: () => void;
};

type ContextMenuProps = {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
};

/**
 * Menú flotante en la posición del clic derecho; se cierra al salir de él.
 * Se monta en `body`: dentro de una tarjeta con `transform`, `position: fixed`
 * se colocaría respecto a la tarjeta y no a la ventana.
 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menu = useRef<HTMLUListElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  // Que no se salga de la ventana.
  useLayoutEffect(() => {
    const rect = menu.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
    });
  }, [x, y]);

  useEffect(() => {
    menu.current?.querySelector("button")?.focus({ preventScroll: true });
    const close = (event: Event) => {
      if (event.target instanceof Node && menu.current?.contains(event.target)) return;
      onClose();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  function handleKeys(event: React.KeyboardEvent) {
    const buttons = Array.from(menu.current?.querySelectorAll("button") ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      buttons[(buttons.length + index + step) % buttons.length]?.focus({ preventScroll: true });
    }
  }

  return createPortal(
    <ul
      ref={menu}
      className="context-menu"
      role="menu"
      style={position}
      onKeyDown={handleKeys}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {items.map((item, index) => (
        <li
          key={item.label}
          role="none"
          className={item.danger && !items[index - 1]?.danger ? "separated" : ""}
        >
          <button
            type="button"
            role="menuitem"
            className={item.danger ? "danger" : ""}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        </li>
      ))}
    </ul>,
    document.body,
  );
}
