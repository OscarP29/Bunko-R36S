import type { ReactNode } from "react";

export type ChipTone =
  | "neutral"
  | "category"
  | "system"
  | "folder"
  | "gap"
  | "alta"
  | "media"
  | "baja";

type ChipProps = {
  tone?: ChipTone;
  /** Mayúsculas con espaciado, el formato de las tarjetas de pendientes. */
  caps?: boolean;
  children: ReactNode;
};

export function Chip({ tone = "neutral", caps = false, children }: ChipProps) {
  return (
    <span className={`chip ${tone} ${caps ? "caps" : ""}`.trim()}>
      {children}
    </span>
  );
}
