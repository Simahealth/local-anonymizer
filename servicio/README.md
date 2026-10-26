# Servicio HTTP del anonimizador

El mismo motor de la app de escritorio (`anonimizador/`, importado sin cambios)
detrás de dos rutas sin estado, para que la plataforma SimaHealth ofrezca
«Anonimizar antes de subir» al cargar un PDF en un caso.

| Ruta | Entrada | Salida |
|---|---|---|
| `GET /health` | — | `{"ok": true}` cuando el modelo está cargado |
| `POST /analyze` | `file` (PDF) | `text` (páginas separadas por `\f`), `sha256`, `pages[{number,start,end}]`, `spans[{start,end,category}]`, `labels` |
| `POST /apply` | `file` (el mismo PDF), `spans` (JSON con los tramos revisados), `sha256` | PDF anonimizado |

- Offsets en unidades UTF-16 (JavaScript), como el visor de revisión de escritorio.
- `/apply` vuelve a extraer el texto y exige el mismo `sha256`: nada se guarda entre llamadas.
- Cabecera obligatoria `X-Anonimizador-Token` (variable `ANONIMIZADOR_TOKEN`; sin ella el servicio no arranca).
- No registra texto del documento; el PDF vive en un temporal solo durante la petición.
- Límites (variables de entorno): `ANONIMIZADOR_MAX_MB` (15), `ANONIMIZADOR_MAX_PAGINAS` (300), `ANONIMIZADOR_MAX_CARACTERES` (400 000).
- RAM: ~0,55 GB en reposo con el modelo cargado; un análisis a la vez.

```bash
docker build -f servicio/Dockerfile -t sima-anonimizador .
docker run --rm -e ANONIMIZADOR_TOKEN=... -p 127.0.0.1:8000:8000 sima-anonimizador
```

Solo debe exponerse en la red interna del despliegue (sin puerto publicado).
