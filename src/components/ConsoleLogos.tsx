import { open } from "@tauri-apps/plugin-dialog";
import { AlertCircle, CheckCircle2, Image as ImageIcon, LoaderCircle, RotateCcw, Upload } from "lucide-react";
import { Button, IconButton } from "./ui/Button.tsx";
import { useConsoleImages } from "../hooks/useConsoleImages.ts";
import { consoleLogoPreview, consoleLogos, replaceConsoleLogo, restoreConsoleLogo } from "../lib/backend.ts";

type ConsoleLogosProps = {
  enabled: boolean;
  cardId: string | undefined;
  workDir: string;
  /** Por qué no se puede usar todavía, si `enabled` es falso. */
  disabledReason: string;
};

const LOGO_INFO: Record<string, { label: string; fit: string }> = {
  boot: { label: "Arranque", fit: "recortando lo que sobre de los bordes" },
  poweroff: { label: "Apagado", fit: "entera, con bandas negras si hace falta" },
};

/** Logos de arranque y apagado de la consola, en Configuración. */
export function ConsoleLogos({ enabled, cardId, workDir, disabledReason }: ConsoleLogosProps) {
  const logos = useConsoleImages({
    enabled,
    cardId,
    workDir,
    keyOf: (logo) => logo.id,
    list: consoleLogos,
    preview: consoleLogoPreview,
    previewType: "image/png",
    replace: replaceConsoleLogo,
    restore: restoreConsoleLogo,
    messages: { replaced: "Logo cambiado en la consola", restored: "Logo original restaurado" },
  });

  async function change(id: string, label: string) {
    const picked = await open({
      title: `Elige el logo de ${label.toLowerCase()}`,
      filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (typeof picked === "string") void logos.replace(id, picked);
  }

  return (
    <section className="settings-card" aria-labelledby="settings-console-logos">
      <h2 id="settings-console-logos">Logos de la consola</h2>

      {!enabled ? (
        <p className="settings-note">{disabledReason}</p>
      ) : (
        <>
          <p className="settings-intro">
            Lo que se ve al encender y al apagar la consola. La imagen se ajusta
            al tamaño de cada logo y el original se guarda en la carpeta de
            trabajo para poder restaurarlo.
          </p>

          {logos.items === null ? (
            <p className="settings-note">Leyendo los logos…</p>
          ) : logos.items.length === 0 && !logos.result ? (
            <p className="settings-note">Esta tarjeta no tiene logos que se puedan cambiar.</p>
          ) : (
            <div className="background-grid">
              {logos.items.map((logo) => {
                const info = LOGO_INFO[logo.id] ?? { label: logo.file, fit: "" };
                const preview = logos.previews[logo.id];
                const busy = logos.busy === logo.id;
                return (
                  <article className="background-card" key={logo.id}>
                    <div className="background-preview is-logo">
                      {preview ? <img src={preview} alt={`Logo de ${info.label.toLowerCase()}`} /> : <ImageIcon size={20} />}
                    </div>
                    <div className="background-meta">
                      <strong>{info.label}</strong>
                      <span>
                        {logo.width} × {logo.height}
                        {logo.customized ? " · Personalizado" : ` · ${logo.file}`}
                      </span>
                    </div>
                    {info.fit && <p className="background-hint">La imagen se coloca {info.fit}.</p>}
                    <div className="settings-actions">
                      {logo.customized && (
                        <IconButton
                          className="sound-button is-restore"
                          label={`Restaurar el logo original de ${info.label.toLowerCase()}`}
                          onClick={() => void logos.restore(logo.id)}
                          disabled={logos.busy !== null}
                        >
                          <RotateCcw size={14} />
                        </IconButton>
                      )}
                      <Button onClick={() => void change(logo.id, info.label)} disabled={logos.busy !== null}>
                        {busy ? <LoaderCircle size={14} className="spin" /> : <Upload size={14} />}
                        {busy ? "Guardando…" : "Cambiar"}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {logos.result && (
        <p className={`settings-result ${logos.result.ok ? "is-ok" : "is-error"}`} role="status">
          {logos.result.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{logos.result.text}</span>
        </p>
      )}
    </section>
  );
}
