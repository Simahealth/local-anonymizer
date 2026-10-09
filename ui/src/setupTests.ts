import "@testing-library/jest-dom/vitest";

// jsdom no implementa scroll: PasoProcesando/VisorDocumento lo usan para llevar
// a la vista el documento en curso o un tramo, y para volver arriba al cambiar
// de documento.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function scrollTo() {};
}
// Ni posiciones de un Range (la barra flotante del visor se ubica bajo la selección).
if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
}
