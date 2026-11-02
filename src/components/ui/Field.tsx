import type { ReactNode } from "react";

type FieldProps = {
  label: string;
  /** Ocupa el doble de ancho que un campo normal en una fila flexible. */
  wide?: boolean;
  children: ReactNode;
};

/** Campo con etiqueta visible; dentro va un `input` o `select` `.text-field`. */
export function Field({ label, wide = false, children }: FieldProps) {
  return (
    <label className={`field ${wide ? "field-wide" : ""}`.trim()}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
