import "@testing-library/jest-dom/vitest";

// jsdom no implementa scrollIntoView (PasoProcesando lo usa para seguir el
// documento en proceso en lotes largos).
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
