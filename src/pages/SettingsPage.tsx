import { useState } from "react";
import { AlertCircle, CheckCircle2, FolderOpen, History, LoaderCircle, Save, Trash2 } from "lucide-react";
import { BackupModal } from "../components/BackupModal.tsx";
import { ConsoleBackgrounds } from "../components/ConsoleBackgrounds.tsx";
import { ConsoleLogos } from "../components/ConsoleLogos.tsx";
import { ConsoleSounds } from "../components/ConsoleSounds.tsx";
import { RestoreModal } from "../components/RestoreModal.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Segmented } from "../components/ui/Segmented.tsx";
import type { CardState } from "../hooks/useCard.ts";
import type { SavesState } from "../hooks/useSaves.ts";
import { useSectionIndex } from "../hooks/useSectionIndex.ts";
import { CONSOLE_PROFILES, consoleProfile } from "../lib/consoles.ts";
import { formatBytes, formatSize } from "../lib/format.ts";
import { PALETTE_SHORTCUT } from "../hooks/useShortcuts.ts";
import { formatShortcut, type Command } from "../lib/commands.ts";
import {
  FONT_SCALES,
  type Settings,
  type ThemeMode,
} from "../lib/settings.ts";

const CONSOLE_OPTIONS = CONSOLE_PROFILES.map((profile) => ({
  value: profile.id,
  label: profile.label,
  disabled: !profile.available,
  badge: profile.available ? undefined : "Próximamente",
}));

const EXTRACT_OPTIONS = [
  { value: "ask", label: "Preguntar" },
  { value: "auto", label: "Extraer siempre" },
] as const;

const SOUND_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "alerts", label: "Solo avisos" },
  { value: "off", label: "Desactivados" },
] as const;

type SettingsTab = "bunko" | "console";

const TAB_OPTIONS: { value: SettingsTab; label: string }[] = [
  { value: "bunko", label: "Bunko" },
  { value: "console", label: "Consola" },
];

/** Índice de la pestaña Consola: el `id` del título de cada sección. */
const CONSOLE_SECTIONS = [
  { value: "settings-console", label: "Consola" },
  { value: "settings-console-sounds", label: "Sonidos" },
  { value: "settings-console-backgrounds", label: "Fondos" },
  { value: "settings-console-logos", label: "Logos" },
  { value: "settings-backups", label: "Copias" },
];
const CONSOLE_SECTION_IDS = CONSOLE_SECTIONS.map((section) => section.value);

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
  { value: "system", label: "Sistema" },
];

type SettingsPageProps = {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  commands: Command[];
  saves: SavesState;
  card: CardState;
  onChooseWorkDir: () => void;
};

export function SettingsPage({
  settings,
  updateSettings,
  commands,
  saves,
  card,
  onChooseWorkDir,
}: SettingsPageProps) {
  const [tab, setTab] = useState<SettingsTab>("bunko");
  const [modal, setModal] = useState<"backup" | "restore" | null>(null);
  const index = useSectionIndex(CONSOLE_SECTION_IDS, tab === "console");
  const profile = consoleProfile(card.card?.profile);
  const { summary, busy, result } = saves;

  function confirmClean() {
    if (!summary) return;
    const ok = confirm(
      `Se moverán ${formatSize(summary.orphans)} partidas de juegos que no están en la tarjeta a:\n${saves.effectiveWorkDir}\n\nPrimero se copian y después se quitan de la microSD.`,
    );
    if (ok) void saves.clean();
  }

  return (
    <div className="content settings-content">
      <section className="page-heading">
        <div>
          <div className="eyebrow">
            PREFERENCIAS <span className="eyebrow-line" />
          </div>
          <h1>
            Configuración<span className="heading-period">.</span>
          </h1>
          <p>
            Bunko guarda sus preferencias en este equipo. Lo de la consola se
            guarda en su microSD.
          </p>
        </div>
      </section>

      <div className="settings-tabs" ref={index.bar}>
        <Segmented
          label="Sección de configuración"
          value={tab}
          options={TAB_OPTIONS}
          onChange={setTab}
        />
        {tab === "console" && (
          <Segmented
            label="Ir a una sección"
            value={index.active}
            options={CONSOLE_SECTIONS}
            onChange={index.go}
          />
        )}
      </div>

      {tab === "bunko" ? (
        <>
      <section className="settings-card" aria-labelledby="settings-appearance">
        <h2 id="settings-appearance">Apariencia</h2>

        <div className="settings-row-item">
          <div>
            <strong>Tamaño de letra</strong>
            <p>Ajusta el texto de toda la aplicación.</p>
          </div>
          <Segmented
            label="Tamaño de letra"
            value={settings.fontScale}
            options={FONT_SCALES}
            onChange={(fontScale) => updateSettings({ fontScale })}
          />
        </div>

        <div className="settings-row-item">
          <div>
            <strong>Tema</strong>
            <p>Sistema sigue la preferencia de tu equipo.</p>
          </div>
          <Segmented
            label="Tema"
            value={settings.theme}
            options={THEME_OPTIONS}
            onChange={(theme) => updateSettings({ theme })}
          />
        </div>

        <div className="settings-row-item">
          <div>
            <strong>Sonidos</strong>
            <p>Al pulsar botones y cuando aparece un aviso.</p>
          </div>
          <Segmented
            label="Sonidos"
            value={settings.sounds}
            options={SOUND_OPTIONS}
            onChange={(sounds) => updateSettings({ sounds })}
          />
        </div>
      </section>

      <section className="settings-card" aria-labelledby="settings-roms">
        <h2 id="settings-roms">Añadir juegos</h2>

        <div className="settings-row-item">
          <div>
            <strong>ROMs comprimidas</strong>
            <p>
              Los .7z y los .zip de GBA y NES cargan más lento en la consola.
              Elige si se extraen solos al copiarlos o si se pregunta cada vez.
              Arcade siempre se copia comprimido.
            </p>
          </div>
          <Segmented
            label="ROMs comprimidas"
            value={settings.autoExtract ? "auto" : "ask"}
            options={EXTRACT_OPTIONS}
            onChange={(value) => updateSettings({ autoExtract: value === "auto" })}
          />
        </div>
      </section>

      <section className="settings-card" aria-labelledby="settings-shortcuts">
        <h2 id="settings-shortcuts">Atajos de teclado</h2>
        <dl className="settings-shortcuts">
          <div>
            <dt>Abrir comandos</dt>
            <dd>
              <kbd>{formatShortcut(PALETTE_SHORTCUT)}</kbd>
            </dd>
          </div>
          {commands
            .filter((command) => command.shortcut)
            .map((command) => (
              <div key={command.id}>
                <dt>{command.label}</dt>
                <dd>
                  <kbd>{formatShortcut(command.shortcut!)}</kbd>
                </dd>
              </div>
            ))}
        </dl>
      </section>
        </>
      ) : (
        <>
      <section className="settings-card" aria-labelledby="settings-console">
        <h2 id="settings-console">Consola</h2>

        {!card.card ? (
          <p className="settings-note">
            Conecta la microSD para ver y nombrar su consola.
          </p>
        ) : (
          <>
            <div className="settings-row-item">
              <div>
                <strong>Nombre</strong>
                <p>
                  Se guarda en la propia tarjeta. Así Bunko distingue cada
                  consola y no mezcla sus copias de partidas.
                </p>
              </div>
              <input
                key={card.card.id}
                className="text-field settings-name"
                aria-label="Nombre de la consola"
                defaultValue={card.card.name}
                maxLength={40}
                onBlur={(event) => {
                  const name = event.target.value.trim();
                  if (name && name !== card.card?.name) void card.update({ name });
                  else event.target.value = card.card?.name ?? "";
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            </div>

            <div className="settings-row-item">
              <div>
                <strong>Modelo y firmware</strong>
                <p>
                  {profile
                    ? `${profile.detail}. Indica a Bunko dónde están los favoritos y las partidas.`
                    : "Modelo desconocido: favoritos y partidas desactivados."}
                </p>
              </div>
              <Segmented
                label="Modelo y firmware"
                value={card.card.profile}
                options={CONSOLE_OPTIONS}
                onChange={(profile) => void card.update({ profile })}
              />
            </div>
          </>
        )}

        {card.error && (
          <p className="settings-result is-error" role="status">
            <AlertCircle size={16} />
            <span>{card.error}</span>
          </p>
        )}
      </section>

      <ConsoleSounds
        enabled={saves.ready}
        cardId={card.card?.id}
        workDir={saves.effectiveWorkDir}
        disabledReason={
          !card.card
            ? "Conecta la microSD para cambiar los sonidos de su consola."
            : "Este modelo todavía no permite cambiar los sonidos."
        }
      />

      <ConsoleBackgrounds
        enabled={saves.ready}
        cardId={card.card?.id}
        workDir={saves.effectiveWorkDir}
        disabledReason={
          !card.card
            ? "Conecta la microSD para cambiar los fondos de su consola."
            : "Este modelo todavía no permite cambiar los fondos."
        }
      />

      <ConsoleLogos
        enabled={saves.ready}
        cardId={card.card?.id}
        workDir={saves.effectiveWorkDir}
        disabledReason={
          !card.card
            ? "Conecta la microSD para cambiar los logos de su consola."
            : "Este modelo todavía no permite cambiar los logos."
        }
      />

      <section className="settings-card" aria-labelledby="settings-backups">
        <h2 id="settings-backups">Copias de seguridad</h2>

        <div className="settings-row-item">
          <div className="settings-path">
            <strong>Carpeta de trabajo</strong>
            <p>Cada consola tiene aquí su propia carpeta de copias.</p>
            <code>{saves.effectiveWorkDir || "Sin elegir"}</code>
          </div>
          <div className="settings-actions">
            {settings.workDir && (
              <Button onClick={() => updateSettings({ workDir: "" })}>
                Usar Documentos
              </Button>
            )}
            <Button onClick={onChooseWorkDir}>Cambiar</Button>
            {saves.ready && (
              <Button onClick={() => void saves.openFolder()}>
                <FolderOpen size={14} /> Abrir carpeta
              </Button>
            )}
          </div>
        </div>

        {!saves.ready ? (
          <p className="settings-note">
            {!card.card
              ? "Conecta la microSD para gestionar las partidas guardadas."
              : "Este modelo todavía no permite copiar partidas."}
          </p>
        ) : (
          <>
            <div className="settings-row-item">
              <div>
                <strong>Partidas de tus juegos</strong>
                <p>
                  {summary
                    ? `${formatSize(summary.owned)} archivos, ${formatBytes(summary.ownedBytes)}. Guardados del juego y rápidos.`
                    : "Contando partidas…"}
                </p>
              </div>
              <div className="settings-actions">
                <Button onClick={() => setModal("restore")} disabled={busy !== null}>
                  {busy === "restore" ? <LoaderCircle size={15} className="spin" /> : <History size={15} />}
                  Restaurar
                </Button>
                <Button
                  variant="primary"
                  onClick={() => setModal("backup")}
                  disabled={!summary?.owned || busy !== null}
                >
                  {busy === "backup" ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
                  Copiar partidas
                </Button>
              </div>
            </div>

            <div className="settings-row-item">
              <div>
                <strong>Partidas sobrantes</strong>
                <p>
                  {summary
                    ? summary.orphans
                      ? `${formatSize(summary.orphans)} archivos, ${formatBytes(summary.orphanBytes)}, de juegos que no están en la tarjeta.`
                      : "No hay partidas de juegos que no estén en la tarjeta."
                    : "Contando partidas…"}
                </p>
              </div>
              <Button
                className="danger"
                onClick={confirmClean}
                disabled={!summary?.orphans || busy !== null}
              >
                {busy === "clean" ? <LoaderCircle size={15} className="spin" /> : <Trash2 size={15} />}
                Mover al PC y limpiar
              </Button>
            </div>
          </>
        )}

        {result && (
          <p className={`settings-result ${result.ok ? "is-ok" : "is-error"}`} role="status">
            {result.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{result.text}</span>
          </p>
        )}
      </section>

      {modal === "backup" && card.card && (
        <BackupModal
          cardName={card.card.name}
          loadSaves={saves.listSaves}
          busy={busy === "backup"}
          onClose={() => setModal(null)}
          onBackup={async (files) => {
            if (await saves.backup(files)) setModal(null);
          }}
        />
      )}

      {modal === "restore" && card.card && (
        <RestoreModal
          cardName={card.card.name}
          loadBackups={saves.listBackups}
          busy={busy === "restore"}
          onClose={() => setModal(null)}
          onRestore={async (folder, files) => {
            if (await saves.restore(folder, files)) setModal(null);
          }}
        />
      )}

        </>
      )}
    </div>
  );
}
