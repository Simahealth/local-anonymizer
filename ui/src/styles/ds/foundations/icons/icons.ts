/**
 * Icon Registry — SimaHealth Design System · Foundations
 * ─────────────────────────────────────────────────────────────────
 * The SINGLE source of truth for which icons are approved for use in
 * SimaHealth product surfaces. Companion to `icons.css` (same folder)
 * -- the split is:
 *
 *   icons.ts   -> what icons exist, semantic name, meaning, state
 *   icons.css  -> how they render (Material Symbols Outlined font
 *                 mechanics only -- unchanged, not duplicated here)
 *
 * Before this file, the same "which icon is this" concept was
 * independently reinvented in 3 places (each unaware of the others):
 * `especialistaConfig.ts`'s `icon: string` field, `Z1Panel.tsx`'s own
 * local `ICONS` map, and hardcoded ligature literals in
 * `DetailPanel.tsx`/`LeftPanel.tsx`. This registry replaces all three
 * as the thing they each point to -- see those files for the migration.
 *
 * `name` (SimaHealth's own semantic vocabulary) is kept distinct from
 * `glyph` (the literal ligature the current icon provider, Material
 * Symbols Outlined, expects as text content), even though every entry
 * today has name === glyph. This costs nothing now and means a future
 * change of icon provider only touches `glyph`/`source` per entry --
 * product code that resolves icons by `name` (via `getIconGlyph`)
 * never needs to change.
 *
 * Status:
 *   - "approved"   -- has a real consumer, a defined semantic role, a
 *                     canonical name. The only status product code
 *                     should use.
 *   - "proposed"   -- registered but not yet reviewed/consumed for real.
 *   - "deprecated" -- had a real consumer once; don't use in new code.
 * No enforcement beyond the type system is implemented here (that's a
 * future decision, not part of this pass) -- today every entry in this
 * file is "approved" because every one of them is a real, existing
 * consumer found by auditing the whole repo, not a speculative addition.
 */

export type IconSource = "material-symbols-outlined";
export type IconStatus = "approved" | "proposed" | "deprecated";

export interface DSIcon {
  name: string;
  glyph: string;
  source: IconSource;
  semantic: string;
  status: IconStatus;
}

export const DS_ICONS = [
  {
    name: "cases",
    glyph: "cases",
    source: "material-symbols-outlined",
    semantic: "Intent “Gestión de Casos” en la navegación del LeftPanel.",
    status: "approved",
  },
  {
    name: "trending_up",
    glyph: "trending_up",
    source: "material-symbols-outlined",
    semantic: "Intent “Resultados” en la navegación del LeftPanel.",
    status: "approved",
  },
  {
    name: "inbox",
    glyph: "inbox",
    source: "material-symbols-outlined",
    semantic: "Métrica Z1: casos pendientes.",
    status: "approved",
  },
  {
    name: "priority_high",
    glyph: "priority_high",
    source: "material-symbols-outlined",
    semantic: "Métrica Z1: casos que requieren atención hoy.",
    status: "approved",
  },
  {
    name: "hourglass_top",
    glyph: "hourglass_top",
    source: "material-symbols-outlined",
    semantic: "Métrica Z1: casos esperando información.",
    status: "approved",
  },
  {
    name: "biotech",
    glyph: "biotech",
    source: "material-symbols-outlined",
    semantic: "Métrica Z1: casos que requieren más evidencia.",
    status: "approved",
  },
  {
    name: "check_circle",
    glyph: "check_circle",
    source: "material-symbols-outlined",
    semantic: "Métrica Z1 (Resultados): diagnóstico confirmado. También: ícono de Toast tone=\"success\" (DS pattern Toast/LiveRegion).",
    status: "approved",
  },
  {
    name: "cancel",
    glyph: "cancel",
    source: "material-symbols-outlined",
    semantic: "Métrica Z1 (Resultados): diagnóstico descartado.",
    status: "approved",
  },
  {
    name: "help",
    glyph: "help",
    source: "material-symbols-outlined",
    semantic: "Métrica Z1 (Resultados): sin resolución.",
    status: "approved",
  },
  {
    name: "info",
    glyph: "info",
    source: "material-symbols-outlined",
    semantic:
      "Información contextual del sistema (patrón tagInfo) — nunca contenido clínico, nunca una acción. También: ícono de Toast tone=\"info\" (DS pattern Toast/LiveRegion).",
    status: "approved",
  },
  {
    name: "close",
    glyph: "close",
    source: "material-symbols-outlined",
    semantic: "Cerrar el DetailPanel (Shell, header nav).",
    status: "approved",
  },
  {
    name: "open_in_full",
    glyph: "open_in_full",
    source: "material-symbols-outlined",
    semantic: "Expandir el caso a CasePage (Shell, header nav).",
    status: "approved",
  },
  {
    name: "chevron_right",
    glyph: "chevron_right",
    source: "material-symbols-outlined",
    semantic: "Expandir el LeftPanel colapsado.",
    status: "approved",
  },
  {
    name: "chevron_left",
    glyph: "chevron_left",
    source: "material-symbols-outlined",
    semantic: "Navegación temporal 'Anterior' (CasePageV2, Red Clínica).",
    status: "approved",
  },
  {
    name: "link",
    glyph: "link",
    source: "material-symbols-outlined",
    semantic: "Ver fuente (Evidence -> SourceDetail): abre la referencia externa de un finding sin salir del Shell.",
    status: "approved",
  },
  {
    name: "arrow_back",
    glyph: "arrow_back",
    source: "material-symbols-outlined",
    semantic: "Volver al caso desde SourceDetail (Shell, header nav).",
    status: "approved",
  },
  {
    name: "upload_file",
    glyph: "upload_file",
    source: "material-symbols-outlined",
    semantic: "Seleccionar archivos para cargar (Nuevo caso → Cargar HC).",
    status: "approved",
  },
  {
    name: "error",
    glyph: "error",
    source: "material-symbols-outlined",
    semantic: "Archivo con error durante la carga (Nuevo caso → Progreso de carga). También: ícono opcional de `FieldMessage` tone=\"error\" (DS atom Field/Input/Textarea) y de Toast tone=\"error\" (DS pattern Toast/LiveRegion) -- la señal de error nunca depende solo del color (borde + texto + este ícono).",
    status: "approved",
  },
  {
    name: "warning",
    glyph: "warning",
    source: "material-symbols-outlined",
    semantic: "Ícono de Toast tone=\"warning\" (DS pattern Toast/LiveRegion) -- distinto de `priority_high` (reservado para la métrica Z1 \"casos que requieren atención hoy\"), este es el triángulo de advertencia genérico.",
    status: "approved",
  },
  {
    name: "progress_activity",
    glyph: "progress_activity",
    source: "material-symbols-outlined",
    semantic:
      "Spinner rotado vía CSS (respeta prefers-reduced-motion): archivo en procesamiento (Nuevo caso → Progreso de carga), milestone activo en la línea de progreso del Modal (Nuevo caso), y el spinner magenta Sima de la Card 'procesando en background' (Nuevo caso → AOW).",
    status: "approved",
  },
  {
    name: "shield",
    glyph: "shield",
    source: "material-symbols-outlined",
    semantic: "Etapa Anonimizar (Nuevo caso → Card 'procesando en background'): protección/privacidad del paciente.",
    status: "approved",
  },
  {
    name: "filter_alt",
    glyph: "filter_alt",
    source: "material-symbols-outlined",
    semantic: "Etapa Triage (Nuevo caso → Card 'procesando en background'): filtrado/priorización de historias.",
    status: "approved",
  },
  {
    name: "hub",
    glyph: "hub",
    source: "material-symbols-outlined",
    semantic: "Etapa Análisis diferencial (Nuevo caso → Card 'procesando en background'): el modelo agéntico consultando/comparando/razonando en varios frentes. También: título de sección Red clínica (CasePage), mismo glifo que el histórico vanilla.",
    status: "approved",
  },
  {
    name: "psychology",
    glyph: "psychology",
    source: "material-symbols-outlined",
    semantic: "Título de sección Hipótesis (CasePage, Shell), mismo glifo que el histórico vanilla case-page.html.",
    status: "approved",
  },
  {
    name: "history",
    glyph: "history",
    source: "material-symbols-outlined",
    semantic: "Título de sección Historial clínico (CasePage, Shell), mismo glifo que el histórico vanilla case-page.html.",
    status: "approved",
  },
  {
    name: "description",
    glyph: "description",
    source: "material-symbols-outlined",
    semantic: "Título de sección Documentos (CasePage, Shell), mismo glifo que el histórico vanilla case-page.html.",
    status: "approved",
  },
  {
    name: "edit_note",
    glyph: "edit_note",
    source: "material-symbols-outlined",
    semantic: "Anotar/redactar una nota contextual sobre un hallazgo, hipótesis, evento clínico, evento de red o documento (CasePage, molecule ContextualAction) -- puerto del histórico vanilla '.note-cta'.",
    status: "approved",
  },
  {
    name: "arrow_downward",
    glyph: "arrow_downward",
    source: "material-symbols-outlined",
    semantic: "Separador temporal entre eventos consecutivos de Historial Clínico (CasePage) -- nunca una frontera visual, solo paso del tiempo. Puerto directo del glifo histórico vanilla case-page.html, localizado a este componente únicamente.",
    status: "approved",
  },
  {
    name: "edit",
    glyph: "edit",
    source: "material-symbols-outlined",
    semantic: "Lápiz -- acción \"Nueva nota\" en el Header de CasePageV2 (distinto de `edit_note`, ya reservado para el trigger de nota contextual sobre un hallazgo/hipótesis/evento; este es el ícono simple de lápiz para la acción de redactar libremente).",
    status: "approved",
  },
  {
    name: "forward",
    glyph: "forward",
    source: "material-symbols-outlined",
    semantic: "Flecha de reenvío -- acción \"Referir caso\" en el Header de CasePageV2 (enviar/derivar el caso a otro especialista).",
    status: "approved",
  },
  {
    name: "expand_more",
    glyph: "expand_more",
    source: "material-symbols-outlined",
    semantic: "Chevron hacia abajo del trigger de DropdownMenu (DS atom) -- reemplaza el SVG inline que usaba el StatusDropdown ad-hoc de CasePageV2Header. Rota 180deg vía CSS cuando el menú está abierto, mismo mecanismo que `chevron_right` en LeftPanel. También: chevron default opcional de `DisclosureTrigger` (DS pattern Accordion/Disclosure).",
    status: "approved",
  },
  {
    name: "check",
    glyph: "check",
    source: "material-symbols-outlined",
    semantic: "Marca de selección del item activo en DropdownMenu (DS atom) -- señal de \"seleccionado\" que no depende solo del color/peso de fuente. Distinto de `check_circle` (reservado para el estado \"diagnóstico confirmado\" de la métrica Z1).",
    status: "approved",
  },
  {
    name: "search",
    glyph: "search",
    source: "material-symbols-outlined",
    semantic: "Ícono decorativo de SearchInput (DS molecule) -- reemplaza el SVG inline (círculo+línea) que el buscador ad-hoc del header del AOW (`.aow-search__icon`) usaba antes de formalizarse en un componente.",
    status: "approved",
  },
  {
    name: "visibility",
    glyph: "visibility",
    source: "material-symbols-outlined",
    semantic: "LoginPage: acción \"mostrar contraseña\" del toggle de visibilidad del campo Contraseña.",
    status: "approved",
  },
  {
    name: "visibility_off",
    glyph: "visibility_off",
    source: "material-symbols-outlined",
    semantic: "LoginPage: acción \"ocultar contraseña\" del toggle de visibilidad del campo Contraseña (estado alternado de `visibility`).",
    status: "approved",
  },
  {
    name: "mail",
    glyph: "mail",
    source: "material-symbols-outlined",
    semantic: "LoginPage: CTA secundario \"Contactar equipo comercial\" (abre un mailto).",
    status: "approved",
  },
  {
    name: "lock",
    glyph: "lock",
    source: "material-symbols-outlined",
    semantic: "LoginPage: aviso de contraseña temporal en el flujo de primer ingreso. Distinto de `shield` (reservado para la etapa Anonimizar de Nuevo caso).",
    status: "approved",
  },
  {
    name: "settings",
    glyph: "settings",
    source: "material-symbols-outlined",
    semantic: "Item \"Configuración\" del menú de cuenta en LeftPanel (chip de usuario) -- lleva a /perfil. También el ícono del header \"CONFIGURACIÓN\" dentro de SectionMenu (User Settings).",
    status: "approved",
  },
  {
    name: "logout",
    glyph: "logout",
    source: "material-symbols-outlined",
    semantic: "Item \"Cerrar sesión\" del menú de cuenta en LeftPanel (chip de usuario) -- ver src/auth/signOut.ts para qué logout aplica según authSource.",
    status: "approved",
  },
  {
    name: "local_hospital",
    glyph: "local_hospital",
    source: "material-symbols-outlined",
    semantic: "Item \"Hospitales\" de la barra lateral del panel de administración (AdminPanel.tsx) -- distinto de `shield`, reservado ahí para \"Usuarios\" (mismo ícono que ya usa LeftPanel para el link a /admin).",
    status: "approved",
  },
  {
    name: "database",
    glyph: "database",
    source: "material-symbols-outlined",
    semantic: "Item \"Base de datos\" de la barra lateral del workspace Hospital (HospitalWorkspace.tsx).",
    status: "approved",
  },
  {
    name: "folder",
    glyph: "folder",
    source: "material-symbols-outlined",
    semantic: "Item \"Proyectos\" de la barra lateral del workspace Hospital (HospitalWorkspace.tsx).",
    status: "approved",
  },
  {
    name: "dashboard",
    glyph: "dashboard",
    source: "material-symbols-outlined",
    semantic: "Item \"Overview\" de la barra lateral del workspace de farmacéutica (PharmaWorkspace.tsx, chat 2026-09-25: \"una sección overview que de información de los proyectos\").",
    status: "approved",
  },
  {
    name: "delete",
    glyph: "delete",
    source: "material-symbols-outlined",
    semantic: "CasePageV2Header: \"Eliminar caso\", solo visible cuando el análisis falló (assessment.status === \"failed\") -- envía el caso a la papelera.",
    status: "approved",
  },
  {
    name: "medication",
    glyph: "medication",
    source: "material-symbols-outlined",
    semantic: "Item \"Farmacéuticas\" de la barra lateral del panel de administración (AdminPanel.tsx) -- distinto de `local_hospital`, reservado ahí para \"Hospitales\".",
    status: "approved",
  },
  {
    name: "add",
    glyph: "add",
    source: "material-symbols-outlined",
    semantic: "Botón \"Nuevo proyecto\" en la sección Proyectos de PharmaWorkspace.tsx.",
    status: "approved",
  },
  {
    name: "refresh",
    glyph: "refresh",
    source: "material-symbols-outlined",
    semantic: "Reintentar la conexión con modelos.simahealth.ai -- PharmaceuticasSection.tsx (admin) y la sección Proyectos de PharmaWorkspace.tsx.",
    status: "approved",
  },
  {
    name: "play_arrow",
    glyph: "play_arrow",
    source: "material-symbols-outlined",
    semantic: "Acción \"Reanudar\" un proyecto pausado -- sección Proyectos de PharmaWorkspace.tsx.",
    status: "approved",
  },
  {
    name: "pause",
    glyph: "pause",
    source: "material-symbols-outlined",
    semantic: "Acción \"Pausar\" un proyecto en curso -- sección Proyectos de PharmaWorkspace.tsx.",
    status: "approved",
  },
  {
    name: "arrow_upward",
    glyph: "arrow_upward",
    source: "material-symbols-outlined",
    semantic: "Indicador de orden ascendente en un header de columna ordenable -- ProjectDetailView.tsx (chat 2026-09-23).",
    status: "approved",
  },
  {
    name: "table_rows",
    glyph: "table_rows",
    source: "material-symbols-outlined",
    semantic: "Toggle a vista de tabla en la lista de registros de un proyecto -- ProjectDetailView.tsx (chat 2026-09-24).",
    status: "approved",
  },
  {
    name: "grid_view",
    glyph: "grid_view",
    source: "material-symbols-outlined",
    semantic: "Toggle a vista de tarjetas en la lista de registros de un proyecto -- ProjectDetailView.tsx (chat 2026-09-24).",
    status: "approved",
  },
  {
    name: "person",
    glyph: "person",
    source: "material-symbols-outlined",
    semantic: "User Settings: tab \"Perfil\".",
    status: "approved",
  },
  {
    name: "notifications",
    glyph: "notifications",
    source: "material-symbols-outlined",
    semantic: "User Settings: tab \"Notificaciones\".",
    status: "approved",
  },
  {
    name: "tune",
    glyph: "tune",
    source: "material-symbols-outlined",
    semantic: "User Settings: tab \"Preferencias\".",
    status: "approved",
  },
  {
    name: "group",
    glyph: "group",
    source: "material-symbols-outlined",
    semantic: "HospitalWorkspace: sección \"Usuarios\" (nav + título de sección).",
    status: "approved",
  },
  // --- SIMA Anonimizador (app de escritorio) ---
  {
    name: "zoom_in",
    glyph: "zoom_in",
    source: "material-symbols-outlined",
    semantic: "Anonimizador: visor de revisión, acercar.",
    status: "approved",
  },
  {
    name: "zoom_out",
    glyph: "zoom_out",
    source: "material-symbols-outlined",
    semantic: "Anonimizador: visor de revisión, alejar.",
    status: "approved",
  },
  {
    name: "open_in_new",
    glyph: "open_in_new",
    source: "material-symbols-outlined",
    semantic: "Anonimizador: abrir el PDF original en el visor del sistema.",
    status: "approved",
  },
  {
    name: "rate_review",
    glyph: "rate_review",
    source: "material-symbols-outlined",
    semantic: "Anonimizador: sección \"Revisión\" (nav).",
    status: "approved",
  },
] as const satisfies readonly DSIcon[];

/** Union of every registered icon's `name` -- use this instead of `string`
 * on any surface that accepts an icon name (e.g. config fields). */
export type IconName = (typeof DS_ICONS)[number]["name"];

const ICON_BY_NAME = new Map<IconName, (typeof DS_ICONS)[number]>(
  DS_ICONS.map((icon) => [icon.name, icon]),
);

/** Resolves a registered icon name to its glyph -- the literal ligature
 * text Material Symbols Outlined expects as the element's text content.
 * `name` is typed as `IconName` (a union of the registry's own literal
 * names), so passing anything not in `DS_ICONS` is a compile error, not
 * a silent runtime miss -- the `!` below is safe by construction. */
export function getIconGlyph(name: IconName): string {
  return ICON_BY_NAME.get(name)!.glyph;
}
