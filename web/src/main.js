import { renderApp } from "./app.js";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("SW register failed", err));
}

renderApp(document.getElementById("app"));
window.addEventListener("hashchange", () => renderApp(document.getElementById("app")));
