import { useMemo, useState } from "react";
import { ListOrdered, LoaderCircle } from "lucide-react";
import { ModalBackdrop, ModalHeader } from "./ui/Modal.tsx";
import { Button } from "./ui/Button.tsx";
import { Segmented } from "./ui/Segmented.tsx";
import {
  organizeGames,
  type GameGroup,
  type OrganizeMode,
  type SagaOverrides,
} from "../lib/sagas.ts";
import type { Game } from "../lib/types.ts";

const MODE_OPTIONS = [
  { value: "alpha", label: "Alfabético" },
  { value: "saga", label: "Por sagas" },
] as const;

type OrganizeModalProps = {
  systemName: string;
  games: Game[];
  overrides: SagaOverrides;
  saving: boolean;
  onClose: () => void;
  onApply: (groups: GameGroup<Game>[]) => void;
};

export function OrganizeModal(props: OrganizeModalProps) {
  const [mode, setMode] = useState<OrganizeMode>("saga");
  const groups = useMemo(
    () => organizeGames(props.games, mode, props.overrides),
    [props.games, mode, props.overrides],
  );
  const sagaCount = groups.filter((group) => group.saga).length;
  let position = 0;

  return (
    <ModalBackdrop onClose={props.onClose}>
      <section className="modal modal-wide organize-modal">
        <ModalHeader
          eyebrow="ORDEN EN LA CONSOLA"
          title={`Organizar ${props.systemName}`}
          subtitle="La consola muestra los juegos en el orden de filelist.csv. Revisa la vista previa y aplícala."
          onClose={props.onClose}
        />

        <div className="modal-body">
          <div className="organize-controls">
            <Segmented label="Tipo de orden" value={mode} options={MODE_OPTIONS} onChange={setMode} />
            {mode === "saga" && (
              <span>
                {sagaCount === 1 ? "1 saga detectada" : `${sagaCount} sagas detectadas`}
              </span>
            )}
          </div>

          <ol className="organize-preview">
            {groups.map((group) =>
              group.saga ? (
                <li key={`saga-${group.saga}`} className="organize-group">
                  <strong>
                    {group.saga}
                    <span className="organize-count">{group.games.length}</span>
                  </strong>
                  <ol>
                    {group.games.map((game) => (
                      <li key={game.fileName}>
                        <span className="organize-position">{++position}</span>
                        <span>{game.title}</span>
                      </li>
                    ))}
                  </ol>
                </li>
              ) : (
                <li key={group.games[0].fileName}>
                  <span className="organize-position">{++position}</span>
                  <span>{group.games[0].title}</span>
                </li>
              ),
            )}
          </ol>
        </div>

        <div className="modal-footer">
          <span>Se guarda una copia en filelist.csv.bak</span>
          <Button
            variant="primary"
            onClick={() => props.onApply(groups)}
            disabled={props.saving || !props.games.length}
          >
            {props.saving ? <LoaderCircle size={15} className="spin" /> : <ListOrdered size={15} />}
            Aplicar a la consola
          </Button>
        </div>
      </section>
    </ModalBackdrop>
  );
}
