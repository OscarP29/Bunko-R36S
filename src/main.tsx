import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applySettings, loadSettings } from "./lib/settings.ts";
import "./styles/index.css";

// Antes del primer render, para que no parpadee el tema o el tamaño por defecto.
applySettings(loadSettings());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
