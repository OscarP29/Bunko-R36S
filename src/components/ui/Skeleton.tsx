type SkeletonProps = {
  /** `line`, `line short`, `title` o `fill` (ver feedback.css). */
  shape?: string;
};

/** Hueco animado mientras llega el contenido real. */
export function Skeleton({ shape = "line" }: SkeletonProps) {
  return <span className={`skeleton ${shape}`} aria-hidden="true" />;
}
