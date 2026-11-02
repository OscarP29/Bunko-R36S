import { useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { ModalBackdrop, ModalHeader } from "./ui/Modal.tsx";
import { Button } from "./ui/Button.tsx";
import { Field } from "./ui/Field.tsx";
import { Segmented } from "./ui/Segmented.tsx";
import { autoSaga } from "../lib/sagas.ts";
import type { Game } from "../lib/types.ts";

type SagaMode = "auto" | "custom" | "none";

const SAGA_OPTIONS = [
  { value: "auto", label: "Automática" },
  { value: "custom", label: "Elegir" },
  { value: "none", label: "Sin saga" },
] as const;

type EditGameModalProps = {
  game: Game;
  /** Saga elegida a mano: `undefined` = automática, `""` = sin saga. */
  saga: string | undefined;
  /** Sagas ya usadas en el sistema, para sugerirlas. */
  knownSagas: string[];
  saving: boolean;
  onClose: () => void;
  onSave: (title: string, saga: string | undefined) => void;
};

export function EditGameModal(props: EditGameModalProps) {
  const [title, setTitle] = useState(props.game.title);
  const [mode, setMode] = useState<SagaMode>(
    props.saga === undefined ? "auto" : props.saga ? "custom" : "none",
  );
  const [customSaga, setCustomSaga] = useState(props.saga ?? "");
  const suggested = autoSaga(title);
  const valid = title.trim() && (mode !== "custom" || customSaga.trim());

  function save() {
    if (!valid) return;
    const saga = mode === "auto" ? undefined : mode === "none" ? "" : customSaga.trim();
    props.onSave(title.trim(), saga);
  }

  return (
    <ModalBackdrop onClose={props.onClose}>
      <form
        className="modal"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <ModalHeader
          eyebrow="PERSONALIZA TU CATÁLOGO"
          title="Editar juego"
          subtitle={props.game.fileName}
          onClose={props.onClose}
        />

        <div className="modal-body edit-game-body">
          <Field label="Nombre en la consola">
            <input
              className="text-field"
              value={title}
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>

          <div className="edit-game-saga">
            <span className="field-label">Saga</span>
            <Segmented label="Saga" value={mode} options={SAGA_OPTIONS} onChange={setMode} />
            {mode === "auto" && (
              <p>{suggested ? `Se agrupará en «${suggested}».` : "No se reconoce ninguna saga."}</p>
            )}
            {mode === "custom" && (
              <>
                <input
                  className="text-field"
                  aria-label="Nombre de la saga"
                  list="known-sagas"
                  value={customSaga}
                  placeholder={suggested ?? "Nombre de la saga"}
                  onChange={(event) => setCustomSaga(event.target.value)}
                />
                <datalist id="known-sagas">
                  {props.knownSagas.map((saga) => (
                    <option key={saga} value={saga} />
                  ))}
                </datalist>
              </>
            )}
            {mode === "none" && <p>Se ordenará solo por su nombre.</p>}
          </div>
        </div>

        <div className="modal-footer">
          <Button type="button" onClick={props.onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" disabled={!valid || props.saving}>
            {props.saving ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
            Guardar
          </Button>
        </div>
      </form>
    </ModalBackdrop>
  );
}
