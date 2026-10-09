/**
 * Simulador de `ApiEscritorio` para desarrollar la interfaz en el navegador
 * (`npm run dev`) sin el proceso Python. Solo se usa en modo desarrollo; la app
 * empaquetada habla siempre con pywebview. Procesa ~1 documento cada 600 ms y
 * marca como error los archivos cuyo nombre contiene "escaneado".
 */
import type {
  ApiEscritorio,
  ArchivoPdf,
  DocumentoLote,
  EntradaHistorial,
  EstadoLote,
} from "./escritorio";

const EJEMPLOS = [
  "Historia clínica - María Fernanda Gómez.pdf",
  "HC Juan Camilo Rodríguez 2026.pdf",
  "Epicrisis Laura Martínez Ospina.pdf",
  "Evolución UCI neonatal - escaneado.pdf",
  "Consulta externa Andrés Felipe Torres.pdf",
];

export function crearSimulador(): ApiEscritorio {
  let lote: EstadoLote | null = null;
  let cancelar = false;
  const historial: EntradaHistorial[] = [];
  const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const codigo = () =>
    "HC-" +
    Array.from({ length: 8 }, () => "23456789ABCDEFGHJKMNPQRSTUVWXYZ"[Math.floor(Math.random() * 31)]).join("");

  async function procesar(actual: EstadoLote) {
    for (const doc of actual.documentos) {
      if (cancelar) break;
      doc.estado = "procesando";
      await espera(600);
      if (doc.archivoOriginal.includes("escaneado")) {
        doc.estado = "error";
        doc.error = "El PDF no tiene texto seleccionable (¿es un escaneo?). Pásalo primero por OCR.";
      } else {
        doc.estado = "completado";
        doc.archivoAnonimizado = `${doc.codigo}.pdf`;
        doc.piiPorCategoria = { nombres: 3, documentos: 1, telefonos: 1, fechas: 2 };
        doc.totalPii = 7;
      }
    }
    actual.activo = false;
    const estados = actual.documentos.map((d) => d.estado);
    historial.unshift({
      fecha: new Date().toISOString().slice(0, 19),
      carpeta: actual.carpeta,
      total: estados.length,
      completados: estados.filter((e) => e === "completado").length,
      errores: estados.filter((e) => e === "error").length,
      cancelados: estados.filter((e) => e === "pendiente").length,
      existe: true,
    });
  }

  return {
    async estado_motor() {
      return { listo: true, error: null };
    },
    async info() {
      return { version: "1.0.0", plataforma: "Navegador (simulado)" };
    },
    async seleccionar_archivos(): Promise<ArchivoPdf[]> {
      return EJEMPLOS.map((nombre, i) => ({
        ruta: `/Users/demo/Historias/${nombre}`,
        nombre,
        tamano: 120_000 + i * 48_000,
      }));
    },
    async seleccionar_carpeta() {
      return "/Users/demo/Escritorio/Anonimizados";
    },
    async carpeta_predeterminada() {
      return "/Users/demo/Documents/SIMA Anonimizador";
    },
    async abrir_ruta() {
      return true;
    },
    async iniciar_lote(rutas, carpetaDestino) {
      cancelar = false;
      const carpeta = `${carpetaDestino}/Lote_${new Date().toISOString().slice(0, 19).replace("T", "_").replaceAll(":", "")}`;
      const documentos: DocumentoLote[] = rutas.map((ruta) => ({
        codigo: codigo(),
        archivoOriginal: ruta.split("/").pop() ?? ruta,
        rutaOriginal: ruta,
        archivoAnonimizado: "",
        estado: "pendiente",
        piiPorCategoria: {},
        totalPii: 0,
        error: "",
      }));
      lote = {
        activo: true,
        cancelado: false,
        carpeta,
        carpetaPdfs: `${carpeta}/anonimizados`,
        relacionXlsx: `${carpeta}/relacion_codigos.xlsx`,
        documentos,
      };
      void procesar(lote);
      return { ok: true, carpeta };
    },
    async cancelar_lote() {
      cancelar = true;
      if (lote) lote.cancelado = true;
    },
    async estado_lote() {
      return lote ? structuredClone(lote) : null;
    },
    async historial() {
      return structuredClone(historial);
    },
  };
}
