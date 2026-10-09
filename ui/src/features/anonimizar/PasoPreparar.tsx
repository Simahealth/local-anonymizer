/**
 * Preparación del lote. La selección vive en Python (puede tener decenas de
 * miles de rutas): aquí solo se muestra el resumen y una página de la lista,
 * que crece con "Mostrar más".
 */
import { useCallback, useEffect, useState } from "react";
import {
  EVENTO_BUSCANDO,
  EVENTO_SELECCION,
  esSimulado,
  obtenerApi,
  type ArchivoPdf,
  type ResumenSeleccion,
} from "../../api/escritorio";
import { Button } from "../../components/Button/Button";
import { IconButton } from "../../components/IconButton/IconButton";
import { Spinner } from "../../components/Spinner/Spinner";
import { useToast } from "../../components/Toast/useToast";
import { getIconGlyph } from "../../styles/ds/foundations/icons/icons";
import { formatearTamano, plural } from "./formato";

const PAGINA = 100;

export interface PasoPrepararProps {
  destino: string;
  motorListo: boolean;
  errorMotor: string | null;
  iniciando: boolean;
  onCambiarDestino: (carpeta: string) => void;
  onIniciar: () => void;
}

const icono = (nombre: Parameters<typeof getIconGlyph>[0]) => (
  <span className="material-symbols-outlined" aria-hidden="true">
    {getIconGlyph(nombre)}
  </span>
);

export function PasoPreparar({
  destino,
  motorListo,
  errorMotor,
  iniciando,
  onCambiarDestino,
  onIniciar,
}: PasoPrepararProps) {
  const toast = useToast();
  const [resumen, setResumen] = useState<ResumenSeleccion>({ total: 0, tamano: 0 });
  const [archivos, setArchivos] = useState<ArchivoPdf[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);

  const recargarLista = useCallback(async (cantidad = PAGINA) => {
    const pagina = await (await obtenerApi()).seleccion(0, cantidad);
    setResumen(pagina);
    setArchivos(pagina.archivos);
  }, []);

  const informar = useCallback(
    async (r: ResumenSeleccion) => {
      setBuscando(false);
      if (r.agregados === 0 && !r.repetidos) {
        toast.show({ tone: "warning", message: "No se encontraron archivos PDF." });
      } else if (r.repetidos) {
        toast.show({
          tone: "info",
          message: `${plural(r.agregados ?? 0, "documento agregado", "documentos agregados")}`,
          description: `${plural(r.repetidos, "ya estaba", "ya estaban")} en la lista.`,
        });
      }
      await recargarLista(Math.max(PAGINA, archivos.length));
    },
    [toast, recargarLista, archivos.length],
  );

  useEffect(() => {
    void recargarLista();
  }, [recargarLista]);

  // En la app de escritorio, Python recibe el drop (tiene las rutas reales del
  // disco, el navegador no), lo agrega a la selección y avisa con el resumen.
  useEffect(() => {
    const alBuscar = () => setBuscando(true);
    const alSeleccionar = (e: Event) => void informar((e as CustomEvent<ResumenSeleccion>).detail);
    window.addEventListener(EVENTO_BUSCANDO, alBuscar);
    window.addEventListener(EVENTO_SELECCION, alSeleccionar);
    return () => {
      window.removeEventListener(EVENTO_BUSCANDO, alBuscar);
      window.removeEventListener(EVENTO_SELECCION, alSeleccionar);
    };
  }, [informar]);

  async function agregar(origen: "archivos" | "carpeta") {
    const api = await obtenerApi();
    setBuscando(true);
    try {
      await informar(origen === "archivos" ? await api.seleccionar_archivos() : await api.seleccionar_carpeta_origen());
    } finally {
      setBuscando(false);
    }
  }

  async function quitar(ruta: string) {
    await (await obtenerApi()).quitar_de_seleccion(ruta);
    await recargarLista(archivos.length);
  }

  async function limpiar() {
    await (await obtenerApi()).limpiar_seleccion();
    await recargarLista();
  }

  async function cambiarDestino() {
    const carpeta = await (await obtenerApi()).seleccionar_carpeta(destino);
    if (carpeta) onCambiarDestino(carpeta);
  }

  async function alSoltarEnNavegador(e: React.DragEvent) {
    e.preventDefault();
    setArrastrando(false);
    // Solo en el simulador del navegador: en escritorio lo maneja Python.
    if (!esSimulado()) return;
    const rutas = Array.from(e.dataTransfer.files)
      .filter((f) => f.name.toLowerCase().endsWith(".pdf"))
      .map((f) => `/simulado/${f.name}`);
    await informar(await (await obtenerApi()).agregar_rutas(rutas));
  }

  return (
    <div className="anz-seccion">
      <p className="anz-intro">
        Carga historias clínicas en PDF, de a una o carpetas completas (decenas de miles de documentos). Cada
        documento se anonimiza en este equipo, sin enviar datos a internet, y recibe un código nuevo. El avance se
        guarda documento a documento: puedes pausar, cerrar la app y continuar después.
      </p>

      <div
        className={"anz-drop" + (arrastrando ? " is-dragging" : "")}
        role="button"
        tabIndex={0}
        aria-label="Arrastra historias clínicas o carpetas, o selecciónalas"
        onClick={() => void agregar("archivos")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void agregar("archivos");
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={alSoltarEnNavegador}
      >
        {buscando ? (
          <Spinner size="md" label="Buscando archivos PDF…" />
        ) : (
          <>
            <span className="material-symbols-outlined anz-drop__icono" aria-hidden="true">
              {getIconGlyph("upload_file")}
            </span>
            <span className="anz-drop__titulo">
              Arrastra historias clínicas o carpetas, o <span className="anz-drop__enlace">selecciónalas</span>
            </span>
            <span className="anz-drop__ayuda">Archivos PDF con texto · las carpetas se recorren con sus subcarpetas</span>
          </>
        )}
      </div>

      <div className="anz-acciones anz-acciones--inicio">
        <Button variant="outlined" size="sm" iconLeft={icono("description")} onClick={() => void agregar("archivos")}>
          Agregar archivos
        </Button>
        <Button variant="outlined" size="sm" iconLeft={icono("folder")} onClick={() => void agregar("carpeta")}>
          Agregar carpeta
        </Button>
      </div>

      {resumen.total > 0 && (
        <section className="anz-tarjeta" aria-labelledby="anz-lista-titulo">
          <div className="anz-tarjeta__cabecera">
            <h2 id="anz-lista-titulo" className="anz-tarjeta__titulo">
              {plural(resumen.total, "documento", "documentos")}
              <span className="anz-tarjeta__meta"> · {formatearTamano(resumen.tamano)}</span>
            </h2>
            <Button variant="ghost" size="sm" onClick={limpiar}>
              Quitar todos
            </Button>
          </div>
          <ul className="anz-archivos" aria-label="Documentos a anonimizar">
            {archivos.map((a) => (
              <li key={a.ruta} className="anz-archivo">
                <span className="material-symbols-outlined anz-archivo__icono" aria-hidden="true">
                  {getIconGlyph("description")}
                </span>
                <span className="anz-archivo__cuerpo">
                  <span className="anz-archivo__nombre" title={a.ruta}>
                    {a.nombre}
                  </span>
                  <span className="anz-archivo__meta">{formatearTamano(a.tamano)}</span>
                </span>
                <IconButton icon="close" label={`Quitar ${a.nombre}`} size="sm" onClick={() => void quitar(a.ruta)} />
              </li>
            ))}
          </ul>
          {archivos.length < resumen.total && (
            <div className="anz-mas">
              <span className="anz-nota">
                Mostrando {archivos.length.toLocaleString("es-CO")} de {resumen.total.toLocaleString("es-CO")}
              </span>
              <Button variant="ghost" size="sm" onClick={() => void recargarLista(archivos.length + PAGINA * 5)}>
                Mostrar más
              </Button>
            </div>
          )}
        </section>
      )}

      <section className="anz-tarjeta" aria-labelledby="anz-destino-titulo">
        <h2 id="anz-destino-titulo" className="anz-etiqueta">
          Carpeta de destino
        </h2>
        <div className="anz-destino">
          <span className="material-symbols-outlined anz-destino__icono" aria-hidden="true">
            {getIconGlyph("folder")}
          </span>
          <span className="anz-destino__ruta" title={destino}>
            {/* <bdi>: el contenedor es rtl para recortar por la izquierda; sin
                aislar, la "/" inicial de la ruta se dibuja al final. */}
            <bdi>{destino || "—"}</bdi>
          </span>
          <Button variant="outlined" size="sm" onClick={cambiarDestino}>
            Cambiar
          </Button>
        </div>
        <p className="anz-nota">
          Se crea una carpeta nueva por lote con los PDFs anonimizados, la tabla de relación de códigos y los datos
          de revisión.
        </p>
      </section>

      {errorMotor && (
        <p role="alert" className="anz-aviso anz-aviso--error">
          {icono("error")}
          No se pudo iniciar el motor de anonimización: {errorMotor}
        </p>
      )}

      <div className="anz-acciones">
        <Button
          size="lg"
          disabled={resumen.total === 0 || !motorListo || buscando}
          loading={iniciando || (!motorListo && !errorMotor)}
          iconLeft={icono("shield")}
          onClick={onIniciar}
        >
          {!motorListo && !errorMotor
            ? "Preparando motor…"
            : resumen.total > 0
              ? `Anonimizar ${plural(resumen.total, "documento", "documentos")}`
              : "Anonimizar"}
        </Button>
      </div>
    </div>
  );
}
