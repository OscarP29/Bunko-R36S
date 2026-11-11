import { open } from "@tauri-apps/plugin-dialog";
import { AlertCircle, CheckCircle2, Image as ImageIcon, LoaderCircle, RotateCcw, Upload } from "lucide-react";
import { Button, IconButton } from "./ui/Button.tsx";
import { useConsoleImages } from "../hooks/useConsoleImages.ts";
import {
  consoleBackgroundPreview,
  consoleBackgrounds,
  replaceConsoleBackground,
  restoreConsoleBackground,
} from "../lib/backend.ts";
import { backgroundInfo, groupBackgrounds, linkedBackgrounds } from "../lib/consoleLook.ts";

type ConsoleBackgroundsProps = {
  enabled: boolean;
  cardId: string | undefined;
  workDir: string;
  /** Por qué no se puede usar todavía, si `enabled` es falso. */
  disabledReason: string;
};

/** Fondos de cada sistema y pantalla del menú de la consola, en Configuración. */
export function ConsoleBackgrounds({ enabled, cardId, workDir, disabledReason }: ConsoleBackgroundsProps) {
  const backgrounds = useConsoleImages({
    enabled,
    cardId,
    workDir,
    keyOf: (background) => background.name,
    list: consoleBackgrounds,
    preview: consoleBackgroundPreview,
    previewType: "image/jpeg",
    replace: replaceConsoleBackground,
    restore: restoreConsoleBackground,
    messages: { replaced: "Fondo cambiado en la consola", restored: "Fondo original restaurado" },
    linked: linkedBackgrounds,
  });

  async function change(name: string, label: string) {
    const picked = await open({
      title: `Elige el fondo de ${label}`,
      filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (typeof picked === "string") void backgrounds.replace(name, picked);
  }

  return (
    <section className="settings-card" aria-labelledby="settings-console-backgrounds">
      <h2 id="settings-console-backgrounds">Fondos de la consola</h2>

      {!enabled ? (
        <p className="settings-note">{disabledReason}</p>
      ) : (
        <>
          <p className="settings-intro">
            La pantalla de cada sistema y de cada menú. La imagen se ajusta a
            640 × 480 recortando lo que sobre de los bordes y reemplaza todo el
            fondo, también el nombre del sistema y el botón «A Enter» que llevan
            dibujados los originales. El original se guarda en la carpeta de
            trabajo para poder restaurarlo.
          </p>
          <p className="settings-intro">
            En la lista de juegos y el buscador, Bunko rehace sobre tu imagen
            la fila elegida, los títulos, los iconos y el teclado, que siguen
            viéndose igual.
          </p>
          <p className="settings-intro">
            Al cambiar el mapa de teclas, Bunko rehace las teclas resaltadas
            sobre el fondo nuevo. Si prefieres las tuyas, súbelas después como
            una tira de 66 × 492 con los botones X, Y, R1, A, B y L1.
          </p>
          <p className="settings-intro">
            El menú de pausa cambia en todos los idiomas a la vez y conserva
            sus textos claros encima de tu imagen: elige una con la parte
            izquierda oscura para que se lean bien.
          </p>

          {backgrounds.items === null ? (
            <p className="settings-note">Leyendo los fondos…</p>
          ) : backgrounds.items.length === 0 && !backgrounds.result ? (
            <p className="settings-note">Esta tarjeta no tiene fondos que se puedan cambiar.</p>
          ) : (
            groupBackgrounds(backgrounds.items).map(({ group, items }) => (
              <div className="background-group" key={group}>
                <h3 className="field-label">{group.toUpperCase()}</h3>
                <div className="background-grid">
                  {items.map((background) => {
                    const { label } = backgroundInfo(background.name);
                    const preview = backgrounds.previews[background.name];
                    const busy = backgrounds.busy === background.name;
                    return (
                      <article className="background-card" key={background.name}>
                        <div className="background-preview">
                          {preview ? <img src={preview} alt={`Fondo de ${label}`} /> : <ImageIcon size={20} />}
                        </div>
                        <div className="background-meta">
                          <strong>{label}</strong>
                          <span>{background.customized ? "Personalizado" : background.name}</span>
                        </div>
                        <div className="settings-actions">
                          {background.customized && (
                            <IconButton
                              className="sound-button is-restore"
                              label={`Restaurar el fondo original de ${label}`}
                              onClick={() => void backgrounds.restore(background.name)}
                              disabled={backgrounds.busy !== null}
                            >
                              <RotateCcw size={14} />
                            </IconButton>
                          )}
                          <Button
                            onClick={() => void change(background.name, label)}
                            disabled={backgrounds.busy !== null}
                          >
                            {busy ? <LoaderCircle size={14} className="spin" /> : <Upload size={14} />}
                            {busy ? "Guardando…" : "Cambiar"}
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </>
      )}

      {backgrounds.result && (
        <p className={`settings-result ${backgrounds.result.ok ? "is-ok" : "is-error"}`} role="status">
          {backgrounds.result.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{backgrounds.result.text}</span>
        </p>
      )}
    </section>
  );
}
