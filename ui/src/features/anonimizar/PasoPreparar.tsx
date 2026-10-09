import { useEffect, useState } from "react";
import {
  EVENTO_ARCHIVOS_SOLTADOS,
  esSimulado,
  obtenerApi,
  type ArchivoPdf,
} from "../../api/escritorio";
import { Button } from "../../components/Button/Button";
import { IconButton } from "../../components/IconButton/IconButton";
import { getIconGlyph } from "../../styles/ds/foundations/icons/icons";
import { formatearTamano, plural } from "./formato";

export interface PasoPrepararProps {
  archivos: ArchivoPdf[];
  destino: string;
  motorListo: boolean;
  errorMotor: string | null;
  iniciando: boolean;
  onAgregar: (archivos: ArchivoPdf[]) => void;
  onQuitar: (ruta: string) => void;
  onLimpiar: () => void;
  onCambiarDestino: (carpeta: string) => void;
  onIniciar: () => void;
}

export function PasoPreparar({
  archivos,
  destino,
  motorListo,
  errorMotor,
  iniciando,
  onAgregar,
  onQuitar,
  onLimpiar,
  onCambiarDestino,
  onIniciar,
}: PasoPrepararProps) {
  const [arrastrando, setArrastrando] = useState(false);

  // En la app de escritorio, Python recibe el drop (tiene las rutas reales del
  // disco, el navegador no) y las reenvía como un evento de ventana.
  useEffect(() => {
    const alSoltar = (e: Event) => onAgregar((e as CustomEvent<ArchivoPdf[]>).detail);
    window.addEventListener(EVENTO_ARCHIVOS_SOLTADOS, alSoltar);
    return () => window.removeEventListener(EVENTO_ARCHIVOS_SOLTADOS, alSoltar);
  }, [onAgregar]);

  async function seleccionar() {
    onAgregar(await (await obtenerApi()).seleccionar_archivos());
  }

  async function cambiarDestino() {
    const carpeta = await (await obtenerApi()).seleccionar_carpeta(destino);
    if (carpeta) onCambiarDestino(carpeta);
  }

  function alSoltarEnNavegador(e: React.DragEvent) {
    e.preventDefault();
    setArrastrando(false);
    // Solo en el simulador del navegador: en escritorio lo maneja Python.
    if (!esSimulado()) return;
    const pdfs = Array.from(e.dataTransfer.files)
      .filter((f) => f.name.toLowerCase().endsWith(".pdf"))
      .map((f) => ({ ruta: `/simulado/${f.name}`, nombre: f.name, tamano: f.size }));
    onAgregar(pdfs);
  }

  const tamanoTotal = archivos.reduce((s, a) => s + a.tamano, 0);

  return (
    <div className="anz-seccion">
      <p className="anz-intro">
        Carga historias clínicas en PDF. Cada documento se anonimiza en este equipo, sin enviar datos a
        internet, y recibe un código nuevo. Al final obtienes los PDFs anonimizados y una tabla que
        relaciona cada archivo original con su código.
      </p>

      <div
        className={"anz-drop" + (arrastrando ? " is-dragging" : "")}
        role="button"
        tabIndex={0}
        onClick={seleccionar}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void seleccionar();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={alSoltarEnNavegador}
      >
        <span className="material-symbols-outlined anz-drop__icono" aria-hidden="true">
          {getIconGlyph("upload_file")}
        </span>
        <span className="anz-drop__titulo">
          Arrastra historias clínicas o <span className="anz-drop__enlace">selecciónalas</span>
        </span>
        <span className="anz-drop__ayuda">Archivos PDF con texto · también puedes arrastrar carpetas completas</span>
      </div>

      {archivos.length > 0 && (
        <section className="anz-tarjeta" aria-labelledby="anz-lista-titulo">
          <div className="anz-tarjeta__cabecera">
            <h2 id="anz-lista-titulo" className="anz-tarjeta__titulo">
              {plural(archivos.length, "documento", "documentos")}
              <span className="anz-tarjeta__meta"> · {formatearTamano(tamanoTotal)}</span>
            </h2>
            <Button variant="ghost" size="sm" onClick={onLimpiar}>
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
                <IconButton icon="close" label={`Quitar ${a.nombre}`} size="sm" onClick={() => onQuitar(a.ruta)} />
              </li>
            ))}
          </ul>
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
          Se crea una carpeta nueva por lote con los PDFs anonimizados y la tabla de relación de códigos.
        </p>
      </section>

      {errorMotor && (
        <p role="alert" className="anz-aviso anz-aviso--error">
          <span className="material-symbols-outlined" aria-hidden="true">
            {getIconGlyph("error")}
          </span>
          No se pudo iniciar el motor de anonimización: {errorMotor}
        </p>
      )}

      <div className="anz-acciones">
        <Button
          size="lg"
          disabled={archivos.length === 0 || !motorListo}
          loading={iniciando || (!motorListo && !errorMotor)}
          iconLeft={
            <span className="material-symbols-outlined" aria-hidden="true">
              {getIconGlyph("shield")}
            </span>
          }
          onClick={onIniciar}
        >
          {!motorListo && !errorMotor
            ? "Preparando motor…"
            : archivos.length > 0
              ? `Anonimizar ${plural(archivos.length, "documento", "documentos")}`
              : "Anonimizar"}
        </Button>
      </div>
    </div>
  );
}
