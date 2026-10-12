# Manual de instalación — SIMA Anonimizador para macOS

Este manual explica cómo instalar SIMA Anonimizador en un Mac y comprobar que
quedó funcionando. La instalación toma unos 5 minutos, más un paso de seguridad
de macOS la primera vez que se abre.

SIMA Anonimizador oculta los datos personales (nombres, documentos, teléfonos,
direcciones, correos) de historias clínicas en PDF. Todo el proceso ocurre en el
equipo: la aplicación no necesita internet y ningún documento sale de él.

## Requisitos y versión a descargar

Descarga el archivo desde la página de
**[Releases](https://github.com/Simahealth/local-anonymizer/releases/latest)**
del repositorio, en la sección *Assets*. El repositorio es privado: necesitas
una cuenta de GitHub con acceso. Si no la tienes, pide el archivo al equipo de
SimaHealth.

Hay un instalador para cada tipo de procesador. Para saber cuál tiene tu Mac,
haz clic en la **manzana** de la esquina superior izquierda → **Acerca de esta
Mac** y mira la línea **Chip** o **Procesador**.

| Si dice… | Descarga |
| --- | --- |
| Chip Apple M1, M2, M3, M4 o posterior | `SIMA-Anonimizador-macOS-AppleSilicon.dmg` |
| Procesador Intel | `SIMA-Anonimizador-macOS-Intel.dmg` |

| Requisito | Mínimo | Recomendado |
| --- | --- | --- |
| Sistema operativo | macOS 11 Big Sur | macOS 14 o posterior |
| Memoria RAM | 4 GB | 8 GB o más |
| Espacio en disco para la aplicación | 500 MB | 1 GB |
| Espacio para los resultados | Aprox. el tamaño de los PDF a procesar | El doble de ese tamaño |

## Instalar desde el DMG

1. Haz doble clic en el archivo `.dmg` descargado. Se abre una ventana con
   **SIMA Anonimizador** y un acceso a la carpeta **Aplicaciones**.
2. Arrastra **SIMA Anonimizador** sobre **Aplicaciones**. La copia tarda unos
   segundos.
3. Cierra la ventana y expulsa el disco: clic derecho en **SIMA Anonimizador**
   del escritorio o de la barra lateral de Finder → **Expulsar**.
4. Ya puedes borrar el `.dmg`.

## Primera apertura: autorizar la app

La primera vez, macOS bloquea la app porque todavía no tiene la firma digital
de Apple de SimaHealth. Se autoriza una sola vez; después abre normal.

**macOS 15 Sequoia o posterior:**

1. Abre **Aplicaciones** y haz doble clic en **SIMA Anonimizador**. Aparece
   *"Apple no pudo verificar…"*. Haz clic en **Listo** (no en *Trasladar a la
   papelera*).
2. Abre **Configuración del Sistema → Privacidad y seguridad**.
3. Baja hasta la sección **Seguridad**. Verás *"Se bloqueó el uso de SIMA
   Anonimizador…"*. Haz clic en **Abrir igualmente**.
4. Escribe la contraseña de tu Mac y confirma con **Abrir igualmente**.

**macOS 14 Sonoma o anterior:**

1. En **Aplicaciones**, haz clic derecho (o Control + clic) en **SIMA
   Anonimizador** → **Abrir**.
2. En el aviso, haz clic en **Abrir**.

## Verificar la instalación

Al abrir la aplicación, el botón principal muestra **Preparando motor…** unos
segundos mientras carga los modelos de lenguaje. Luego cambia a **Anonimizar**.

La instalación está bien si se cumplen las tres cosas:

- [ ] Abajo a la izquierda dice **Procesamiento 100% local · vX.Y.Z** (la
      versión descargada).
- [ ] **No** aparece el aviso amarillo *"No se encontró el modelo de
      nombres"*. Si aparece, reinstala la aplicación: sin ese modelo se pueden
      escapar nombres.
- [ ] Una prueba con un PDF termina en *Anonimizado*: arrástralo a la ventana,
      haz clic en **Anonimizar** y luego en **Revisar documentos**.

## Dónde quedan los archivos

Solo la carpeta `anonimizados` se puede compartir. Todo lo demás permite volver
a identificar a los pacientes y debe quedarse en un lugar protegido.

Cada lote crea una carpeta nueva dentro de la carpeta de destino, que por
defecto es `Documentos/SIMA Anonimizador`.

| Ruta | Contenido | ¿Se puede compartir? |
| --- | --- | --- |
| `Lote_<fecha>/anonimizados/` | Los PDF anonimizados (`HC-XXXXXXXX.pdf`) | Sí |
| `Lote_<fecha>/relacion_codigos.xlsx` y `.csv` | Relación entre el archivo original y su código | **No**: reidentifica |
| `Lote_<fecha>/lote.sqlite` | Avance del lote y texto original, para revisar y corregir | **No**: contiene el texto original |
| `~/Library/Application Support/SIMA Anonimizador/lotes.json` | Lista de lotes del Historial (solo carpetas y fechas) | No hace falta |

## Actualizar y desinstalar

**Actualizar:** cierra la aplicación (⌘Q), descarga el `.dmg` nuevo desde
[Releases](https://github.com/Simahealth/local-anonymizer/releases/latest),
ábrelo y arrastra la app a **Aplicaciones**. Elige **Reemplazar** cuando lo
pregunte. Se conservan los lotes y el Historial. Es posible que haya que
autorizar la versión nueva una vez, como en
[Primera apertura](#primera-apertura-autorizar-la-app).

**Desinstalar:** arrastra **SIMA Anonimizador** desde **Aplicaciones** a la
Papelera.

Desinstalar no borra los resultados. Las carpetas `Lote_<fecha>` y
`~/Library/Application Support/SIMA Anonimizador` quedan en el equipo. Si ya no
se necesitan, bórralas a mano siguiendo la política de manejo de datos de la
institución, porque contienen información de pacientes.

## Solución de problemas

| Qué pasa | Qué hacer |
| --- | --- |
| "Apple no pudo verificar…" o "no se puede abrir porque es de un desarrollador no identificado" | Ver [Primera apertura: autorizar la app](#primera-apertura-autorizar-la-app). |
| "SIMA Anonimizador está dañado y no se puede abrir" | macOS marcó la descarga en cuarentena. Abre **Terminal** y ejecuta `xattr -dr com.apple.quarantine "/Applications/SIMA Anonimizador.app"`. Luego ábrela de nuevo. |
| No aparece el botón *Abrir igualmente* en Privacidad y seguridad | Primero intenta abrir la app con doble clic; el botón aparece durante la hora siguiente a ese intento. |
| Aviso "No se encontró el modelo de nombres" | La instalación quedó incompleta. Borra la app y vuelve a copiarla desde el `.dmg`. |
| La app es muy lenta en un Mac con chip Apple | Descargaste la versión Intel. Instala la versión *AppleSilicon*. |
| Un documento termina en error "no tiene texto seleccionable" | Es un PDF escaneado (imagen). Pásalo primero por un programa de OCR y vuelve a cargarlo. |
| Un documento termina en error "protegido con contraseña" | Quita la contraseña del PDF y vuelve a cargarlo. |
| Se cerró la aplicación en medio de un lote | No se pierde nada. Abre **Historial de lotes** y haz clic en **Reanudar**. |

Para otros problemas, contacta al equipo técnico de SimaHealth con la versión
que aparece abajo a la izquierda de la aplicación.
