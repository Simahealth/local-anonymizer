export function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function plural(n: number, singular: string, plural: string): string {
  return `${n.toLocaleString("es-CO")} ${n === 1 ? singular : plural}`;
}

/** Nombres legibles de las categorías de PII (mismas claves que el detector). */
export const NOMBRES_CATEGORIA: Record<string, string> = {
  nombres: "Nombres",
  documentos: "Documentos",
  telefonos: "Teléfonos",
  fechas_nacimiento: "Fechas de nacimiento",
  direcciones: "Direcciones",
  emails: "Correos",
  fechas: "Fechas",
  edades: "Edades",
  ubicaciones: "Ubicaciones",
  seguros: "EPS / seguros",
  numeros_registro: "Números de registro",
};
