import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applySettings, loadSettings } from "./lib/settings.ts";
import "./styles/index.css";

// Antes del primer render, para que no parpadee el tema o el tamaño por defecto.
applySettings(loadSettings());

// Se añaden desde aquí porque un @import o un <link> en el HTML frena el primer
// pintado hasta que responde la red; así la app aparece y las fuentes llegan luego.
const fonts = document.createElement("link");
fonts.rel = "stylesheet";
fonts.href =
  "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&family=Syne:wght@400;500;600;700;800&display=swap";
document.head.append(fonts);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
