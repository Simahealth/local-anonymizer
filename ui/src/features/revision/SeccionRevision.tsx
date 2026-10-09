/**
 * Revisión de un lote: lista de documentos | visor | datos ocultados.
 *
 * Todo cambio (ocultar, mostrar, cambiar categoría, marcar revisado) se guarda
 * al instante en lote.sqlite y regenera el PDF anonimizado del documento. La
 * tabla de relación (Excel/CSV) se reescribe con "Actualizar tabla" o al
 * terminar/pausar un lote, porque con 50 000 filas tarda unos segundos.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  obtenerApi,
  type DocumentoRevision,
  type EntradaHistorial,
  type FiltroDocumentos,
  type InfoLote,
  type ResumenDocumento,
  type TramoRevision,
} from "../../api/escritorio";
import { Badge } from "../../components/Badge/Badge";
import { Button } from "../../components/Button/Button";
import { IconButton } from "../../components/IconButton/IconButton";
import { Spinner } from "../../components/Spinner/Spinner";
import { useToast } from "../../components/Toast/useToast";
import { getIconGlyph } from "../../styles/ds/foundations/icons/icons";
import { plural } from "../anonimizar/formato";
import { ListaDocumentos, POR_PAGINA } from "./ListaDocumentos";
import { PanelTramos } from "./PanelTramos";
import type { GrupoTramos } from "./segmentos";
import { VisorDocumento, type ModoVisor } from "./VisorDocumento";
import "../../styles/revision.css";

const icono = (nombre: Parameters<typeof getIconGlyph>[0]) => (
  <span className="material-symbols-outlined" aria-hidden="true">
    {getIconGlyph(nombre)}
  </span>
);

function nombreLote(carpeta: string): string {
  return carpeta.split(/[\\/]/).pop() ?? carpeta;
}

/** Elegir lote cuando se entra a Revisión sin uno abierto. */
function ElegirLote({ onElegir }: { onElegir: (carpeta: string) => void }) {
  const [lotes, setLotes] = useState<EntradaHistorial[] | null>(null);
  useEffect(() => {
    void obtenerApi()
      .then((api) => api.historial())
      .then(setLotes);
  }, []);
  if (!lotes) return <Spinner label="Cargando lotes…" />;
  const revisables = lotes.filter((l) => l.existe && (l.contadores?.completados ?? 0) > 0);
  if (revisables.length === 0) {
    return (
      <div className="anz-vacio">
        <span className="material-symbols-outlined" aria-hidden="true">
          {getIconGlyph("rate_review")}
        </span>
        <p>Todavía no hay documentos anonimizados para revisar.</p>
      </div>
    );
  }
  return (
    <ul className="anz-lotes" aria-label="Lotes para revisar">
      {revisables.map((l) => (
        <li key={l.carpeta} className="anz-lote">
          <span className="material-symbols-outlined anz-lote__icono" aria-hidden="true">
            {getIconGlyph("folder")}
          </span>
          <div className="anz-lote__cuerpo">
            <span className="anz-lote__titulo">{nombreLote(l.carpeta)}</span>
            <span className="anz-lote__ruta" title={l.carpeta}>
              {l.carpeta}
            </span>
            <span className="anz-lote__badges">
              <Badge tone="success" size="sm">
                {plural(l.contadores!.completados, "anonimizado", "anonimizados")}
              </Badge>
              <Badge tone="info" size="sm">
                {plural(l.contadores!.revisados, "revisado", "revisados")}
              </Badge>
            </span>
          </div>
          <Button variant="outlined" size="sm" onClick={() => onElegir(l.carpeta)}>
            Revisar
          </Button>
        </li>
      ))}
    </ul>
  );
}

export interface SeccionRevisionProps {
  carpeta: string | null;
  onCarpeta: (carpeta: string | null) => void;
}

export function SeccionRevision({ carpeta, onCarpeta }: SeccionRevisionProps) {
  const toast = useToast();
  const [info, setInfo] = useState<InfoLote | null>(null);
  const [filtro, setFiltro] = useState<FiltroDocumentos>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [offset, setOffset] = useState(0);
  const [pagina, setPagina] = useState<{ total: number; documentos: ResumenDocumento[] }>({ total: 0, documentos: [] });
  const [cargandoLista, setCargandoLista] = useState(false);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [doc, setDoc] = useState<DocumentoRevision | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [modo, setModo] = useState<ModoVisor>("revision");
  const [enfoque, setEnfoque] = useState<{ id: number; n: number } | null>(null);
  const [exportando, setExportando] = useState(false);
  const busquedaTimer = useRef<number | null>(null);

  const recargarInfo = useCallback(async () => {
    if (!carpeta) return;
    setInfo(await (await obtenerApi()).abrir_lote(carpeta));
  }, [carpeta]);

  const cargarLista = useCallback(
    async (o: number, f: FiltroDocumentos, q: string) => {
      if (!carpeta) return null;
      setCargandoLista(true);
      try {
        const r = await (await obtenerApi()).documentos(carpeta, o, POR_PAGINA, f, q);
        setPagina(r);
        return r;
      } finally {
        setCargandoLista(false);
      }
    },
    [carpeta],
  );

  // Lote nuevo: estado limpio y primer documento.
  useEffect(() => {
    setCodigo(null);
    setDoc(null);
    setOffset(0);
    setBusqueda("");
    setFiltro("todos");
    if (!carpeta) return;
    void (async () => {
      try {
        await recargarInfo();
      } catch {
        toast.show({ tone: "error", message: "No se pudo abrir el lote", description: carpeta });
        onCarpeta(null);
        return;
      }
      const r = await cargarLista(0, "todos", "");
      const primero = r?.documentos.find((d) => d.estado === "completado") ?? r?.documentos[0];
      if (primero) setCodigo(primero.codigo);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carpeta]);

  // Documento elegido → su texto y tramos.
  useEffect(() => {
    if (!carpeta || !codigo) return;
    let vivo = true;
    void (async () => {
      const d = await (await obtenerApi()).documento(carpeta, codigo);
      if (vivo) setDoc(d);
    })();
    return () => {
      vivo = false;
    };
  }, [carpeta, codigo]);

  function cambiarFiltro(f: FiltroDocumentos) {
    setFiltro(f);
    setOffset(0);
    void cargarLista(0, f, busqueda);
  }

  function cambiarBusqueda(q: string) {
    setBusqueda(q);
    if (busquedaTimer.current) window.clearTimeout(busquedaTimer.current);
    busquedaTimer.current = window.setTimeout(() => {
      setOffset(0);
      void cargarLista(0, filtro, q);
    }, 300);
  }

  function cambiarPagina(o: number) {
    setOffset(o);
    void cargarLista(o, filtro, busqueda);
  }

  /** Aplica un cambio al documento abierto y refleja el resultado. */
  async function editar(accion: () => Promise<DocumentoRevision>) {
    setOcupado(true);
    try {
      const actualizado = await accion();
      setDoc(actualizado);
      const activos = actualizado.tramos.filter((t) => t.activo).length;
      setPagina((p) => ({
        ...p,
        documentos: p.documentos.map((d) => (d.codigo === actualizado.codigo ? { ...d, totalPii: activos } : d)),
      }));
    } catch (e) {
      toast.show({ tone: "error", message: "No se pudo guardar el cambio", description: String(e) });
    } finally {
      setOcupado(false);
    }
  }

  const textoDe = (t: TramoRevision) => doc!.texto.slice(t.inicio, t.fin).replace(/\s+/g, " ").trim();
  const veces = (n: number) => (n === 1 ? "1 vez" : `${n} veces`);

  /** Tocar: muestra u oculta el valor en todas sus apariciones del documento,
   * con "Deshacer" en el aviso. */
  async function alternar(t: TramoRevision) {
    const valor = textoDe(t);
    const mostrar = t.activo;
    let ids: number[] = [];
    await editar(async () => {
      const r = await (await obtenerApi()).alternar_valor(carpeta!, codigo!, t.id, !mostrar);
      ids = r.ids;
      return r.documento;
    });
    toast.show({
      tone: "neutral",
      message: `${mostrar ? "Visible" : "Oculto"}: “${valor}”`,
      description: `${veces(ids.length)} en este documento`,
      action: {
        label: "Deshacer",
        onClick: () => void editar(async () => (await obtenerApi()).fijar_tramos(carpeta!, codigo!, ids, mostrar)),
      },
    });
  }

  async function ocultar(inicio: number, fin: number, categoria: string, alcance: "documento" | "lote") {
    const valor = doc!.texto.slice(inicio, fin).replace(/\s+/g, " ").trim();
    if (alcance === "documento") {
      await editar(async () => (await obtenerApi()).ocultar(carpeta!, codigo!, inicio, fin, categoria, true));
      return;
    }
    await enLote(async (api) => api.ocultar_en_lote(carpeta!, valor, categoria), `Oculto en el lote: “${valor}”`);
  }

  /** Operación sobre todo el lote: recarga el documento abierto y los contadores. */
  async function enLote(
    accion: (api: Awaited<ReturnType<typeof obtenerApi>>) => Promise<{ documentos: number; tramos: number }>,
    mensaje: string,
  ) {
    setOcupado(true);
    try {
      const api = await obtenerApi();
      const r = await accion(api);
      setDoc(await api.documento(carpeta!, codigo!));
      void cargarLista(offset, filtro, busqueda);
      void recargarInfo();
      toast.show({
        tone: "success",
        message: mensaje,
        description: `${veces(r.tramos)} en ${r.documentos === 1 ? "1 documento" : `${r.documentos} documentos`}`,
      });
    } catch (e) {
      toast.show({ tone: "error", message: "No se pudo aplicar en el lote", description: String(e) });
    } finally {
      setOcupado(false);
    }
  }

  function loteGrupo(g: GrupoTramos) {
    if (g.activos > 0) {
      void enLote(async (api) => api.mostrar_en_lote(carpeta!, g.texto), `Visible en el lote: “${g.texto}”`);
    } else {
      void enLote(async (api) => api.ocultar_en_lote(carpeta!, g.texto, g.categoria), `Oculto en el lote: “${g.texto}”`);
    }
  }

  const categoriaGrupo = (g: GrupoTramos, categoria: string) =>
    editar(async () => (await obtenerApi()).cambiar_categoria(carpeta!, codigo!, g.tramos.map((t) => t.id), categoria));

  async function irA(delta: 1 | -1) {
    const docs = pagina.documentos;
    const i = docs.findIndex((d) => d.codigo === codigo);
    const destino = docs[i + delta];
    if (destino) {
      setCodigo(destino.codigo);
      return;
    }
    // Fuera de la página actual: cargar la vecina.
    const nuevoOffset = offset + delta * POR_PAGINA;
    if (nuevoOffset < 0 || nuevoOffset >= pagina.total) return;
    setOffset(nuevoOffset);
    const r = await cargarLista(nuevoOffset, filtro, busqueda);
    const elegido = delta === 1 ? r?.documentos[0] : r?.documentos.at(-1);
    if (elegido) setCodigo(elegido.codigo);
  }

  async function marcarRevisado(revisado: boolean, siguiente: boolean) {
    if (!carpeta || !codigo || !doc) return;
    const contadores = await (await obtenerApi()).marcar_revisado(carpeta, codigo, revisado);
    setInfo((i) => (i ? { ...i, contadores } : i));
    setDoc({ ...doc, revisado });
    setPagina((p) => ({
      ...p,
      documentos: p.documentos.map((d) => (d.codigo === codigo ? { ...d, revisado } : d)),
    }));
    if (siguiente) await irA(1);
  }

  async function exportar() {
    if (!carpeta) return;
    setExportando(true);
    try {
      await (await obtenerApi()).exportar_relacion(carpeta);
      toast.show({ tone: "success", message: "Tabla de relación actualizada" });
    } finally {
      setExportando(false);
    }
  }

  async function abrir(ruta: string) {
    const ok = await (await obtenerApi()).abrir_ruta(ruta);
    if (!ok) toast.show({ tone: "error", message: "No se encontró el archivo", description: ruta });
  }

  if (!carpeta) {
    return (
      <div className="anz-seccion">
        <ElegirLote onElegir={onCarpeta} />
      </div>
    );
  }

  const i = pagina.documentos.findIndex((d) => d.codigo === codigo);
  const hayAnterior = i > 0 || offset > 0;
  const haySiguiente = (i >= 0 && i < pagina.documentos.length - 1) || offset + POR_PAGINA < pagina.total;
  const c = info?.contadores;

  return (
    <div className="rev">
      <div className="rev__cabecera">
        <div className="rev__lote">
          <span className="rev__lote-nombre">{nombreLote(carpeta)}</span>
          {c && (
            <span className="anz-nota">
              {c.revisados.toLocaleString("es-CO")} de {c.completados.toLocaleString("es-CO")} revisados
              {info?.procesando && " · el lote se sigue procesando"}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => onCarpeta(null)}>
          Cambiar lote
        </Button>
        <Button variant="outlined" size="sm" iconLeft={icono("folder")} onClick={() => abrir(carpeta)}>
          Carpeta del lote
        </Button>
        <Button variant="outlined" size="sm" iconLeft={icono("table_rows")} loading={exportando} onClick={exportar}>
          Actualizar tabla de relación
        </Button>
      </div>

      <div className="rev__cuerpo">
        <ListaDocumentos
          documentos={pagina.documentos}
          total={pagina.total}
          offset={offset}
          filtro={filtro}
          busqueda={busqueda}
          seleccionado={codigo}
          cargando={cargandoLista}
          onFiltro={cambiarFiltro}
          onBusqueda={cambiarBusqueda}
          onPagina={cambiarPagina}
          onElegir={setCodigo}
          onRecargar={() => {
            void recargarInfo();
            void cargarLista(offset, filtro, busqueda);
          }}
        />

        <section className="rev__documento" aria-label="Documento">
          {!doc ? (
            <div className="rev__vacio">
              {codigo ? <Spinner label="Abriendo documento…" /> : <p className="anz-nota">Elige un documento.</p>}
            </div>
          ) : (
            <>
              <div className="rev__doc-cabecera">
                <IconButton icon="chevron_left" label="Documento anterior" disabled={!hayAnterior} onClick={() => void irA(-1)} />
                <div className="rev__doc-titulo">
                  <span className="rev__doc-nombre" title={doc.rutaOriginal}>
                    {doc.nombreOriginal}
                  </span>
                  <span className="rev__doc-meta">
                    <span className="anz-codigo">{doc.codigo}</span>
                    {doc.revisado && (
                      <Badge tone="success" size="sm">
                        Revisado
                      </Badge>
                    )}
                    {ocupado && <Spinner size="xs" label="Guardando…" />}
                  </span>
                </div>
                <IconButton icon="chevron_right" label="Documento siguiente" disabled={!haySiguiente} onClick={() => void irA(1)} />
                <div className="rev__doc-acciones">
                  <Button variant="ghost" size="sm" iconLeft={icono("open_in_new")} onClick={() => abrir(doc.rutaOriginal)}>
                    PDF original
                  </Button>
                  {doc.estado === "completado" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      iconLeft={icono("open_in_new")}
                      onClick={() => abrir(`${carpeta}/anonimizados/${doc.codigo}.pdf`)}
                    >
                      PDF anonimizado
                    </Button>
                  )}
                  {doc.estado === "completado" &&
                    (doc.revisado ? (
                      <Button variant="outlined" size="sm" onClick={() => void marcarRevisado(false, false)}>
                        Quitar revisado
                      </Button>
                    ) : (
                      <Button size="sm" iconLeft={icono("check")} onClick={() => void marcarRevisado(true, true)}>
                        Revisado y siguiente
                      </Button>
                    ))}
                </div>
              </div>

              {doc.estado === "completado" ? (
                <div className="rev__visor-y-panel">
                  <VisorDocumento
                    doc={doc}
                    modo={modo}
                    onModo={setModo}
                    ocupado={ocupado}
                    enfoque={enfoque}
                    onAlternar={(t) => void alternar(t)}
                    onOcultar={(i, f, c, a) => void ocultar(i, f, c, a)}
                  />
                  <PanelTramos
                    doc={doc}
                    onEnfocar={(t) => setEnfoque((e) => ({ id: t.id, n: (e?.n ?? 0) + 1 }))}
                    onAlternar={(t) => void alternar(t)}
                    onCategoria={(g, c) => void categoriaGrupo(g, c)}
                    onLote={loteGrupo}
                  />
                </div>
              ) : (
                <div className="rev__vacio">
                  <p className="anz-aviso anz-aviso--error">
                    {icono("error")}
                    {doc.error || "Este documento todavía no se ha procesado."}
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
