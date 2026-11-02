import {
  ChevronRight,
  LogOut,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import type { Tab } from "../lib/types.ts";
import { IconButton } from "./ui/Button.tsx";

type TopbarProps = {
  activeTab: Tab;
  systemName?: string;
  root: string;
  loading: boolean;
  ejecting: boolean;
  onRescan: () => void;
  onEject: () => void;
};

export function Topbar({
  activeTab,
  systemName,
  root,
  loading,
  ejecting,
  onRescan,
  onEject,
}: TopbarProps) {
  return (
      <header className="topbar">
        <div className="breadcrumbs">
          <span>Consola</span>
          <ChevronRight size={13} />
          <strong>
            {activeTab === "notes"
              ? "Pendientes"
              : activeTab === "settings"
                ? "Configuración"
                : systemName || "Biblioteca"}
          </strong>
        </div>
        <div className="top-actions">
          <div className="drive-indicator">
            <span className={`connection-dot ${root ? "on" : ""}`} />
            {root ? "MicroSD lista" : "Sin conexión"}
          </div>
          <IconButton
            label="Volver a escanear"
            onClick={onRescan}
            disabled={!root || loading}
          >
            <RefreshCw size={15} className={loading ? "spin" : ""} />
          </IconButton>
          {root && (
            <IconButton
              label="Expulsar microSD"
              onClick={onEject}
              disabled={ejecting}
            >
              {ejecting ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <LogOut size={15} />
              )}
            </IconButton>
          )}
          <div className="avatar">R</div>
        </div>
      </header>
  );
}
