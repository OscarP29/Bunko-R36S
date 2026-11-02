import {
  ChevronRight,
  ExternalLink,
  Gamepad2,
  HardDrive,
  ListTodo,
  Settings,
  LogOut,
  LoaderCircle,
  SlidersHorizontal,
} from "lucide-react";
import { formatSize } from "../lib/format.ts";
import type { System, Tab } from "../lib/types.ts";

type SidebarProps = {
  activeTab: Tab;
  root: string;
  systems: System[];
  selected: System | null;
  totalGames: number;
  pendingNotes: number;
  ejecting: boolean;
  onTabChange: (tab: Tab) => void;
  onSelectSystem: (system: System) => void;
  onOpenFolder: (path: string) => void;
  onEject: () => void;
  onChooseRoot: () => void;
};

export function Sidebar({
  activeTab,
  root,
  systems,
  selected,
  totalGames,
  pendingNotes,
  ejecting,
  onTabChange,
  onSelectSystem,
  onOpenFolder,
  onEject,
  onChooseRoot,
}: SidebarProps) {
  return (
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Gamepad2 size={20} strokeWidth={2.3} />
          </div>
          <div>
            <strong>
              R36S<span>MANAGER</span>
            </strong>
            <small>tu biblioteca, en orden</small>
          </div>
        </div>

        <div className="side-label">ESPACIO DE TRABAJO</div>
        <button
          className={`nav-item ${activeTab === "library" ? "active" : ""} `}
          onClick={() => onTabChange("library")}
        >
          <Gamepad2 size={17} />
          <span>Biblioteca</span>
          <span className="nav-count">{formatSize(totalGames)}</span>
        </button>
        <button
          className={`nav-item ${activeTab === "notes" ? "active" : ""} `}
          onClick={() => onTabChange("notes")}
        >
          <ListTodo size={17} />
          <span>Lista de pendientes</span>
          <span className="nav-count">{pendingNotes}</span>
        </button>
        <button
          className={`nav-item ${activeTab === "settings" ? "active" : ""} `}
          onClick={() => onTabChange("settings")}
        >
          <Settings size={17} />
          <span>Configuración</span>
        </button>

        <div className="side-section">
          <div className="side-label">
            SISTEMAS <span>{systems.length}</span>
          </div>
          <div className="system-list">
            {systems.map((system) => (
              <button
                key={system.id}
                onClick={() => {
                  onTabChange("library");
                  onSelectSystem(system);
                }}
                className={`system-item ${
                  selected?.id === system.id && activeTab === "library"
                    ? "selected"
                    : ""
                }`}
              >
                <span className="system-dot" />
                <span className="system-name">{system.name}</span>
                <span className="system-count">
                  {formatSize(system.gameCount)}
                </span>
              </button>
            ))}
            {!systems.length && (
              <p className="empty-systems">Conecta tu tarjeta para empezar</p>
            )}
          </div>
        </div>

        <div className="sidebar-bottom">
          <div className="storage-card">
            <div className="storage-icon">
              <HardDrive size={16} />
            </div>
            <div className="storage-copy">
              <strong>
                {root ? "MicroSD conectada" : "Sin tarjeta conectada"}
              </strong>
              <span>
                {root
                  ? root.split(/[\\/]/).slice(-2).join("/")
                  : "Elige la carpeta ROMS"}
              </span>
            </div>
            <span className={`connection-dot ${root ? "on" : ""}`} />
          </div>
          {root && (
            <button
              className="settings-row open-folder-row"
              onClick={() => onOpenFolder(root)}
            >
              <ExternalLink size={15} />
              <span>Abrir carpeta de la SD</span>
              <ChevronRight size={14} />
            </button>
          )}
          {root && (
            <button
              className="settings-row eject-row"
              onClick={onEject}
              disabled={ejecting}
              title="Liberar acceso para extraer la tarjeta con seguridad"
            >
              {ejecting ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <LogOut size={15} />
              )}
              <span>
                {ejecting ? "Liberando microSD…" : "Expulsar microSD"}
              </span>
              <ChevronRight size={14} />
            </button>
          )}
          <button className="settings-row" onClick={onChooseRoot}>
            <SlidersHorizontal size={15} />
            <span>Cambiar tarjeta SD</span>
            <ChevronRight size={14} />
          </button>
          <div className="sidebar-footer">
            <span className="version-dot" />
            R36S Manager <span>v0.1.0</span>
          </div>
        </div>
      </aside>
  );
}
