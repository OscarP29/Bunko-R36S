type SegmentedOption<T> = {
  value: T;
  label: string;
  count?: number;
};

type SegmentedProps<T> = {
  /** Describe el grupo para lectores de pantalla. */
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
};

/** Selector de una opción entre pocas, siempre visibles. */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div className="filter-group segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? "filter-active" : ""}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && <> <span>{option.count}</span></>}
        </button>
      ))}
    </div>
  );
}
