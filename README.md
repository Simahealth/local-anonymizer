# SIMA Anonimizador (escritorio)

Aplicación de escritorio para **macOS y Windows** que anonimiza historias
clínicas en PDF (español, Colombia) por lotes:

1. Se cargan muchos PDF (arrastrando archivos o carpetas, o con el selector).
2. Cada documento se anonimiza **en el equipo**: ningún dato sale a internet.
3. Cada documento recibe un código aleatorio (`HC-7F3A9C21`) que pasa a ser el
   nombre de su PDF anonimizado.
4. Se genera una **tabla de relación** (Excel y CSV) entre el nombre original de
   cada archivo y su código.

```
<destino>/Lote_2026-10-09_143015/
    anonimizados/HC-7F3A9C21.pdf …
    relacion_codigos.xlsx
    relacion_codigos.csv
```

> La tabla de relación permite reidentificar a los pacientes: guárdala aparte y
> no la compartas junto con los PDFs anonimizados.

La interfaz usa el Design System de SimaHealth (tokens, `SidebarShell`,
`Button`, `Badge`, `Toast`, patrón de progreso de `ModalAnonimizacion`), copiado
de `fronEnd_Simahealth` sin modificar, con las fuentes empaquetadas en local.

## Arquitectura

```
anonimizador/        Motor (Python): extracción PDF → detección de PII → reemplazo → PDF
  lote.py            Lote: códigos, procesamiento, tabla de relación (xlsx/csv)
escritorio/          App de escritorio (pywebview): ventana nativa + API para la interfaz
ui/                  Interfaz (React + Vite + TS) con el DS de SimaHealth
empaquetado/         PyInstaller (.spec), íconos, instalador de Windows (Inno Setup)
tests/               pytest del motor y del lote; tests/evaluacion: métricas y fugas
```

- **Ventana:** pywebview → WKWebView en macOS, WebView2 (Edge) en Windows 10/11.
- **Motor:** derivado de `sima-anonimizador` (Presidio + spaCy `es_core_news_md`
  y reconocedores colombianos), **sin** el fallback a WatsonX: todo es local.
- La interfaz llama a Python vía `window.pywebview.api` y consulta el avance
  del lote cada 400 ms. En `npm run dev` (navegador) usa un simulador.

## Desarrollo

Requisitos: Python 3.12, Node 22, [uv](https://docs.astral.sh/uv/).

```bash
make instalar   # .venv + dependencias + node_modules
make pruebas    # pytest (motor, lote, regresión de fugas) + vitest + typecheck
make dev        # interfaz en el navegador con API simulada → http://localhost:5317
make app        # app de escritorio real
make fugas      # fugas de PII de punta a punta en cada dataset
```

## Builds

PyInstaller no compila de forma cruzada: cada sistema se construye en su propio
sistema operativo. El workflow `.github/workflows/build.yml` lo hace en GitHub
Actions (macOS Apple Silicon, macOS Intel y Windows) y publica como artefactos:

| Sistema | Artefacto |
| --- | --- |
| macOS | `SIMA-Anonimizador-macOS-*.dmg` |
| Windows | `SIMA-Anonimizador-1.0.0-Windows-instalador.exe` y versión portable `.zip` |

Cada build corre una **autoprueba** del ejecutable empaquetado
(`--autoprueba <pdfs> <salida>`), que anonimiza los 30 PDF sintéticos con el
motor tal como quedó dentro del bundle.

En local (macOS): `make build` (app en `dist/`) o `make dmg`.

### Firma de código (pendiente)

Los builds no están firmados con un certificado de la organización:

- **macOS:** firma ad-hoc. La primera vez, Gatekeeper avisa que el desarrollador
  no está identificado (clic derecho → Abrir). Para distribuir sin avisos hace
  falta un Apple Developer ID y notarizar el `.app`.
- **Windows:** SmartScreen puede mostrar "Windows protegió su PC" (Más
  información → Ejecutar de todas formas). Se evita firmando con un certificado
  de firma de código.

## Calidad de la anonimización

`make fugas` mide lo que importa para la privacidad: corre el pipeline completo
y busca cada dato del ground truth en el **texto final**. Con `--pdfs`, el texto
sale de los PDF reales, con todo lo que introduce la extracción.

| Dataset | Valores PII | Redacción efectiva |
| --- | --- | --- |
| `datos` (fixtures colombianos) | 33 | 100 % |
| `datos_sintetico_co` (50 HC) | 350 | 100 % |
| `datos_sintetico_ame` (30 HC, texto) | 84 | 100 % |
| `datos_sintetico_ame` (30 HC, **desde PDF**) | 84 | 100 % |
| `datos_meddocan` (España, fuera de alcance) | 161 | ~58 % |

Los conjuntos colombianos quedan cubiertos por `tests/test_fugas.py`: si un
cambio en el motor reintroduce una fuga, falla `pytest`. MEDDOCAN usa formatos
españoles (teléfonos de 9 dígitos, direcciones de España) y solo sirve como
referencia de generalización.

Cambios al motor respecto de `sima-anonimizador`:

- **Nombres completos:** los reconocedores marcaban a menudo solo una parte del
  nombre (`JESSICA` de `JESSICA JURADO MINA`) y los apellidos quedaban visibles.
  Ahora se extiende a las palabras vecinas con forma de nombre, se aceptan
  apellidos compuestos (`DE LA ROSA`) y nombres tras anclas (`PACIENTE`, `DR`).
  Las palabras de un nombre confirmado se redactan donde vuelvan a aparecer.
- **Reemplazo por posiciones:** los tramos detectados que se solapan se fusionan;
  antes, el reemplazo valor por valor dejaba restos (`° 20-98`) cuando dos
  detecciones se cruzaban, y el texto se reemplazaba dentro de otras palabras
  (`Cali` → `[UBICACION]dad` en "Calidad").
- **Extracción:** se reúnen los renglones que el PDF partió por el ancho de
  página (un nombre partido en dos renglones no se detectaba entero) y no se
  parten los correos (`chaverra893@…` dejaba visible el apellido).
- **Direcciones:** `Av` sin punto, `Manzana X Casa Y`, sin tragarse la etiqueta
  del renglón siguiente.
- **Sin red:** sin WatsonX, y `tldextract` (usado por Presidio para validar
  correos) no descarga la lista de dominios de internet.
- PDF protegidos con contraseña o sin texto (escaneos) se reportan como error
  del documento sin detener el lote. Los PDF escaneados necesitan OCR antes.
