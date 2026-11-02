import { Segmented } from "../components/ui/Segmented.tsx";
import { PALETTE_SHORTCUT } from "../hooks/useShortcuts.ts";
import { formatShortcut, type Command } from "../lib/commands.ts";
import {
  FONT_SCALES,
  type Settings,
  type ThemeMode,
} from "../lib/settings.ts";

const EXTRACT_OPTIONS = [
  { value: "ask", label: "Preguntar" },
  { value: "auto", label: "Extraer siempre" },
] as const;

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
  { value: "system", label: "Sistema" },
];

type SettingsPageProps = {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  commands: Command[];
};

export function SettingsPage({
  settings,
  updateSettings,
  commands,
}: SettingsPageProps) {
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
          <p>Los cambios se aplican al momento y se guardan en este equipo.</p>
        </div>
      </section>

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
    </div>
  );
}
