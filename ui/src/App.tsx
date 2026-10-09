/**
 * Shell de la app: mismo layout que los workspaces del frontend web
 * (`.aow-shell` + `SidebarShell` + `.aow-canvas`, ver HospitalWorkspace.tsx
 * en fronEnd_Simahealth), con tres secciones: Anonimizar, Revisión e Historial.
 */
import { useEffect, useState } from "react";
import { SidebarShell } from "./components/LeftPanel/SidebarShell";
import { getIconGlyph, type IconName } from "./styles/ds/foundations/icons/icons";
import { obtenerApi } from "./api/escritorio";
import { SeccionAnonimizar } from "./features/anonimizar/SeccionAnonimizar";
import { SeccionHistorial } from "./features/historial/SeccionHistorial";
import { SeccionRevision } from "./features/revision/SeccionRevision";

type Seccion = "anonimizar" | "revision" | "historial";

const SECCIONES: { id: Seccion; label: string; icon: IconName }[] = [
  { id: "anonimizar", label: "Anonimizar", icon: "shield" },
  { id: "revision", label: "Revisión", icon: "rate_review" },
  { id: "historial", label: "Historial de lotes", icon: "history" },
];

export function App() {
  const [seccion, setSeccion] = useState<Seccion>("anonimizar");
  const [version, setVersion] = useState("");
  const [loteRevision, setLoteRevision] = useState<string | null>(null);
  const [reanudar, setReanudar] = useState<string | null>(null);
  const activa = SECCIONES.find((s) => s.id === seccion)!;

  useEffect(() => {
    obtenerApi()
      .then((api) => api.info())
      .then((i) => setVersion(i.version));
  }, []);

  function revisar(carpeta: string) {
    setLoteRevision(carpeta);
    setSeccion("revision");
  }

  return (
    <main className="aow-shell" data-aow-shell>
      <div className="aow-body">
        <SidebarShell ariaLabel="Panel del anonimizador">
          <div className="sidebar-section sidebar-section--readings">
            <span className="sidebar-section-label">Anonimizador</span>
            <nav className="sidebar-readings" aria-label="Secciones">
              {SECCIONES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={"sidebar-reading-item" + (s.id === seccion ? " sidebar-reading-item--active" : "")}
                  aria-pressed={s.id === seccion}
                  onClick={() => setSeccion(s.id)}
                >
                  <span className="sidebar-reading-item__icon material-symbols-outlined" aria-hidden="true">
                    {getIconGlyph(s.icon)}
                  </span>
                  <span className="sidebar-reading-item__content">
                    <span className="sidebar-reading-item__label">{s.label}</span>
                  </span>
                </button>
              ))}
            </nav>
          </div>
          <div className="anz-sidebar-pie">
            <span className="material-symbols-outlined" aria-hidden="true">
              {getIconGlyph("lock")}
            </span>
            <span>Procesamiento 100% local{version && ` · v${version}`}</span>
          </div>
        </SidebarShell>

        <div className="aow-canvas">
          {/* Revisión ocupa todo el alto con sus propios scrolls (lista, visor,
              panel); las demás secciones scrollean la página entera. */}
          <div className={seccion === "revision" ? "anz-canvas-fijo" : "anz-canvas-scroll"}>
            <header className="anz-header">
              <h1 className="anz-header__titulo">{activa.label}</h1>
            </header>
            {/* Anonimizar se mantiene montada al cambiar de sección: un lote en
                curso sigue visible (y su sondeo activo) al volver. */}
            <div hidden={seccion !== "anonimizar"}>
              <SeccionAnonimizar
                onRevisar={revisar}
                reanudar={reanudar}
                onReanudado={() => setReanudar(null)}
              />
            </div>
            {seccion === "revision" && <SeccionRevision carpeta={loteRevision} onCarpeta={setLoteRevision} />}
            {seccion === "historial" && (
              <SeccionHistorial
                onRevisar={revisar}
                onReanudar={(carpeta) => {
                  setReanudar(carpeta);
                  setSeccion("anonimizar");
                }}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
