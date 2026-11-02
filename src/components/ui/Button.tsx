import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "text";
};

/** Botón con texto. DESIGN.md: máximo un `primary` por vista o modal. */
export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button className={`${variant}-button ${className}`.trim()} {...props} />
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Obligatorio: se usa como `aria-label` y como tooltip. */
  label: string;
};

export function IconButton({
  label,
  className = "",
  title = label,
  ...props
}: IconButtonProps) {
  return (
    <button
      className={`icon-button ${className}`.trim()}
      aria-label={label}
      title={title}
      {...props}
    />
  );
}
