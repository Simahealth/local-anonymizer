/**
 * Puente hacia el proceso Python (escritorio/api.py) vía pywebview.
 *
 * pywebview inyecta `window.pywebview.api` con un método por cada método
 * público de `ApiEscritorio` (nombres en snake_case, mismos argumentos) y
 * dispara `pywebviewready` cuando está listo. Fuera de la app de escritorio
 * (p. ej. `npm run dev` en el navegador) se usa un simulador en memoria para
 * poder desarrollar la interfaz sin Python -- ver `simulador.ts`.
 */
import { crearSimulador } from "./simulador";

export interface ArchivoPdf {
  ruta: string;
  nombre: string;
  tamano: number;
}

export type EstadoDocumento = "pendiente" | "procesando" | "completado" | "error";

export interface DocumentoLote {
  codigo: string;
  archivoOriginal: string;
  rutaOriginal: string;
  archivoAnonimizado: string;
  estado: EstadoDocumento;
  piiPorCategoria: Record<string, number>;
  totalPii: number;
  error: string;
}

export interface EstadoLote {
  activo: boolean;
  cancelado: boolean;
  carpeta: string;
  carpetaPdfs: string;
  relacionXlsx: string;
  documentos: DocumentoLote[];
}

export interface EntradaHistorial {
  fecha: string;
  carpeta: string;
  total: number;
  completados: number;
  errores: number;
  cancelados: number;
  existe: boolean;
}

export interface ApiEscritorio {
  estado_motor(): Promise<{ listo: boolean; error: string | null }>;
  info(): Promise<{ version: string; plataforma: string }>;
  seleccionar_archivos(): Promise<ArchivoPdf[]>;
  seleccionar_carpeta(actual: string): Promise<string | null>;
  carpeta_predeterminada(): Promise<string>;
  abrir_ruta(ruta: string): Promise<boolean>;
  iniciar_lote(rutas: string[], carpetaDestino: string): Promise<{ ok: boolean; error?: string; carpeta?: string }>;
  cancelar_lote(): Promise<void>;
  estado_lote(): Promise<EstadoLote | null>;
  historial(): Promise<EntradaHistorial[]>;
}

declare global {
  interface Window {
    pywebview?: { api: ApiEscritorio };
  }
}

/** Evento que emite escritorio/app.py al soltar archivos sobre la ventana. */
export const EVENTO_ARCHIVOS_SOLTADOS = "sima:archivos";

let promesa: Promise<ApiEscritorio> | null = null;

export function obtenerApi(): Promise<ApiEscritorio> {
  promesa ??= new Promise((resolver) => {
    if (window.pywebview?.api) {
      resolver(window.pywebview.api);
      return;
    }
    const alEstarListo = () => resolver(window.pywebview!.api);
    window.addEventListener("pywebviewready", alEstarListo, { once: true });
    // En el navegador (sin pywebview) nunca llega `pywebviewready`.
    if (import.meta.env.DEV) {
      window.setTimeout(() => {
        if (!window.pywebview) {
          window.removeEventListener("pywebviewready", alEstarListo);
          resolver(crearSimulador());
        }
      }, 800);
    }
  });
  return promesa;
}

/** True si corre fuera de la app de escritorio (simulador del navegador). */
export function esSimulado(): boolean {
  return !window.pywebview;
}
