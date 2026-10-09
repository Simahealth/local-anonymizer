/**
 * Flujo de anonimización en tres etapas, en la misma sección:
 *   preparar   -- cargar PDFs (archivos o carpetas) y elegir carpeta destino
 *   procesando -- progreso del lote, con pausa
 *   resultado  -- totales, errores, accesos a la revisión y a las carpetas
 *
 * El estado del lote vive en Python (y en lote.sqlite); aquí solo se consulta
 * un resumen (`estado_lote`) cada INTERVALO_MS mientras está activo.
 */
import { useEffect, useRef, useState } from "react";
import { obtenerApi, type EstadoLote } from "../../api/escritorio";
import { useToast } from "../../components/Toast/useToast";
import { PasoPreparar } from "./PasoPreparar";
import { PasoProcesando } from "./PasoProcesando";
import { PasoResultado } from "./PasoResultado";

const INTERVALO_MS = 500;

export interface SeccionAnonimizarProps {
  onRevisar: (carpeta: string) => void;
  /** Carpeta de un lote a reanudar (desde el Historial). */
  reanudar: string | null;
  onReanudado: () => void;
}

export function SeccionAnonimizar({ onRevisar, reanudar, onReanudado }: SeccionAnonimizarProps) {
  const toast = useToast();
  const [destino, setDestino] = useState("");
  const [motorListo, setMotorListo] = useState(false);
  const [errorMotor, setErrorMotor] = useState<string | null>(null);
  const [lote, setLote] = useState<EstadoLote | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const sondeo = useRef<number | null>(null);

  const detenerSondeo = () => {
    if (sondeo.current !== null) window.clearInterval(sondeo.current);
    sondeo.current = null;
  };

  async function seguir() {
    const api = await obtenerApi();
    setLote(await api.estado_lote());
    detenerSondeo();
    sondeo.current = window.setInterval(async () => {
      const estado = await api.estado_lote();
      setLote(estado);
      if (estado && !estado.activo) {
        detenerSondeo();
        const { errores, pendientes } = estado.contadores;
        toast.show({
          tone: pendientes > 0 ? "info" : errores > 0 ? "warning" : "success",
          message: pendientes > 0 ? "Lote en pausa" : "Lote terminado",
          description:
            errores > 0
              ? `${errores.toLocaleString("es-CO")} ${errores === 1 ? "documento no se pudo" : "documentos no se pudieron"} anonimizar.`
              : undefined,
        });
      }
    }, INTERVALO_MS);
  }

  // Carpeta destino por defecto, lote en curso (si la interfaz se recargó) y
  // espera a que Python termine de cargar spaCy.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const api = await obtenerApi();
      const carpeta = await api.carpeta_predeterminada();
      if (vivo) setDestino((actual) => actual || carpeta);
      const enCurso = await api.estado_lote();
      if (vivo && enCurso?.activo) void seguir();
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
      detenerSondeo();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, []);

  async function arrancar(accion: () => Promise<{ ok: boolean; error?: string }>) {
    setIniciando(true);
    const r = await accion();
    setIniciando(false);
    if (!r.ok) {
      toast.show({ tone: "error", message: "No se pudo iniciar el lote", description: r.error });
      return;
    }
    await seguir();
  }

  // Reanudar pedido desde el Historial.
  useEffect(() => {
    if (!reanudar || !motorListo) return;
    onReanudado();
    void arrancar(async () => (await obtenerApi()).reanudar_lote(reanudar));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reanudar, motorListo]);

  if (lote?.activo) {
    return <PasoProcesando lote={lote} onPausar={async () => (await obtenerApi()).pausar_lote()} />;
  }
  if (lote) {
    return (
      <PasoResultado
        lote={lote}
        onNuevoLote={() => setLote(null)}
        onReanudar={() => void arrancar(async () => (await obtenerApi()).reanudar_lote(lote.carpeta))}
        onRevisar={onRevisar}
      />
    );
  }
  return (
    <PasoPreparar
      destino={destino}
      motorListo={motorListo}
      errorMotor={errorMotor}
      iniciando={iniciando}
      onCambiarDestino={setDestino}
      onIniciar={() => void arrancar(async () => (await obtenerApi()).iniciar_lote(destino))}
    />
  );
}
