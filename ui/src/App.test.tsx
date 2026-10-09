import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { ToastProvider } from "./components/Toast/ToastProvider";

// Flujo completo contra el simulador (src/api/simulador.ts): sin pywebview,
// `obtenerApi()` cae al simulador en modo desarrollo/pruebas.
describe("App", () => {
  it("carga documentos, anonimiza el lote y muestra la relación de códigos", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    );

    await user.click(await screen.findByRole("button", { name: /Arrastra historias clínicas/ }));
    expect(await screen.findByRole("list", { name: "Documentos a anonimizar" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);

    const iniciar = await screen.findByRole("button", { name: /Anonimizar 5 documentos/ }, { timeout: 3000 });
    await user.click(iniciar);
    expect(await screen.findByRole("progressbar")).toBeInTheDocument();

    const tabla = await screen.findByRole("table", {}, { timeout: 10000 });
    const filas = within(tabla).getAllByRole("row").slice(1);
    expect(filas).toHaveLength(5);
    for (const fila of filas) {
      expect(within(fila).getByText(/^HC-[2-9A-HJKMNP-Z]{8}$/)).toBeInTheDocument();
    }
    // El simulador marca como error los archivos "escaneados".
    expect(within(tabla).getByText(/no tiene texto seleccionable/)).toBeInTheDocument();
    expect(screen.getByText(/permite volver a identificar a cada paciente/)).toBeInTheDocument();
  }, 20000);
});
