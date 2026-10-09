/**
 * Simulador de `ApiEscritorio` para desarrollar la interfaz en el navegador
 * (`npm run dev`) y para las pruebas, sin el proceso Python. La app empaquetada
 * habla siempre con pywebview.
 *
 * - "Seleccionar archivos" agrega 5 PDF de ejemplo; "Seleccionar carpeta"
 *   agrega 1 200 (para ver la interfaz con lotes grandes).
 * - Procesa un documento cada `MS_POR_DOCUMENTO`; los que contienen
 *   "escaneado" en el nombre terminan en error.
 * - Los documentos completados tienen un texto clínico de ejemplo con sus
 *   tramos, para el visor de revisión.
 */
import type {
  ApiEscritorio,
  Contadores,
  DocumentoRevision,
  EntradaHistorial,
  EstadoDocumento,
  EventoDocumento,
  FiltroDocumentos,
  TramoRevision,
} from "./escritorio";

const MS_POR_DOCUMENTO = 120;

const EJEMPLOS = [
  "Historia clínica - María Fernanda Gómez.pdf",
  "HC Juan Camilo Rodríguez 2026.pdf",
  "Epicrisis Laura Martínez Ospina.pdf",
  "Evolución UCI neonatal - escaneado.pdf",
  "Consulta externa Andrés Felipe Torres.pdf",
];

const TEXTO_EJEMPLO = [
  "HISTORIA CLÍNICA\nPaciente: Laura Martínez Ospina\nCC 1067618172\nFecha de nacimiento: 1990-11-28\n" +
    "Dirección: Cra 45C N° 20-98 piso 4, barrio Kennedy\nTeléfono: 3001234567\nEPS: Salud Total\n\n" +
    "MOTIVO DE CONSULTA\nPaciente de 35 años que consulta por cefalea de tres días de evolución. " +
    "Refiere que su hermana Rosalba la acompaña. Antecedente de migraña.",
  "VALORACIÓN\nAtendida por el Dr. Andrés Felipe Torres (RM 46002). Se solicitan paraclínicos. " +
    "Control con la enfermera Rosalba en cama 12 en 8 días.\n\nPLAN\nAcetaminofén 1 g cada 8 horas. " +
    "Cualquier novedad notificar al correo laura83@une.net.co.",
].join("\n\f\n");

// [texto, categoría] que el "detector" simulado encuentra (Rosalba y la cama, no).
const PII_EJEMPLO: [string, string][] = [
  ["Laura Martínez Ospina", "nombres"],
  ["1067618172", "documentos"],
  ["1990-11-28", "fechas"],
  ["Cra 45C N° 20-98 piso 4", "direcciones"],
  ["barrio Kennedy", "direcciones"],
  ["3001234567", "telefonos"],
  ["Salud Total", "seguros"],
  ["35 años", "edades"],
  ["Dr. Andrés Felipe Torres", "nombres"],
  ["46002", "numeros_registro"],
  ["laura83@une.net.co", "emails"],
];

interface DocSim {
  codigo: string;
  nombreOriginal: string;
  rutaOriginal: string;
  estado: EstadoDocumento;
  error: string;
  revisado: boolean;
  texto: string;
  tramos: TramoRevision[];
}

interface LoteSim {
  carpeta: string;
  creado: string;
  docs: DocSim[];
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

function codigo(usados: Set<string>): string {
  for (;;) {
    const c =
      "HC-" +
      Array.from({ length: 8 }, () => "23456789ABCDEFGHJKMNPQRSTUVWXYZ"[Math.floor(Math.random() * 31)]).join("");
    if (!usados.has(c)) {
      usados.add(c);
      return c;
    }
  }
}

function contar(docs: DocSim[]): Contadores {
  const c = { total: docs.length, completados: 0, errores: 0, pendientes: 0, revisados: 0, datosOcultados: 0 };
  for (const d of docs) {
    if (d.estado === "completado") c.completados++;
    else if (d.estado === "error") c.errores++;
    else c.pendientes++;
    if (d.revisado) c.revisados++;
    c.datosOcultados += d.tramos.filter((t) => t.activo).length;
  }
  return c;
}

const FILTRO: Record<FiltroDocumentos, (d: DocSim) => boolean> = {
  todos: () => true,
  completados: (d) => d.estado === "completado",
  errores: (d) => d.estado === "error",
  pendientes: (d) => d.estado === "pendiente" || d.estado === "procesando",
  revisados: (d) => d.revisado,
  sin_revisar: (d) => d.estado === "completado" && !d.revisado,
};

export function crearSimulador(): ApiEscritorio {
  const seleccion = new Map<string, number>();
  const lotes = new Map<string, LoteSim>();
  let actual: LoteSim | null = null;
  let activo = false;
  let pausar = false;
  let enCurso: EventoDocumento | null = null;
  const recientes: EventoDocumento[] = [];
  let siguienteTramo = 1;

  const resumen = () => ({ total: seleccion.size, tamano: [...seleccion.values()].reduce((a, b) => a + b, 0) });
  const agregar = (rutas: [string, number][]) => {
    let agregados = 0;
    let repetidos = 0;
    for (const [r, t] of rutas) {
      if (seleccion.has(r)) repetidos++;
      else {
        seleccion.set(r, t);
        agregados++;
      }
    }
    return { ...resumen(), agregados, repetidos };
  };

  function lote(carpeta: string): LoteSim {
    const l = lotes.get(carpeta);
    if (!l) throw new Error(`No hay un lote en ${carpeta}`);
    return l;
  }

  function doc(carpeta: string, cod: string): DocSim {
    const d = lote(carpeta).docs.find((x) => x.codigo === cod);
    if (!d) throw new Error(cod);
    return d;
  }

  const revision = (d: DocSim): DocumentoRevision => structuredClone({ ...d });

  async function procesar(l: LoteSim) {
    activo = true;
    for (const d of l.docs) {
      if (pausar) break;
      if (d.estado !== "pendiente") continue;
      d.estado = "procesando";
      enCurso = { codigo: d.codigo, nombre: d.nombreOriginal, estado: "procesando", totalPii: 0, error: "" };
      await espera(MS_POR_DOCUMENTO);
      if (d.nombreOriginal.includes("escaneado")) {
        d.estado = "error";
        d.error = "El PDF no tiene texto seleccionable (¿es un escaneo?). Pásalo primero por OCR.";
      } else {
        d.estado = "completado";
        d.texto = TEXTO_EJEMPLO;
        d.tramos = PII_EJEMPLO.flatMap(([valor, categoria]) => {
          const tramos: TramoRevision[] = [];
          for (let i = d.texto.indexOf(valor); i >= 0; i = d.texto.indexOf(valor, i + 1)) {
            tramos.push({ id: siguienteTramo++, inicio: i, fin: i + valor.length, categoria, origen: "auto", activo: true });
          }
          return tramos;
        }).sort((a, b) => a.inicio - b.inicio);
      }
      recientes.unshift({
        codigo: d.codigo,
        nombre: d.nombreOriginal,
        estado: d.estado,
        totalPii: d.tramos.length,
        error: d.error,
      });
      recientes.splice(8);
    }
    enCurso = null;
    activo = false;
  }

  return {
    async estado_motor() {
      return { listo: true, error: null };
    },
    async info() {
      return { version: "1.1.0", plataforma: "Navegador (simulado)" };
    },

    async agregar_rutas(rutas) {
      return agregar(rutas.map((r) => [r, 150_000]));
    },
    async seleccionar_archivos() {
      return agregar(EJEMPLOS.map((n, i) => [`/Users/demo/Historias/${n}`, 120_000 + i * 48_000]));
    },
    async seleccionar_carpeta_origen() {
      await espera(300);
      return agregar(
        Array.from({ length: 1200 }, (_, i): [string, number] => [
          `/Users/demo/Archivo HC/2025/HC_${String(i + 1).padStart(5, "0")}${i % 97 === 5 ? " - escaneado" : ""}.pdf`,
          90_000 + ((i * 7919) % 400_000),
        ]),
      );
    },
    async seleccion(offset, limite) {
      const archivos = [...seleccion.entries()].slice(offset, offset + limite).map(([ruta, tamano]) => ({
        ruta,
        nombre: ruta.split("/").pop() ?? ruta,
        tamano,
      }));
      return { ...resumen(), archivos };
    },
    async quitar_de_seleccion(ruta) {
      seleccion.delete(ruta);
      return resumen();
    },
    async limpiar_seleccion() {
      seleccion.clear();
      return resumen();
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

    async iniciar_lote(destino) {
      if (activo) return { ok: false, error: "Ya hay un lote en proceso." };
      if (seleccion.size === 0) return { ok: false, error: "No hay documentos para procesar." };
      const ahora = new Date();
      const carpeta = `${destino}/Lote_${ahora.toISOString().slice(0, 19).replace("T", "_").replaceAll(":", "")}`;
      const usados = new Set<string>();
      const l: LoteSim = {
        carpeta,
        creado: ahora.toISOString().slice(0, 19),
        docs: [...seleccion.keys()].map((ruta) => ({
          codigo: codigo(usados),
          nombreOriginal: ruta.split("/").pop() ?? ruta,
          rutaOriginal: ruta,
          estado: "pendiente",
          error: "",
          revisado: false,
          texto: "",
          tramos: [],
        })),
      };
      lotes.set(carpeta, l);
      seleccion.clear();
      actual = l;
      pausar = false;
      recientes.length = 0;
      void procesar(l);
      return { ok: true, carpeta };
    },
    async reanudar_lote(carpeta) {
      if (activo) return { ok: false, error: "Ya hay un lote en proceso." };
      const l = lote(carpeta);
      for (const d of l.docs) if (d.estado === "procesando") d.estado = "pendiente";
      actual = l;
      pausar = false;
      void procesar(l);
      return { ok: true, carpeta };
    },
    async pausar_lote() {
      pausar = true;
    },
    async estado_lote() {
      if (!actual) return null;
      const contadores = contar(actual.docs);
      return {
        carpeta: actual.carpeta,
        carpetaPdfs: `${actual.carpeta}/anonimizados`,
        relacionXlsx: `${actual.carpeta}/relacion_codigos.xlsx`,
        activo,
        pausando: activo && pausar,
        contadores,
        actual: activo ? structuredClone(enCurso) : null,
        recientes: structuredClone(recientes),
        porMinuto: activo ? Math.round(60_000 / MS_POR_DOCUMENTO) : null,
        segundosRestantes: activo ? Math.round((contadores.pendientes * MS_POR_DOCUMENTO) / 1000) : null,
        memoria: { disponibleMb: 6144, totalMb: 16384, procesoMb: 812, fragmento: 200_000, esperando: false },
      };
    },

    async abrir_lote(carpeta) {
      const l = lote(carpeta);
      return { carpeta, creado: l.creado, contadores: contar(l.docs), procesando: activo && actual === l };
    },
    async documentos(carpeta, offset, limite, filtro, busqueda) {
      const q = busqueda.trim().toLowerCase();
      const filtrados = lote(carpeta).docs.filter(
        (d) => FILTRO[filtro](d) && (!q || d.codigo.toLowerCase().includes(q) || d.nombreOriginal.toLowerCase().includes(q)),
      );
      return {
        total: filtrados.length,
        documentos: filtrados.slice(offset, offset + limite).map((d) => ({
          codigo: d.codigo,
          nombreOriginal: d.nombreOriginal,
          estado: d.estado,
          totalPii: d.tramos.filter((t) => t.activo).length,
          revisado: d.revisado,
          paginas: d.texto ? d.texto.split("\f").length : 0,
          error: d.error,
        })),
      };
    },
    async documento(carpeta, cod) {
      return revision(doc(carpeta, cod));
    },
    async ocultar(carpeta, cod, inicio, fin, categoria, todas) {
      const d = doc(carpeta, cod);
      while (inicio < fin && /\s/.test(d.texto[inicio]!)) inicio++;
      while (fin > inicio && /\s/.test(d.texto[fin - 1]!)) fin--;
      if (inicio >= fin) return revision(d);
      const rangos: [number, number][] = [[inicio, fin]];
      if (todas) {
        const frag = d.texto.slice(inicio, fin).toLowerCase();
        const bajo = d.texto.toLowerCase();
        for (let i = bajo.indexOf(frag); i >= 0; i = bajo.indexOf(frag, i + 1)) rangos.push([i, i + frag.length]);
      }
      for (let [ini, fn] of rangos) {
        for (const t of [...d.tramos]) {
          if (t.inicio < fn && ini < t.fin) {
            ini = Math.min(ini, t.inicio);
            fn = Math.max(fn, t.fin);
            d.tramos.splice(d.tramos.indexOf(t), 1);
          }
        }
        d.tramos.push({ id: siguienteTramo++, inicio: ini, fin: fn, categoria, origen: "manual", activo: true });
      }
      d.tramos.sort((a, b) => a.inicio - b.inicio);
      return revision(d);
    },
    async actualizar_tramo(carpeta, cod, tramoId, activoNuevo, categoria) {
      const t = doc(carpeta, cod).tramos.find((x) => x.id === tramoId);
      if (t && activoNuevo !== null) t.activo = activoNuevo;
      if (t && categoria !== null) t.categoria = categoria;
      return revision(doc(carpeta, cod));
    },
    async alternar_valor(carpeta, cod, tramoId, activoNuevo) {
      const d = doc(carpeta, cod);
      const base = d.tramos.find((t) => t.id === tramoId);
      if (!base) return { ids: [], documento: revision(d) };
      const clave = (t: TramoRevision) => d.texto.slice(t.inicio, t.fin).toLowerCase().split(/\s+/).join(" ");
      const ids: number[] = [];
      for (const t of d.tramos) {
        if (t.activo !== activoNuevo && clave(t) === clave(base)) {
          t.activo = activoNuevo;
          ids.push(t.id);
        }
      }
      return { ids, documento: revision(d) };
    },
    async fijar_tramos(carpeta, cod, ids, activoNuevo) {
      const d = doc(carpeta, cod);
      for (const t of d.tramos) if (ids.includes(t.id)) t.activo = activoNuevo;
      return revision(d);
    },
    async cambiar_categoria(carpeta, cod, ids, categoria) {
      const d = doc(carpeta, cod);
      for (const t of d.tramos) if (ids.includes(t.id)) t.categoria = categoria;
      return revision(d);
    },
    async mostrar_en_lote(carpeta, valor) {
      const v = valor.toLowerCase();
      let documentos = 0;
      let tramos = 0;
      for (const d of lote(carpeta).docs) {
        const cambiados = d.tramos.filter((t) => t.activo && d.texto.slice(t.inicio, t.fin).toLowerCase() === v);
        cambiados.forEach((t) => (t.activo = false));
        if (cambiados.length) documentos++;
        tramos += cambiados.length;
      }
      return { documentos, tramos };
    },
    async ocultar_en_lote(carpeta, valor, categoria) {
      let documentos = 0;
      let tramos = 0;
      for (const d of lote(carpeta).docs) {
        const i = d.texto.toLowerCase().indexOf(valor.toLowerCase());
        if (d.estado !== "completado" || i < 0) continue;
        const antes = d.tramos.length;
        await this.ocultar(carpeta, d.codigo, i, i + valor.length, categoria, true);
        documentos++;
        tramos += Math.max(1, d.tramos.length - antes);
      }
      return { documentos, tramos };
    },
    async marcar_revisado(carpeta, cod, revisado) {
      doc(carpeta, cod).revisado = revisado;
      return contar(lote(carpeta).docs);
    },
    async exportar_relacion(carpeta) {
      return `${carpeta}/relacion_codigos.xlsx`;
    },

    async historial(): Promise<EntradaHistorial[]> {
      return [...lotes.values()].reverse().map((l) => ({
        carpeta: l.carpeta,
        creado: l.creado,
        existe: true,
        procesando: activo && actual === l,
        contadores: contar(l.docs),
      }));
    },
  };
}
