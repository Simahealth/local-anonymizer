# SIMA Anonimizador — documentación técnica

> Para usuarios: ver el [README](../README.md). Este documento es para quien
> desarrolla, compila o audita la aplicación.

Aplicación de escritorio para **macOS y Windows** que anonimiza historias
clínicas en PDF (español, Colombia) por lotes de hasta decenas de miles:

1. Se cargan los PDF (arrastrando archivos o carpetas completas, o con el selector).
2. Cada documento se anonimiza **en el equipo**: ningún dato sale a internet.
3. Cada documento recibe un código aleatorio (`HC-7F3A9C21`) que pasa a ser el
   nombre de su PDF anonimizado.
4. Se genera una **tabla de relación** (Excel y CSV) entre el nombre original de
   cada archivo y su código.
5. En **Revisión**, un visor tipo lector PDF permite corregir cada documento:
   seleccionar texto para ocultarlo, ver el original de lo ocultado y revertirlo.

```
<destino>/Lote_2026-10-09_143015/
    anonimizados/HC-7F3A9C21.pdf …   ← lo único que se comparte
    relacion_codigos.xlsx / .csv      ← sensible: reidentifica
    lote.sqlite                       ← sensible: cola del lote + textos originales
```

> La tabla de relación y `lote.sqlite` permiten reidentificar a los pacientes:
> guárdalos aparte y comparte solo la carpeta `anonimizados/`.

## Lotes grandes (50 000 historias)

- **Persistente y reanudable:** `lote.sqlite` es la cola del lote. Cada
  documento se confirma apenas termina; se puede pausar, cerrar la app (o que se
  cierre sola) y reanudar desde el Historial sin reprocesar nada.
- **Secuencial y con memoria acotada:** un documento a la vez. Los textos
  largos se analizan por fragmentos cuyo tamaño depende de la RAM libre; si la
  memoria del sistema baja de 500 MB el lote espera; el modelo de spaCy se
  recarga cuando el proceso crece (su vocabulario interno nunca se libera) o
  cada 5 000 documentos. Ver `anonimizador/memoria.py`.
- **La interfaz nunca recibe listas completas:** selección, progreso y lista de
  revisión se piden por páginas / resúmenes.
- Medido en un MacBook (Apple Silicon) con 10 020 PDF: ~4 000 documentos/min,
  memoria del proceso estable en ~300 MB (ver "Prueba de escala").

## Revisión

Lista paginada de documentos (búsqueda por código o nombre, filtros por
revisados / sin revisar / errores) | visor por páginas | datos ocultados.

- **Modo Revisión:** texto original con lo ocultado resaltado por categoría.
- **Modo Resultado:** como queda el PDF (`[NOMBRE]`, `[DOCUMENTO]`…).
- **Seleccionar texto → Ocultar** como una categoría, en ese punto o en todas
  sus apariciones del documento.
- **Tocar algo resaltado lo muestra** (no era dato personal) junto con todas
  sus apariciones iguales en el documento, con "Deshacer"; tocarlo otra vez lo
  oculta. **Seleccionar texto** (arrastrar o doble clic) abre una barra con
  "Ocultar": la categoría viene sugerida y Enter confirma.
- **Panel agrupado por valor** ("canula" ×12 es una fila), los más repetidos
  primero: ojo para todo el documento, categoría editable y **"Lote"** para
  mostrar u ocultar ese valor en todos los documentos del lote.
- Cada cambio se guarda al instante y regenera el PDF del documento. "Revisado y
  siguiente" lleva el control de avance; la tabla de relación incluye la columna
  *Revisado* al actualizarla.

La interfaz usa el Design System de SimaHealth (tokens, `SidebarShell`,
`Button`, `Badge`, `Toast`, patrón de progreso de `ModalAnonimizacion`), copiado
de `fronEnd_Simahealth` sin modificar, con las fuentes empaquetadas en local.

## Arquitectura

```
anonimizador/        Motor (Python): extracción PDF → detección de PII → tramos → PDF
  lote.py            Lote: crear/reanudar, procesar, revisión, tabla de relación
  almacen.py         lote.sqlite: cola persistente, textos y tramos
  memoria.py         Fragmentos, espera y reciclaje del modelo según la RAM
escritorio/          App de escritorio (pywebview): ventana nativa + API para la interfaz
ui/                  Interfaz (React + Vite + TS) con el DS de SimaHealth
empaquetado/         PyInstaller (.spec), íconos, instalador de Windows (Inno Setup)
tests/               pytest del motor y del lote; tests/evaluacion: métricas y fugas
```

- **Ventana:** pywebview → WKWebView en macOS, WebView2 (Edge) en Windows 10/11.
- **Motor:** derivado de `sima-anonimizador` (Presidio + spaCy `es_core_news_md`
  y reconocedores colombianos), **sin** el fallback a WatsonX: todo es local.
- La interfaz llama a Python vía `window.pywebview.api` y consulta el avance
  del lote cada 500 ms. En `npm run dev` (navegador) usa un simulador.

## Desarrollo

Requisitos: Python 3.12, Node 22, [uv](https://docs.astral.sh/uv/).

```bash
make instalar   # .venv + dependencias + node_modules
make pruebas    # pytest (motor, lote, regresión de fugas) + vitest + typecheck
make dev        # interfaz en el navegador con API simulada → http://localhost:5317
make app        # app de escritorio real
make fugas      # fugas de PII de punta a punta en cada dataset
```

## Builds y releases

PyInstaller no compila de forma cruzada: cada sistema se construye en su propio
sistema operativo. El workflow `.github/workflows/build.yml` lo hace en GitHub
Actions (macOS Apple Silicon, macOS Intel y Windows) en cada push a `main`
(como artefactos del run) y, al subir una etiqueta `vX.Y.Z`, **publica un
GitHub Release** con los instaladores:

| Sistema | Archivo |
| --- | --- |
| macOS | `SIMA-Anonimizador-macOS-AppleSilicon.dmg`, `SIMA-Anonimizador-macOS-Intel.dmg` |
| Windows | `SIMA-Anonimizador-X.Y.Z-Windows-instalador.exe` y versión portable `.zip` |

Para publicar una versión: actualizar el número en `escritorio/api.py`,
`empaquetado/sima_anonimizador.spec`, `ui/package.json` y `build.yml`
(`/DVersion=`), y luego `git tag vX.Y.Z && git push origin vX.Y.Z`. Si falla
alguna compilación o autoprueba, el release no se publica.

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

## Modelo de nombres (NER entrenado, local)

En exports todo en minúscula y sin tildes ni el NER general de spaCy ni una
lista de nombres sirven: con nombres que no están en la lista la detección cae
a ~3 %. `anonimizador/modelos/nombres` es un NER de spaCy (CNN, CPU, 16 MB)
entrenado para este formato: reconoce nombres por su contexto ("madre ___ cc",
"dra ___ de neumologia", "firmado por ___ residente") y por su forma.

- Se empaqueta dentro de la app (no requiere instalación aparte ni internet).
  Si faltara, la app lo avisa y la autoprueba de CI falla.
- Entrenamiento: `tests/evaluacion/entrenar_modelo_nombres.py`, con aumento de
  datos (copias de cada historia con nombres inventados, para que aprenda el
  contexto y no memorice nombres). Toma ~30 min en un núcleo de CPU.
- Evaluación sin trampa: los nombres del dataset se reemplazaron (con agentes,
  `variar_nombres_dataset.py`) en tres variantes disjuntas: **A** para
  entrenar, **C** para elegir el mejor punto del entrenamiento y **B** solo
  para medir. En B (nombres nunca vistos): 87,9 % de nombres detectados con
  87,2 % de precisión, y 90,2 % de redacción efectiva total (sin el modelo:
  59,1 %). Se compararon modelos públicos en español (PlanTL capitel-ner-plus,
  BSC MEDDOCAN): ninguno superó a este en este formato, y son 10–80 veces más
  grandes.

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
| HC reales "otras enfermedades" (100, PII ficticia, **desde PDF**)¹ | 4 377 | 97,5 % |
| `datos_meddocan` (España, fuera de alcance) | 161 | ~62 % |

¹ Dataset local, no versionado (deriva de historias reales); ver
`tests/evaluacion/generar_dataset_otras_enfermedades.py`. Export todo en
minúsculas y sin tildes: con él se ajustó el detector para ese formato (NER de
spaCy filtrado en minúsculas, gazetteer ampliado, correos "usuario gmail com",
registros sin falsos positivos de años/fechas, edades "anos"). Pasó de 78,8 % a
97,5 % de redacción efectiva y de 27 451 a 15 863 tramos ocultados (menos
sobre-redacción). Ojo: parte de los nombres del gazetteer coinciden con los
ficticios del dataset; conviene validar con otro conjunto.

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
