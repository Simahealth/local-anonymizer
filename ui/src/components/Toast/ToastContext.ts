import { createContext } from "react";
import type { ToastApi } from "./types";

export const ToastContext = createContext<ToastApi | null>(null);
