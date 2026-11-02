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
import { Skeleton } from "./ui/Skeleton.tsx";
import type { DiskSpace } from "../lib/backend.ts";
import { formatBytes, formatSize } from "../lib/format.ts";
import type { System, Tab } from "../lib/types.ts";

/** Por encima de este uso, la barra avisa de que queda poco espacio. */
const STORAGE_WARNING = 90;

function StorageSpace({ space }: { space: DiskSpace }) {
  const used = space.totalBytes
    ? ((space.totalBytes - space.freeBytes) / space.totalBytes) * 100
    : 0;
  return (
    <div className="storage-space">
      <div
        className={`storage-bar ${used >= STORAGE_WARNING ? "full" : ""}`}
        role="progressbar"
        aria-label="Espacio usado de la microSD"
        aria-valuenow={Math.round(used)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i style={{ width: `${used}%` }} />
      </div>
      <div className="storage-amounts">
        <strong>{formatBytes(space.freeBytes)} libres</strong>
        <span>de {formatBytes(space.totalBytes)}</span>
      </div>
    </div>
  );
}

type SidebarProps = {
  activeTab: Tab;
  root: string;
  systems: System[];
  selected: System | null;
  totalGames: number;
  pendingNotes: number;
  ejecting: boolean;
  scanning: boolean;
  diskSpace: DiskSpace | null;
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
  scanning,
  diskSpace,
  onTabChange,
  onSelectSystem,
  onOpenFolder,
  onEject,
  onChooseRoot,
}: SidebarProps) {
  return (
      <aside className="sidebar">
        <div className="brand">BUNKO</div>

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
            {!systems.length &&
              (scanning ? (
                Array.from({ length: 5 }, (_, index) => (
                  <div className="system-item" key={index}>
                    <Skeleton />
                  </div>
                ))
              ) : (
                <p className="empty-systems">Conecta tu tarjeta para empezar</p>
              ))}
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
            {diskSpace && <StorageSpace space={diskSpace} />}
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
            Bunko <span>v0.1.0</span>
          </div>
        </div>
      </aside>
  );
}
