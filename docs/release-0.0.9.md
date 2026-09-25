# CutterGold 0.0.9 — ClipScore e iconos de Windows

## Novedades

- ClipScore: revisión fullscreen, reproducción del rango del clip, mute y cabezal local.
- Cinco preguntas con puntuación automática de 0 a 10: Excelente, Bueno, Dudoso o Descartar.
- Resumen con cantidades, porcentajes, categorías seleccionables y duración total.
- Exportación organizada por categoría; los archivos exportados en la sesión se mueven sin recodificación y sin sobrescribir archivos anteriores.
- Settings para OpenRouter: clave cifrada, modelo opcional y sugerencia local si la IA no está configurada o falla.

## Correcciones

- Icono ICO multirresolución para el ejecutable, instalador, desinstalador y ventana.
- Reparación del acceso directo del escritorio en instalaciones y actualizaciones, con un icono instalado en una ruta estable.
- Identidad de Windows consistente para la aplicación y sus accesos directos.
- Cancelación de FFmpeg corregida y eliminación de archivos incompletos.
- Edición de tiempos con milisegundos, ajuste de timeline para videos largos y prevención de clips vacíos.

## Instalación

Descarga **CutterGold-Setup-0.0.9-x64.exe** y sigue el asistente. Puedes instalar sobre la versión anterior para reparar el acceso directo del escritorio.

Se incluyen **latest.yml** y el **blockmap** para el actualizador integrado.

## Notas

Las revisiones y la asociación de archivos exportados se conservan durante la sesión. El video fuente no se mueve. OpenRouter es opcional; necesita una clave válida y utiliza los créditos de tu cuenta.

## Verificación

Pruebas de puntuación, movimiento sin sobrescritura, iconos multirresolución, lint, compilación y recorrido real con Electron y FFmpeg. La respuesta de OpenRouter se prueba con simulaciones; no se utiliza una clave real en CI.
