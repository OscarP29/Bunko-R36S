import { Segmented } from "../components/ui/Segmented.tsx";
import {
  FONT_SCALES,
  type Settings,
  type ThemeMode,
} from "../lib/settings.ts";

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
  { value: "system", label: "Sistema" },
];

type SettingsPageProps = {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
};

export function SettingsPage({ settings, updateSettings }: SettingsPageProps) {
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
    </div>
  );
}
