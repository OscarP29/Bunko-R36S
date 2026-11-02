import { useEffect, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { ModalBackdrop, ModalHeader } from "./ui/Modal.tsx";
import { Button } from "./ui/Button.tsx";
import { Skeleton } from "./ui/Skeleton.tsx";
import { SaveChecklist, type ChecklistItem } from "./SaveChecklist.tsx";
import type { SaveEntry } from "../lib/backend.ts";

type BackupModalProps = {
  cardName: string;
  loadSaves: () => Promise<SaveEntry[]>;
  busy: boolean;
  onClose: () => void;
  onBackup: (files: string[]) => void;
};

/** Elegir qué partidas de la tarjeta copiar al PC. */
export function BackupModal(props: BackupModalProps) {
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    props
      .loadSaves()
      .then((saves) => {
        setItems(saves);
        setSelected(new Set(saves.map((save) => save.relative)));
      })
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <ModalBackdrop onClose={props.onClose}>
      <section className="modal modal-wide saves-modal">
        <ModalHeader
          eyebrow="COPIA DE SEGURIDAD"
          title="Copiar partidas"
          subtitle={`Elige qué partidas de ${props.cardName} se guardan en el PC.`}
          onClose={props.onClose}
        />

        <div className="modal-body">
          {error ? (
            <p className="settings-result is-error">{error}</p>
          ) : items ? (
            <SaveChecklist items={items} selected={selected} onChange={setSelected} />
          ) : (
            <div className="skeleton-stack" role="status" aria-label="Cargando partidas">
              <Skeleton />
              <Skeleton />
              <Skeleton shape="line short" />
            </div>
          )}
        </div>

        <div className="modal-footer">
          <Button onClick={props.onClose}>Cancelar</Button>
          <Button
            variant="primary"
            onClick={() => props.onBackup([...selected])}
            disabled={!selected.size || props.busy}
          >
            {props.busy ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
            Copiar {selected.size} {selected.size === 1 ? "partida" : "partidas"}
          </Button>
        </div>
      </section>
    </ModalBackdrop>
  );
}
