/**
 * Flujo de anonimización en tres etapas, en la misma sección:
 *   preparar   -- cargar PDFs (arrastrar o seleccionar) y elegir carpeta destino
 *   procesando -- progreso del lote (mismo patrón visual que ModalAnonimizacion)
 *   resultado  -- relación archivo original ↔ código, y accesos a las carpetas
 *
 * El estado del lote vive en Python; aquí solo se consulta (`estado_lote`)
 * cada INTERVALO_MS mientras está activo.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  obtenerApi,
  type ArchivoPdf,
  type EstadoLote,
} from "../../api/escritorio";
import { useToast } from "../../components/Toast/useToast";
import { PasoPreparar } from "./PasoPreparar";
import { PasoProcesando } from "./PasoProcesando";
import { PasoResultado } from "./PasoResultado";

const INTERVALO_MS = 400;

export function SeccionAnonimizar() {
  const toast = useToast();
  const [archivos, setArchivos] = useState<ArchivoPdf[]>([]);
  const [destino, setDestino] = useState("");
  const [motorListo, setMotorListo] = useState(false);
  const [errorMotor, setErrorMotor] = useState<string | null>(null);
  const [lote, setLote] = useState<EstadoLote | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const sondeo = useRef<number | null>(null);

  // Carpeta destino por defecto + espera a que Python termine de cargar spaCy.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const api = await obtenerApi();
      const carpeta = await api.carpeta_predeterminada();
      if (vivo) setDestino((actual) => actual || carpeta);
      while (vivo) {
        const estado = await api.estado_motor();
        if (estado.listo || estado.error) {
          setMotorListo(estado.listo);
          setErrorMotor(estado.error);
          return;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const detenerSondeo = () => {
    if (sondeo.current !== null) window.clearInterval(sondeo.current);
    sondeo.current = null;
  };
  useEffect(() => detenerSondeo, []);

  const agregar = useCallback(
    (nuevos: ArchivoPdf[]) => {
      if (nuevos.length === 0) {
        toast.show({ tone: "warning", message: "No se encontraron archivos PDF." });
        return;
      }
      const rutas = new Set(archivos.map((a) => a.ruta));
      const sinRepetir = nuevos.filter((a) => !rutas.has(a.ruta));
      const repetidos = nuevos.length - sinRepetir.length;
      if (repetidos > 0) {
        toast.show({
          tone: "info",
          message: `${repetidos} ${repetidos === 1 ? "archivo ya estaba" : "archivos ya estaban"} en la lista.`,
        });
      }
      setArchivos([...archivos, ...sinRepetir]);
    },
    [archivos, toast],
  );

  async function iniciar() {
    setIniciando(true);
    const api = await obtenerApi();
    const r = await api.iniciar_lote(
      archivos.map((a) => a.ruta),
      destino,
    );
    setIniciando(false);
    if (!r.ok) {
      toast.show({ tone: "error", message: "No se pudo iniciar el lote", description: r.error });
      return;
    }
    setLote(await api.estado_lote());
    detenerSondeo();
    sondeo.current = window.setInterval(async () => {
      const estado = await api.estado_lote();
      setLote(estado);
      if (estado && !estado.activo) {
        detenerSondeo();
        const errores = estado.documentos.filter((d) => d.estado === "error").length;
        toast.show({
          tone: errores > 0 ? "warning" : "success",
          message: estado.cancelado ? "Lote cancelado" : "Lote terminado",
          description:
            errores > 0
              ? `${errores} ${errores === 1 ? "documento no se pudo" : "documentos no se pudieron"} anonimizar.`
              : undefined,
        });
      }
    }, INTERVALO_MS);
  }

  async function cancelar() {
    await (await obtenerApi()).cancelar_lote();
  }

  function nuevoLote() {
    setLote(null);
    setArchivos([]);
  }

  if (lote?.activo) {
    return <PasoProcesando lote={lote} onCancelar={cancelar} />;
  }
  if (lote) {
    return <PasoResultado lote={lote} onNuevoLote={nuevoLote} />;
  }
  return (
    <PasoPreparar
      archivos={archivos}
      destino={destino}
      motorListo={motorListo}
      errorMotor={errorMotor}
      iniciando={iniciando}
      onAgregar={agregar}
      onQuitar={(ruta) => setArchivos((a) => a.filter((x) => x.ruta !== ruta))}
      onLimpiar={() => setArchivos([])}
      onCambiarDestino={setDestino}
      onIniciar={iniciar}
    />
  );
}
