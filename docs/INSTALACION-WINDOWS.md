# Manual de instalación — SIMA Anonimizador para Windows

Este manual explica cómo instalar SIMA Anonimizador en Windows 10 u 11 y
comprobar que quedó funcionando. La instalación toma unos 5 minutos y no
requiere permisos de administrador.

SIMA Anonimizador oculta los datos personales (nombres, documentos, teléfonos,
direcciones, correos) de historias clínicas en PDF. Todo el proceso ocurre en el
equipo: la aplicación no necesita internet y ningún documento sale de él.

## Requisitos del equipo

Un computador de oficina de recursos medios es suficiente. No hace falta
tarjeta gráfica ni conexión a internet.

| Requisito | Mínimo | Recomendado |
| --- | --- | --- |
| Sistema operativo | Windows 10 de 64 bits | Windows 11 de 64 bits |
| Memoria RAM | 4 GB | 8 GB o más |
| Espacio en disco para la aplicación | 500 MB | 1 GB |
| Espacio para los resultados | Aprox. el tamaño de los PDF a procesar | El doble de ese tamaño |
| Componente Microsoft WebView2 | Incluido en Windows 11 y en Windows 10 actualizado | — |

WebView2 es el componente de Microsoft que dibuja la ventana de la aplicación.
Si la ventana abre en blanco, ver [Solución de problemas](#solución-de-problemas).

## Descargar

Descarga el archivo desde la página de
**[Releases](https://github.com/Simahealth/local-anonymizer/releases/latest)**
del repositorio, en la sección *Assets*. Hay dos versiones; usa el instalador
salvo que no puedas instalar programas en el equipo.

| Archivo | Para qué sirve |
| --- | --- |
| `SIMA-Anonimizador-X.Y.Z-Windows-instalador.exe` | Instala la aplicación con accesos directos en el menú Inicio. **Recomendado.** |
| `SIMA-Anonimizador-Windows-portable.zip` | Se descomprime en una carpeta y se ejecuta sin instalar. Útil en equipos con restricciones. |

El repositorio es privado: necesitas una cuenta de GitHub con acceso. Si no la
tienes, pide el archivo al equipo de SimaHealth.

## Instalar paso a paso

1. Haz doble clic en `SIMA-Anonimizador-X.Y.Z-Windows-instalador.exe`.
2. Windows puede mostrar **"Windows protegió su PC"** con *Editor:
   desconocido*. Es esperado: la aplicación todavía no tiene firma digital de
   SimaHealth.
    1. Haz clic en **Más información**.
    2. Haz clic en **Ejecutar de todas formas**.
3. El asistente de instalación abre en español. Haz clic en **Siguiente**.
4. Si quieres un acceso directo en el escritorio, marca **Crear un acceso
   directo en el escritorio**.
5. Haz clic en **Instalar**. La aplicación se instala solo para tu usuario, en
   `%LOCALAPPDATA%\Programs\SIMA Anonimizador`.
6. Deja marcada **Abrir SIMA Anonimizador** y haz clic en **Finalizar**.

**Versión portable:** clic derecho en `SIMA-Anonimizador-Windows-portable.zip`
→ **Extraer todo**, elige una carpeta y abre `SIMA Anonimizador.exe` dentro de
ella. Al primer uso puede aparecer el mismo aviso de SmartScreen; se resuelve
igual que en el paso 2.

## Primer inicio y verificación

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
defecto es `Documentos\SIMA Anonimizador`.

| Ruta | Contenido | ¿Se puede compartir? |
| --- | --- | --- |
| `Lote_<fecha>\anonimizados\` | Los PDF anonimizados (`HC-XXXXXXXX.pdf`) | Sí |
| `Lote_<fecha>\relacion_codigos.xlsx` y `.csv` | Relación entre el archivo original y su código | **No**: reidentifica |
| `Lote_<fecha>\lote.sqlite` | Avance del lote y texto original, para revisar y corregir | **No**: contiene el texto original |
| `%APPDATA%\SIMA Anonimizador\lotes.json` | Lista de lotes del Historial (solo carpetas y fechas) | No hace falta |

## Actualizar y desinstalar

**Actualizar:** cierra la aplicación, descarga la versión nueva desde
[Releases](https://github.com/Simahealth/local-anonymizer/releases/latest) y
ejecuta su instalador. Reemplaza la anterior y conserva los lotes y el
Historial. Un lote que quedó en pausa se puede reanudar después desde
**Historial de lotes**.

**Desinstalar:**

1. Abre **Configuración → Aplicaciones → Aplicaciones instaladas**.
2. Busca **SIMA Anonimizador** → **⋯** → **Desinstalar**.

Desinstalar no borra los resultados. Las carpetas `Lote_<fecha>` y
`%APPDATA%\SIMA Anonimizador` quedan en el equipo. Si ya no se necesitan,
bórralas a mano siguiendo la política de manejo de datos de la institución,
porque contienen información de pacientes.

La versión portable se desinstala borrando su carpeta.

## Solución de problemas

| Qué pasa | Qué hacer |
| --- | --- |
| La ventana abre en blanco o no abre | Falta WebView2. Instala *Microsoft Edge WebView2 Runtime* (versión Evergreen) desde la [página de Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/) y vuelve a abrir la aplicación. |
| El antivirus bloquea o pone en cuarentena el programa | Pasa con aplicaciones aún sin firma digital. Pide al área de sistemas una excepción para la carpeta de instalación. |
| "Windows protegió su PC" | Ver el paso 2 de [Instalar paso a paso](#instalar-paso-a-paso). |
| Aviso "No se encontró el modelo de nombres" | La instalación quedó incompleta. Desinstala y vuelve a instalar. |
| Un documento termina en error "no tiene texto seleccionable" | Es un PDF escaneado (imagen). Pásalo primero por un programa de OCR y vuelve a cargarlo. |
| Un documento termina en error "protegido con contraseña" | Quita la contraseña del PDF y vuelve a cargarlo. |
| Se cerró la aplicación en medio de un lote | No se pierde nada. Abre **Historial de lotes** y haz clic en **Reanudar**. |
| El lote va lento | Es normal en lotes grandes y equipos modestos. Puedes **Pausar** y continuar luego. |

Para otros problemas, contacta al equipo técnico de SimaHealth con la versión
que aparece abajo a la izquierda de la aplicación.
