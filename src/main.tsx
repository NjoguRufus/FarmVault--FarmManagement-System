import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  registerSW({
    immediate: true,
    onRegisterError(error) {
      console.error("[PWA] Service worker registration failed:", error);
    },
  });
}

createRoot(document.getElementById("root")!).render(<App />);
