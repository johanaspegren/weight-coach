import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js")
    .catch((err) => console.warn("SW register failed", err));
}

const el = document.getElementById("app");
if (!el) throw new Error("#app root not found");
createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
