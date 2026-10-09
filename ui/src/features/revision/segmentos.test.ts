import { describe, expect, it } from "vitest";
import type { TramoRevision } from "../../api/escritorio";
import { paginar, rangoDeSeleccion } from "./segmentos";

const tramo = (id: number, inicio: number, fin: number, activo = true): TramoRevision => ({
  id,
  inicio,
  fin,
  categoria: "nombres",
  origen: "auto",
  activo,
});

describe("paginar", () => {
  const texto = "Paciente: Laura Gómez\n\f\nControl con Laura Gómez.";
  const t1 = tramo(1, 10, 21);
  const t2 = tramo(2, texto.lastIndexOf("Laura"), texto.lastIndexOf("Laura") + 11);

  it("parte por páginas sin los saltos de línea que rodean al \\f", () => {
    const [p1, p2] = paginar(texto, [t2, t1]);
    expect(texto.slice(p1!.ini, p1!.fin)).toBe("Paciente: Laura Gómez");
    expect(texto.slice(p2!.ini, p2!.fin)).toBe("Control con Laura Gómez.");
  });

  it("segmentos contiguos que cubren cada página", () => {
    for (const p of paginar(texto, [t1, t2])) {
      expect(p.segmentos[0]!.ini).toBe(p.ini);
      expect(p.segmentos.at(-1)!.fin).toBe(p.fin);
      p.segmentos.slice(1).forEach((s, i) => expect(s.ini).toBe(p.segmentos[i]!.fin));
    }
    const [p1] = paginar(texto, [t1, t2]);
    expect(p1!.segmentos.map((s) => s.tramo?.id ?? null)).toEqual([null, 1]);
  });

  it("recorta un tramo que cruza el salto de página", () => {
    const cruzado = tramo(3, 16, texto.indexOf("Control") + 7);
    const [p1, p2] = paginar(texto, [cruzado]);
    expect(p1!.segmentos.at(-1)).toMatchObject({ ini: 16, fin: p1!.fin, tramo: { id: 3 } });
    expect(p2!.segmentos[0]).toMatchObject({ ini: p2!.ini, fin: texto.indexOf("Control") + 7 });
  });

  it("un documento sin saltos es una sola página", () => {
    expect(paginar("hola", [])).toEqual([{ numero: 1, ini: 0, fin: 4, segmentos: [{ ini: 0, fin: 4 }] }]);
  });
});

describe("rangoDeSeleccion", () => {
  function montar() {
    const cont = document.createElement("div");
    // "Paciente: " + [Laura Gómez] + " consulta"
    cont.innerHTML =
      '<span data-ini="0" data-fin="10">Paciente: </span>' +
      '<mark data-ini="10" data-fin="21" data-tramo="1">[NOMBRE]</mark>' +
      '<span data-ini="21" data-fin="30"> consulta</span>';
    document.body.appendChild(cont);
    return cont;
  }

  it("texto normal: offset exacto", () => {
    const cont = montar();
    const r = document.createRange();
    r.setStart(cont.children[0]!.firstChild!, 0);
    r.setEnd(cont.children[0]!.firstChild!, 8);
    expect(rangoDeSeleccion(r, cont)).toEqual({ inicio: 0, fin: 8 });
  });

  it("extremos dentro de un tramo se ajustan a sus bordes", () => {
    const cont = montar();
    const r = document.createRange();
    r.setStart(cont.children[1]!.firstChild!, 3);
    r.setEnd(cont.children[2]!.firstChild!, 4);
    expect(rangoDeSeleccion(r, cont)).toEqual({ inicio: 10, fin: 25 });
  });

  it("selección fuera del documento o vacía → null", () => {
    const cont = montar();
    const r = document.createRange();
    r.setStart(cont.children[0]!.firstChild!, 2);
    r.collapse(true);
    expect(rangoDeSeleccion(r, cont)).toBeNull();
    const fuera = document.createElement("p");
    fuera.textContent = "otro";
    document.body.appendChild(fuera);
    const r2 = document.createRange();
    r2.selectNodeContents(fuera);
    expect(rangoDeSeleccion(r2, cont)).toBeNull();
  });

  it("selección sobre el contenedor (triple clic)", () => {
    const cont = montar();
    const r = document.createRange();
    r.selectNodeContents(cont);
    expect(rangoDeSeleccion(r, cont)).toEqual({ inicio: 0, fin: 30 });
  });
});
