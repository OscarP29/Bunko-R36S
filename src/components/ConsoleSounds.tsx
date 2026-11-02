import { useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { AlertCircle, CheckCircle2, LoaderCircle, Play, RotateCcw, Square, Upload } from "lucide-react";
import { Button, IconButton } from "./ui/Button.tsx";
import { useConsoleSounds } from "../hooks/useConsoleSounds.ts";
import type { ConsoleSound } from "../lib/backend.ts";
import { isMusicSlot, soundLabel } from "../lib/consoleLook.ts";
import { formatBytes } from "../lib/format.ts";

type ConsoleSoundsProps = {
  enabled: boolean;
  cardId: string | undefined;
  workDir: string;
  /** Por qué no se puede usar todavía, si `enabled` es falso. */
  disabledReason: string;
};

function describe(sound: ConsoleSound) {
  if (!sound.exists) return `${sound.file} · Sin archivo`;
  return `${sound.file} · ${formatBytes(sound.bytes)}${sound.customized ? " · Personalizado" : ""}`;
}

/** Sonidos del menú de la consola, en Configuración. */
export function ConsoleSounds({ enabled, cardId, workDir, disabledReason }: ConsoleSoundsProps) {
  const sounds = useConsoleSounds({ enabled, cardId, workDir });
  const fileInput = useRef<HTMLInputElement | null>(null);
  const pendingSlot = useRef<string | null>(null);

  async function change(sound: ConsoleSound) {
    if (!isMusicSlot(sound.file)) {
      pendingSlot.current = sound.slot;
      fileInput.current?.click();
      return;
    }
    const picked = await open({
      title: "Elige la música de fondo",
      filters: [{ name: "MP3", extensions: ["mp3"] }],
    });
    if (typeof picked === "string") void sounds.replaceMusic(sound.slot, picked);
  }

  return (
    <section className="settings-card" aria-labelledby="settings-console-sounds">
      <h2 id="settings-console-sounds">Sonidos de la consola</h2>

      {!enabled ? (
        <p className="settings-note">{disabledReason}</p>
      ) : (
        <>
          <p className="settings-intro">
            Los sonidos del menú de la consola. Puedes usar cualquier audio corto:
            Bunko lo convierte al formato de la consola. El original se guarda en
            la carpeta de trabajo para poder restaurarlo.
          </p>

          <input
            ref={fileInput}
            type="file"
            accept="audio/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              const slot = pendingSlot.current;
              event.target.value = "";
              if (file && slot) void sounds.replaceEffect(slot, file);
            }}
          />

          {sounds.sounds === null ? (
            <p className="settings-note">Leyendo los sonidos…</p>
          ) : (
            sounds.sounds.map((sound) => {
              const label = soundLabel(sound.slot);
              const busy = sounds.busy === sound.slot;
              const isPlaying = sounds.playing === sound.slot;
              return (
                <div className="settings-row-item" key={sound.slot}>
                  <div>
                    <strong>{label}</strong>
                    <p>
                      {describe(sound)}
                      {isMusicSlot(sound.file) && !sound.exists &&
                        ". Añade un MP3 para que suene en el menú, si tu firmware lo admite."}
                    </p>
                  </div>
                  <div className="settings-actions">
                    <IconButton
                      label={isPlaying ? `Parar ${label}` : `Escuchar ${label}`}
                      onClick={() => void sounds.play(sound.slot)}
                      disabled={!sound.exists || busy}
                    >
                      {isPlaying ? <Square size={14} /> : <Play size={14} />}
                    </IconButton>
                    {sound.customized && (
                      <IconButton
                        label={`Restaurar el original de ${label}`}
                        onClick={() => void sounds.restore(sound.slot)}
                        disabled={sounds.busy !== null}
                      >
                        <RotateCcw size={14} />
                      </IconButton>
                    )}
                    <Button onClick={() => void change(sound)} disabled={sounds.busy !== null}>
                      {busy ? <LoaderCircle size={14} className="spin" /> : <Upload size={14} />}
                      Cambiar
                    </Button>
                  </div>
                </div>
              );
            })
          )}

          {sounds.sounds?.length === 0 && !sounds.result && (
            <p className="settings-note">Esta tarjeta no define sonidos de menú.</p>
          )}
        </>
      )}

      {sounds.result && (
        <p className={`settings-result ${sounds.result.ok ? "is-ok" : "is-error"}`} role="status">
          {sounds.result.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{sounds.result.text}</span>
        </p>
      )}
    </section>
  );
}
