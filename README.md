# CutterGold 🎬✨

Una herramienta de escritorio rápida, moderna y avanzada para automatizar, previsualizar y recortar clips de streams (Twitch/YouTube) y videos locales con precisión quirúrgica.

![CutterGold Banner](icon.png)

---

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
├── src/
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
- [Node.js](https://nodejs.org/) v18 o superior
- Git

### Pasos para Desarrollar

```bash
# 1. Clonar repositorio
git clone https://github.com/playerdude901-design/CutterGold.git
cd CutterGold

# 2. Instalar dependencias
npm install

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

## 🌟 Novedades y Soluciones en v0.0.6

- ⚡ **Migración Completa a TypeScript**: Migración integral de JavaScript a TypeScript en frontend y backend para mayor estabilidad y detección temprana de errores.
- 🛠️ **Arquitectura Dual ESM/CJS en Electron**: Compilación dedicada de `preload.ts` a CommonJS para compatibilidad estricta con el sandbox de Electron, manteniendo `main.ts` como ES Module.
- 🎯 **Solución de FFmpeg ENOENT**: Resolución robusta y automática de rutas para los binarios de `ffmpeg.exe` y `yt-dlp.exe` en entornos de desarrollo y empaquetado (`app.asar.unpacked`).
- 📁 **Selector de Carpeta Nativo**: Corrección del diálogo del sistema para elegir la carpeta de exportación sin bloqueos ni errores en el renderer.
- 🎚️ **Línea de Tiempo y Playhead Mejorados**: Sincronización instantánea del cabezal de reproducción con arrastre en vivo y salto directo a clips desde el panel de resumen.
- 🎨 **Rediseño Visual Gold**: Contraste mejorado en botones, resumen de cortes con colores de clips claramente visibles y efectos de foco.

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Desarrollado por [Playerdude901](https://github.com/playerdude901-design).