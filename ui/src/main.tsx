import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/fuentes.css";
import "./index.css";
import "./styles/app.css";
import { App } from "./App";
import { ToastProvider } from "./components/Toast/ToastProvider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
