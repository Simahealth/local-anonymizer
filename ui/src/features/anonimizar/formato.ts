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

export function formatearDuracion(segundos: number): string {
  if (segundos < 60) return "menos de un minuto";
  const min = Math.round(segundos / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

export function formatearMb(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1).replace(".", ",")} GB` : `${mb} MB`;
}

/** Etiqueta con la que cada categoría aparece en el PDF anonimizado. */
export const ETIQUETAS: Record<string, string> = {
  nombres: "[NOMBRE]",
  documentos: "[DOCUMENTO]",
  telefonos: "[TELEFONO]",
  fechas_nacimiento: "[FECHA_NAC]",
  direcciones: "[DIRECCION]",
  emails: "[EMAIL]",
  fechas: "[FECHA]",
  edades: "[EDAD]",
  ubicaciones: "[UBICACION]",
  seguros: "[SEGURO]",
  numeros_registro: "[NUM_REGISTRO]",
};
