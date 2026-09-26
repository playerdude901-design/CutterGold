# CutterGold 0.1.0 🎬✨

Recorta videos locales y VODs de Twitch/YouTube, revisa tus mejores momentos con
ClipScore y exporta clips organizados por categoría.

[Descargar CutterGold 0.1.0 para Windows x64](https://github.com/playerdude901-design/CutterGold/releases/download/v0.1.0/CutterGold-Setup-0.1.0-x64.exe)
· [Ver la release](https://github.com/playerdude901-design/CutterGold/releases/tag/v0.1.0)

## Novedades de 0.1.0

- **Audio multipista OBS:** reproducción sincronizada de las pistas locales, con mute, solo y volumen independientes.
- **Ondas de audio reales:** picos y silencios por pista en intervalos de 100 ms, alineados con el video al hacer zoom o desplazarse.
- **Preparación progresiva:** detección de canales, generación de ondas y porcentaje de procesamiento visible.
- **Vista previa ampliable:** video ajustado al espacio disponible y previsualización durante el arrastre del cabezal.
- **Exportación multipista:** los cortes conservan las pistas de audio del archivo fuente. Los controles de mezcla se aplican a la escucha en el editor.
- Incluye **ClipScore**, exportación por categoría e iconos de Windows de la versión anterior.

## Capturas de la interfaz

Captura de CutterGold 0.1.0 con dos pistas de audio y sus controles independientes.
El patrón de colores pertenece al video de demostración.

### Ondas independientes y controles por pista

![Timeline con dos pistas, sus formas de onda reales, controles M/S y volumen](assets/images/cuttergold-0.1.0-waveforms.png)

La captura se puede regenerar después de compilar con
`npx electron scripts/capture-interface.mjs`.

## Timeline multipista para OBS

La timeline inferior muestra la pista de video, una forma de onda por cada pista
de audio del archivo local y los cortes en la misma escala de tiempo. Carga la
grabación OBS MKV o MP4 y CutterGold detecta hasta ocho pistas. **M** silencia
una pista, **S** permite escuchar solo las pistas seleccionadas y el control de
volumen mezcla cada canal. Al mover el cabezal o reproducir, las pistas extraídas
se mantienen sincronizadas con la vista previa. Los rangos de clip aparecen sobre
cada forma de onda y sus exportaciones conservan todas las pistas de audio.

FFmpeg genera previews AAC temporales independientes por canal y una forma de
onda a intervalos de 100 ms. Los previews se guardan en una carpeta temporal. Las pistas múltiples se preparan únicamente para archivos locales;
los streams de Twitch/YouTube siguen usando la reproducción que ya tenían.

Al importar el archivo, espera a que termine la preparación para escuchar todas
las pistas. Las ondas aparecen progresivamente. Si vienes de una compilación
anterior con ondas planas, vuelve a cargar el video para regenerarlas.

## Instalación y actualización en Windows

1. Descarga y ejecuta `CutterGold-Setup-0.1.0-x64.exe`.
2. Selecciona la carpeta de instalación y completa el asistente.
3. Abre **CutterGold** desde el escritorio o el menú Inicio.

Desde la versión 0.0.9 se incorpora el icono multirresolución en el ejecutable, instalador,
desinstalador y ventana. El acceso directo del escritorio usa el icono instalado
en `resources/icon.ico`. Las instalaciones y actualizaciones reparan el acceso
directo y notifican el cambio a Windows, sin borrar la caché global de iconos.
Si vienes de una versión sin acceso directo, ejecutar este instalador lo restaura;
no es necesario eliminar tus videos ni la configuración de la aplicación.

## Historial: 0.0.9

- **ClipScore:** revisión por clip, cinco preguntas, puntuación de 0–10 y resumen.
- **Exportación por categoría:** Excelente, Bueno, Dudoso y Descartar; selección
  de categorías y duración total, movimiento de exportaciones de la sesión sin
  recodificar y protección contra sobrescrituras.
- **OpenRouter opcional:** API key cifrada, modelo configurable y respaldo local.
- **Windows:** iconos consistentes antes, durante y después de instalar; reparación
  del acceso del escritorio también durante actualizaciones.
- **Correcciones:** cancelación de exportaciones, edición con milisegundos,
  ajuste inicial de la timeline en videos largos y prevención de clips vacíos.
- **Verificación:** pruebas de puntuación, archivos, Electron, FFmpeg y empaquetado.


## ClipScore

Después de crear tus cortes, pulsa **Revisar clips**. La revisión se abre sobre la
timeline, ordena los clips por inicio y reproduce únicamente el rango seleccionado.
Puedes silenciar, pausar, repetir y desplazar el cabezal dentro del clip.
Responde las cinco preguntas para avanzar; **Anterior** permite corregir respuestas.
Al terminar, **Ver resumen** muestra cantidades, porcentajes y duración seleccionada.
Las tarjetas permiten incluir o excluir categorías de la exportación.

La puntuación es determinista: reacción 0–3, momento pico 0–2, duración 0–2,
utilidad 0–2 y potencial viral 0–1. Categorías: Excelente 8–10, Bueno 5–7,
Dudoso 2–4 y Descartar 0–1. Una revisión incompleta no recibe categoría.

**Exportar clips** abre el selector nativo y organiza el resultado en
`Excelente/`, `Bueno/`, `Dudoso/` y `Descartar/`, según las categorías incluidas.
Los rangos sin archivo se exportan con FFmpeg usando la calidad de la timeline.
Los archivos exportados en la misma sesión, con los mismos límites y calidad,
se mueven sin recodificación. Nunca se mueve el video fuente ni se sobrescriben
archivos existentes. Al cancelar o fallar, se conservan los clips completados y
se elimina únicamente la salida incompleta. Puedes reintentar desde el resumen.
La calidad Original usa copia de streams y mantiene las limitaciones de precisión
de los fotogramas clave de FFmpeg; HD/FHD recodifican.

**Editar selección** vuelve a la timeline. Las respuestas sobreviven al cierre de
ClipScore durante la sesión; cambiar el inicio o fin exige revisar ese corte de
nuevo. Las respuestas y el registro de archivos exportados no persisten tras
cerrar la aplicación. Los archivos exportados en sesiones anteriores no se mueven
automáticamente: se genera una nueva exportación sin sobrescribirlos.

### Sugerencias y Settings

Sin configuración se usa una sugerencia local. En **Settings** puedes guardar una
API key de OpenRouter y un modelo opcional (vacío usa el predeterminado de tu cuenta).
La clave se cifra mediante Electron `safeStorage` en el perfil de la aplicación y
no se devuelve a la interfaz. Al abrir el resumen, solo se envían cantidades por
categoría y duración; no se envían videos, rutas ni nombres. La petición tiene
un tiempo máximo de 20 segundos y recurre al texto local ante cualquier fallo.
Consulta el [contrato de la API de OpenRouter](https://openrouter.ai/docs/api/reference/overview).

### Verificación de ClipScore

```bash
npm test               # puntuación, archivos e iconos de Windows
npm run lint
npm run build
npm run test:electron  # integración real con video sintético y FFmpeg
```

La prueba de Electron usa un perfil temporal, no usa claves reales ni llama a
OpenRouter; verifica cifrado, navegación, exportación, movimiento y cancelación.
Guarda capturas en `test-artifacts/`. El flujo con un VOD remoto y la respuesta
real de OpenRouter requieren una fuente vigente y una clave válida, respectivamente.

## 🚀 Características Principales

- ⏱️ **Línea de Tiempo Interactiva**:
  - Zoom y desplazamiento horizontal ultra fluidos (`Alt + Rueda` / `Ctrl + Rueda`).
  - Cabezal de reproducción (*playhead*) interactivo con arrastre en tiempo real.
  - Creación, ajuste de extremos (redimensionado) y desplazamiento de clips visualmente.
- 🎨 **Organización y Resumen de Cortes**:
  - Clasificación de clips por colores personalizables.
  - Lista interactiva de clips con botones de salto directo para previsualizar cada corte al instante.
  - Edición manual numérica de tiempos con precisión de milisegundos.
- 🌐 **Soporte para Streams y VODs**:
  - Carga directa de streams y VODs de Twitch y YouTube mediante URL.
  - Detección y selección de resolución de stream antes de la importación.
- 📁 **Exportación Flexible y por Lotes**:
  - Selector nativo de directorio de salida (`Folder Picker`).
  - Múltiples calidades de exportación: *Source (sin re-encoding ultra rápido)*, *HD (720p)*, *FHD (1080p)*.
  - Progreso en tiempo real y capacidad de cancelar exportaciones en cualquier momento.
- ✨ **Interfaz Moderna (Gold Theme)**:
  - Diseño Glassmorphism con paleta oscura y detalles dorados.
  - Modales de alertas y confirmación integrados y fluidos.
- 🔄 **Actualizaciones Automáticas**: Sistema de autoupdate integrado vía GitHub Releases.

---

## ⌨️ Controles y Atajos de Teclado

| Acción | Control |
|---|---|
| **Zoom en línea de tiempo** | `Alt` + Rueda del ratón |
| **Desplazamiento horizontal (Pan)** | `Ctrl` + Rueda del ratón |
| **Mover cabezal (Playhead)** | Clic o arrastrar sobre la regla / cabeza del marcador |
| **Reproducir / Pausar** | Clic en el reproductor de video o botón `Play/Pausa` |
| **Mover clip** | Clic y arrastrar el bloque del clip |
| **Ajustar inicio / fin de clip** | Arrastrar los manejadores en los bordes del clip |
| **Saltar a clip** | Clic en la tarjeta/botón de clip en el resumen |

---

## 🛠️ Tecnologías y Arquitectura

- **Frontend**: React 19, Vite 5, TypeScript 5, Lucide Icons.
- **Backend de Escritorio**: Electron 42, Node.js.
- **Motor Multimedia**: FFmpeg (`ffmpeg-static`), yt-dlp (`yt-dlp-exec`), HLS.js.
- **Empaquetado & CI/CD**: `electron-builder`, GitHub Actions.

```
CutterGold/
├── electron/
│   ├── main.ts              # Proceso principal (IPC, descarga, spawn FFmpeg/yt-dlp)
│   └── preload.ts           # Preload seguro (CommonJS contextBridge)
├── build/                   # Icono ICO y reparación del acceso de Windows
├── src/
│   ├── clipscore/            # Revisión, scoring, resumen y Settings
│   ├── App.tsx              # Componente principal de UI y lógica de reproducción
│   ├── index.css            # Sistema de diseño, temas y utilidades Glassmorphism
│   └── main.tsx             # Punto de entrada React
├── dist/                    # Bundle de producción de la UI (Vite)
├── dist-electron/           # Código compilado de Electron (Main ESM + Preload CJS)
└── release/                 # Instaladores generados para Windows (.exe)
```

---

## 💻 Instalación y Desarrollo

### Requisitos Previos
- [Node.js](https://nodejs.org/) 22.13 o superior (CI: Node.js 22)
- Git

### Pasos para Desarrollar

```bash
# 1. Clonar repositorio
git clone https://github.com/playerdude901-design/CutterGold.git
cd CutterGold

# 2. Instalar dependencias
npm ci

# 3. Iniciar en modo desarrollo
npm run electron:dev
```

### Compilar para Producción

```bash
# Compilar frontend y electron
npm run build

# Generar instalador de Windows (NSIS)
npm run electron:build
```
Los ejecutables se generarán en la carpeta `release/`.

---

## 📋 Scripts Disponibles

| Script | Descripción |
|---|---|
| `npm run dev` | Inicia el servidor de desarrollo de Vite |
| `npm run build:electron` | Compila TypeScript de Electron (Main ESM y Preload CJS) |
| `npm run build` | Compila todo el proyecto listo para empaquetar |
| `npm run electron:dev` | Ejecuta Vite y Electron concurrentemente para desarrollo |
| `npm run electron:build` | Genera los binarios e instalador con electron-builder |
| `npm run release` | Compila y publica la release automáticamente a GitHub |

---

## Historial: v0.0.8

- 🎯 **Solución Definitiva a FFmpeg ENOENT en Producción**: Detección obligatoria de binarios dentro de `app.asar.unpacked` para evitar que Electron intente ejecutar `ffmpeg.exe` desde dentro del archivo comprimido `app.asar`.
- 🖥️ **Corrección de Pantalla Blanca en Producción**: Carga robusta de `dist/index.html` mediante `app.getAppPath()` y `loadFile()`.
- 🖼️ **Icono de Aplicación y Ventana**: Inclusión de `icon.png` en el bundle y configuración en la ventana principal.
- 🎨 **Menú Oculto por Defecto**: Barra de menú nativa oculta para una experiencia de usuario moderna y limpia.
- ⚡ **Migración Completa a TypeScript**: Tipado estricto en frontend React 19 y backend Electron.
- 📁 **Selector de Carpeta Nativo**: Diálogo nativo del sistema para elegir el directorio de exportación.
- 🎚️ **Línea de Tiempo y Cabezal Interactivo**: Arrastre del cabezal en vivo y salto instantáneo a clips.

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Desarrollado por [Playerdude901](https://github.com/playerdude901-design).
