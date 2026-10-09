/**
 * Puente hacia el proceso Python (escritorio/api.py) vía pywebview.
 *
 * pywebview inyecta `window.pywebview.api` con un método por cada método
 * público de `ApiEscritorio` (nombres en snake_case, mismos argumentos) y
 * dispara `pywebviewready` cuando está listo. Fuera de la app de escritorio
 * (p. ej. `npm run dev` en el navegador) se usa un simulador en memoria para
 * poder desarrollar la interfaz sin Python -- ver `simulador.ts`.
 *
 * Escala: la interfaz nunca recibe listas completas (un lote puede tener
 * 50 000 documentos). La selección y los documentos se piden por páginas.
 */
import { crearSimulador } from "./simulador";

export interface ArchivoPdf {
  ruta: string;
  nombre: string;
  tamano: number;
}

export interface ResumenSeleccion {
  total: number;
  tamano: number;
  agregados?: number;
  repetidos?: number;
}

export interface PaginaSeleccion extends ResumenSeleccion {
  archivos: ArchivoPdf[];
}

export type EstadoDocumento = "pendiente" | "procesando" | "completado" | "error";

export interface Contadores {
  total: number;
  completados: number;
  errores: number;
  pendientes: number;
  revisados: number;
  datosOcultados: number;
}

export interface EventoDocumento {
  codigo: string;
  nombre: string;
  estado: EstadoDocumento;
  totalPii: number;
  error: string;
}

export interface EstadoMemoria {
  disponibleMb: number;
  totalMb: number;
  procesoMb: number;
  fragmento: number;
  esperando: boolean;
}

export interface EstadoLote {
  carpeta: string;
  carpetaPdfs: string;
  relacionXlsx: string;
  activo: boolean;
  pausando: boolean;
  contadores: Contadores;
  actual: EventoDocumento | null;
  recientes: EventoDocumento[];
  porMinuto: number | null;
  segundosRestantes: number | null;
  memoria: EstadoMemoria | null;
}

export interface EntradaHistorial {
  carpeta: string;
  creado: string;
  existe: boolean;
  procesando: boolean;
  contadores?: Contadores;
}

export type FiltroDocumentos = "todos" | "completados" | "errores" | "pendientes" | "revisados" | "sin_revisar";

export interface ResumenDocumento {
  codigo: string;
  nombreOriginal: string;
  estado: EstadoDocumento;
  totalPii: number;
  revisado: boolean;
  paginas: number;
  error: string;
}

/** Fragmento ocultado. Offsets en unidades UTF-16 sobre `DocumentoRevision.texto`. */
export interface TramoRevision {
  id: number;
  inicio: number;
  fin: number;
  categoria: string;
  origen: "auto" | "manual";
  activo: boolean;
}

export interface DocumentoRevision {
  codigo: string;
  nombreOriginal: string;
  rutaOriginal: string;
  estado: EstadoDocumento;
  error: string;
  revisado: boolean;
  /** Texto original; las páginas van separadas por "\f". */
  texto: string;
  tramos: TramoRevision[];
}

export interface InfoLote {
  carpeta: string;
  creado: string;
  contadores: Contadores;
  procesando: boolean;
}

export interface ApiEscritorio {
  estado_motor(): Promise<{ listo: boolean; error: string | null }>;
  info(): Promise<{ version: string; plataforma: string }>;

  agregar_rutas(rutas: string[]): Promise<ResumenSeleccion>;
  seleccionar_archivos(): Promise<ResumenSeleccion>;
  seleccionar_carpeta_origen(): Promise<ResumenSeleccion>;
  seleccion(offset: number, limite: number): Promise<PaginaSeleccion>;
  quitar_de_seleccion(ruta: string): Promise<ResumenSeleccion>;
  limpiar_seleccion(): Promise<ResumenSeleccion>;

  seleccionar_carpeta(actual: string): Promise<string | null>;
  carpeta_predeterminada(): Promise<string>;
  abrir_ruta(ruta: string): Promise<boolean>;

  iniciar_lote(carpetaDestino: string): Promise<{ ok: boolean; error?: string; carpeta?: string }>;
  reanudar_lote(carpeta: string): Promise<{ ok: boolean; error?: string; carpeta?: string }>;
  pausar_lote(): Promise<void>;
  estado_lote(): Promise<EstadoLote | null>;

  abrir_lote(carpeta: string): Promise<InfoLote>;
  documentos(
    carpeta: string,
    offset: number,
    limite: number,
    filtro: FiltroDocumentos,
    busqueda: string,
  ): Promise<{ total: number; documentos: ResumenDocumento[] }>;
  documento(carpeta: string, codigo: string): Promise<DocumentoRevision>;
  ocultar(
    carpeta: string,
    codigo: string,
    inicio: number,
    fin: number,
    categoria: string,
    todas: boolean,
  ): Promise<DocumentoRevision>;
  actualizar_tramo(
    carpeta: string,
    codigo: string,
    tramoId: number,
    activo: boolean | null,
    categoria: string | null,
  ): Promise<DocumentoRevision>;
  marcar_revisado(carpeta: string, codigo: string, revisado: boolean): Promise<Contadores>;
  exportar_relacion(carpeta: string): Promise<string>;

  historial(): Promise<EntradaHistorial[]>;
}

declare global {
  interface Window {
    pywebview?: { api: ApiEscritorio };
  }
}

/** Eventos que emite escritorio/app.py al soltar archivos sobre la ventana. */
export const EVENTO_BUSCANDO = "sima:buscando";
export const EVENTO_SELECCION = "sima:seleccion";

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
