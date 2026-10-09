/**
 * Lógica pura del visor de revisión: partir el texto original en páginas y
 * segmentos (texto normal / tramo ocultado), y traducir una selección del DOM a
 * offsets sobre el texto original.
 *
 * Cada segmento se renderiza como un elemento con `data-ini`/`data-fin` (y
 * `data-tramo` si es un tramo), con un único nodo de texto adentro y
 * `white-space: pre-wrap`: así un offset dentro del nodo de texto de un
 * segmento normal es exactamente `data-ini + offset` en el texto original
 * (mismas unidades UTF-16 que usa el backend al mandar los tramos).
 */
import type { TramoRevision } from "../../api/escritorio";

export const SALTO_PAGINA = "\f";

export interface Segmento {
  ini: number;
  fin: number;
  tramo?: TramoRevision;
}

export interface Pagina {
  numero: number;
  ini: number;
  fin: number;
  segmentos: Segmento[];
}

/** Páginas del texto (separadas por "\f") con sus segmentos. Los tramos que
 * cruzan un salto de página se recortan a cada página. */
export function paginar(texto: string, tramos: TramoRevision[]): Pagina[] {
  const ordenados = [...tramos].sort((a, b) => a.inicio - b.inicio || a.fin - b.fin);
  const paginas: Pagina[] = [];
  let inicio = 0;
  for (let numero = 1; ; numero++) {
    const salto = texto.indexOf(SALTO_PAGINA, inicio);
    let fin = salto === -1 ? texto.length : salto;
    let ini = inicio;
    // El extractor une las páginas con "\n\f\n": no mostrar esos saltos.
    if (texto[ini] === "\n") ini++;
    if (fin > ini && texto[fin - 1] === "\n") fin--;
    paginas.push({ numero, ini, fin, segmentos: segmentar(ini, fin, ordenados) });
    if (salto === -1) break;
    inicio = salto + 1;
  }
  return paginas;
}

function segmentar(ini: number, fin: number, tramos: TramoRevision[]): Segmento[] {
  const segmentos: Segmento[] = [];
  let cursor = ini;
  for (const t of tramos) {
    if (t.fin <= cursor || t.inicio >= fin) continue;
    const a = Math.max(t.inicio, cursor);
    const b = Math.min(t.fin, fin);
    if (a > cursor) segmentos.push({ ini: cursor, fin: a });
    segmentos.push({ ini: a, fin: b, tramo: t });
    cursor = b;
  }
  if (cursor < fin) segmentos.push({ ini: cursor, fin });
  return segmentos;
}

function segmentoDe(nodo: Node | null): HTMLElement | null {
  const el = nodo && (nodo.nodeType === Node.TEXT_NODE ? nodo.parentElement : (nodo as Element));
  return (el?.closest("[data-ini]") as HTMLElement | null) ?? null;
}

/** Offset en el texto original de un extremo de la selección. Dentro de un
 * tramo, el extremo se ajusta a su borde (el tramo entra entero o no entra). */
function offsetDe(nodo: Node, offset: number, extremo: "inicio" | "fin"): number | null {
  let seg = segmentoDe(nodo);
  if (seg && nodo.nodeType === Node.TEXT_NODE && !seg.dataset.tramo) {
    return Number(seg.dataset.ini) + offset;
  }
  if (!seg && nodo.nodeType === Node.ELEMENT_NODE) {
    // Extremo sobre un contenedor (p. ej. triple clic): el hijo en `offset`.
    const hijos = (nodo as Element).childNodes;
    const hijo = extremo === "inicio" ? hijos[offset] : hijos[offset - 1];
    if (!hijo) return null;
    const candidatos =
      hijo.nodeType === Node.ELEMENT_NODE
        ? [hijo as HTMLElement, ...(hijo as Element).querySelectorAll<HTMLElement>("[data-ini]")]
        : [];
    const conDatos = candidatos.filter((c) => c.dataset.ini !== undefined);
    seg = (extremo === "inicio" ? conDatos[0] : conDatos[conDatos.length - 1]) ?? null;
  }
  if (!seg) return null;
  return Number(extremo === "inicio" ? seg.dataset.ini : seg.dataset.fin);
}

/** Rango [inicio, fin) del texto original que cubre la selección, o null si
 * está vacía o cae fuera del documento. */
export function rangoDeSeleccion(rango: Range, contenedor: HTMLElement): { inicio: number; fin: number } | null {
  if (rango.collapsed || !contenedor.contains(rango.commonAncestorContainer)) return null;
  const inicio = offsetDe(rango.startContainer, rango.startOffset, "inicio");
  const fin = offsetDe(rango.endContainer, rango.endOffset, "fin");
  if (inicio === null || fin === null || fin <= inicio) return null;
  return { inicio, fin };
}
