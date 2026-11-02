import { useEffect, useMemo, useState } from "react";
import { History, LoaderCircle } from "lucide-react";
import { ModalBackdrop, ModalHeader } from "./ui/Modal.tsx";
import { Button } from "./ui/Button.tsx";
import { Field } from "./ui/Field.tsx";
import { Skeleton } from "./ui/Skeleton.tsx";
import { SaveChecklist, type ChecklistItem } from "./SaveChecklist.tsx";
import type { BackupInfo } from "../lib/backend.ts";

const KIND_LABELS: Record<BackupInfo["kind"], string> = {
  partidas: "Copia",
  sobrantes: "Sobrantes",
  "antes-de-restaurar": "Antes de restaurar",
};

/** `partidas-2026-11-02_1530` → «Copia del 2026-11-02 a las 15:30». */
export function describeBackup(backup: BackupInfo) {
  const match = backup.label.match(/(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})$/);
  const when = match ? `del ${match[1]} a las ${match[2]}:${match[3]}` : backup.label;
  return `${KIND_LABELS[backup.kind] ?? "Copia"} ${when}`;
}

type RestoreModalProps = {
  cardName: string;
  loadBackups: () => Promise<BackupInfo[]>;
  busy: boolean;
  onClose: () => void;
  onRestore: (folder: string, files: string[]) => void;
};

/** Devolver a la consola partidas de una copia de esta misma tarjeta. */
export function RestoreModal(props: RestoreModalProps) {
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const [folder, setFolder] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    props
      .loadBackups()
      .then((list) => {
        setBackups(list);
        if (list[0]) choose(list[0]);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const backup = backups?.find((item) => item.folder === folder);
  const items: ChecklistItem[] = useMemo(
    () =>
      (backup?.files ?? []).map((file) => ({
        ...file,
        disabled: !file.onCard,
        note: !file.onCard
          ? "El juego ya no está en la tarjeta"
          : file.replaces
            ? "Reemplaza la partida actual"
            : undefined,
      })),
    [backup],
  );
  const replacing = (backup?.files ?? []).filter(
    (file) => file.onCard && file.replaces && selected.has(file.relative),
  ).length;

  function choose(next: BackupInfo) {
    setFolder(next.folder);
    setSelected(new Set(next.files.filter((file) => file.onCard).map((file) => file.relative)));
  }

  function restore() {
    if (!backup) return;
    if (
      replacing &&
      !confirm(
        `Se reemplazarán ${replacing} partidas de la consola. Las actuales se guardarán antes en el PC, en «Antes de restaurar».`,
      )
    )
      return;
    props.onRestore(backup.folder, [...selected]);
  }

  return (
    <ModalBackdrop onClose={props.onClose}>
      <section className="modal modal-wide saves-modal">
        <ModalHeader
          eyebrow="COPIA DE SEGURIDAD"
          title="Restaurar partidas"
          subtitle={`Solo se muestran las copias de ${props.cardName}.`}
          onClose={props.onClose}
        />

        <div className="modal-body restore-body">
          {error ? (
            <p className="settings-result is-error">{error}</p>
          ) : !backups ? (
            <div className="skeleton-stack" role="status" aria-label="Cargando copias">
              <Skeleton />
              <Skeleton />
              <Skeleton shape="line short" />
            </div>
          ) : !backups.length ? (
            <p className="save-checklist-empty">
              Todavía no hay copias de esta consola. Usa «Copiar partidas» para crear la primera.
            </p>
          ) : (
            <>
              <Field label="Copia">
                <select
                  className="text-field"
                  value={folder}
                  onChange={(event) => {
                    const next = backups.find((item) => item.folder === event.target.value);
                    if (next) choose(next);
                  }}
                >
                  {backups.map((item) => (
                    <option key={item.folder} value={item.folder}>
                      {describeBackup(item)}
                    </option>
                  ))}
                </select>
              </Field>
              <SaveChecklist items={items} selected={selected} onChange={setSelected} />
            </>
          )}
        </div>

        <div className="modal-footer">
          <Button onClick={props.onClose}>Cancelar</Button>
          <Button
            variant="primary"
            onClick={restore}
            disabled={!selected.size || props.busy}
          >
            {props.busy ? <LoaderCircle size={15} className="spin" /> : <History size={15} />}
            Restaurar {selected.size} {selected.size === 1 ? "partida" : "partidas"}
          </Button>
        </div>
      </section>
    </ModalBackdrop>
  );
}
