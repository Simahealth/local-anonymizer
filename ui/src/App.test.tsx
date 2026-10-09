import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { ToastProvider } from "./components/Toast/ToastProvider";

// Flujo completo contra el simulador (src/api/simulador.ts): sin pywebview,
// `obtenerApi()` cae al simulador en modo desarrollo/pruebas. Un solo test
// largo porque el simulador es un singleton con estado (el lote del paso 1 es
// el que se revisa en el paso 2).
describe("App", () => {
  it("anonimiza un lote y lo corrige en Revisión", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    );

    // 1. Cargar y anonimizar.
    await user.click(await screen.findByRole("button", { name: "Agregar archivos" }));
    const lista = await screen.findByRole("list", { name: "Documentos a anonimizar" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(5);

    await user.click(await screen.findByRole("button", { name: /Anonimizar 5 documentos/ }, { timeout: 3000 }));
    expect(await screen.findByRole("progressbar")).toBeInTheDocument();
    await screen.findByText("datos personales ocultados", {}, { timeout: 10000 });
    expect(await screen.findByRole("table")).toHaveTextContent(/no tiene texto seleccionable/);
    expect(screen.getByText(/permiten volver a identificar a cada paciente/)).toBeInTheDocument();

    // 2. Revisar: abre el primer documento completado en el visor.
    await user.click(screen.getByRole("button", { name: "Revisar documentos" }));
    const pagina1 = await screen.findByRole("article", { name: "Página 1 de 2" });
    const nombre = within(pagina1).getByText("Laura Martínez Ospina");
    expect(nombre.tagName).toBe("MARK");

    // Seleccionar "Rosalba" (no detectado) y ocultarlo en todo el documento.
    const segmento = within(pagina1).getByText(/Rosalba/);
    const nodo = segmento.firstChild!;
    const i = nodo.textContent!.indexOf("Rosalba");
    const rango = document.createRange();
    rango.setStart(nodo, i);
    rango.setEnd(nodo, i + "Rosalba".length);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(rango);
    fireEvent.mouseUp(pagina1);
    const barra = await screen.findByRole("dialog", { name: "Ocultar selección" });
    expect(within(barra).getByText("“Rosalba”")).toBeInTheDocument();
    expect(within(barra).getByRole("combobox", { name: "Ocultar como" })).toHaveValue("nombres");
    await user.click(within(barra).getByRole("button", { name: /^Ocultar$/ }));
    // Aparece en las dos páginas → dos tramos (marcas) en el visor, y en el panel.
    const marcasRosalba = () =>
      [...document.querySelectorAll(".rev-pagina mark")].filter((m) => m.textContent === "Rosalba");
    await waitFor(() => expect(marcasRosalba()).toHaveLength(2));
    // La categoría sugerida para un nombre es "Nombres".

    // Tocar un dato oculto lo muestra al instante (y todas sus apariciones),
    // con "Deshacer" en el aviso.
    const pagina = () => screen.getByRole("article", { name: "Página 1 de 2" });
    await user.click(within(pagina()).getByText("Laura Martínez Ospina"));
    await waitFor(() => expect(within(pagina()).getByText("Laura Martínez Ospina")).toHaveClass("rev-tramo--revertido"));
    await user.click(await screen.findByRole("button", { name: "Deshacer" }));
    await waitFor(() =>
      expect(within(pagina()).getByText("Laura Martínez Ospina")).not.toHaveClass("rev-tramo--revertido"),
    );

    // Panel agrupado por valor: "Rosalba" (2 apariciones) es una sola fila ×2;
    // "Lote" lo muestra en todos los documentos del lote.
    const panel = screen.getByRole("complementary", { name: /Datos ocultados/ });
    expect(within(panel).getByText("×2")).toBeInTheDocument();
    await user.click(within(panel).getByTitle("Mostrar “Rosalba” en todo el lote"));
    expect(await screen.findByText("Visible en el lote: “Rosalba”")).toBeInTheDocument();
    await waitFor(() => expect(marcasRosalba().every((m) => m.classList.contains("rev-tramo--revertido"))).toBe(true));

    // Modo Resultado: etiquetas como en el PDF anonimizado.
    await user.click(screen.getByRole("button", { name: "Resultado" }));
    expect(screen.getAllByText("[DOCUMENTO]").length).toBeGreaterThan(0);

    // Marcar revisado y pasar al siguiente.
    const codigoActual = () => document.querySelector(".rev__doc-meta .anz-codigo")?.textContent;
    const antes = codigoActual();
    await user.click(screen.getByRole("button", { name: "Revisado y siguiente" }));
    await waitFor(() => expect(codigoActual()).not.toBe(antes));
    expect(await screen.findByText(/1 de 4 revisados/)).toBeInTheDocument();
  }, 30000);
});
