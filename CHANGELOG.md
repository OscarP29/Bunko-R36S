# Changelog

Cambios de cada versión de Bunko. Las versiones siguen [SemVer](https://semver.org/lang/es/).

## [0.5.0] - 2026-11-11

### Añadido

- **Emulador por juego:** en «Editar juego» se elige con qué emulador abre la consola cada juego, entre los que soportan su formato. Sirve para los juegos que van lentos o fallan. Bunko solo cambia la línea de ese juego en `cubegm/cores/filelist.xml` y guarda una copia `.bak`. «El del sistema» lo deja como venía.
- **Menú de pausa:** se cambia el fondo del menú que sale dentro del juego (Volver, Renunciar, Cargar, Salvar, Trucos). Cambia en todos los idiomas a la vez y conserva los textos, el marco de la vista previa y la barra inferior.
- **Pantalla de carga:** se cambia la imagen que sale mientras arranca un juego.
- **Lista de juegos y buscador:** se cambian sus fondos. Bunko rehace sobre la imagen nueva la fila elegida, los títulos, los iconos y el teclado.
- **Teclas resaltadas:** al cambiar el mapa de teclas, Bunko rehace los botones resaltados sobre el fondo nuevo. También se pueden subir a mano.

### Seguridad

- Los archivos originales de la consola se guardan antes del primer cambio y se pueden restaurar desde Bunko.

## [0.4.0] - 2026-11-02

### Corregido

- Las carátulas de ROMs con puntos en el nombre («Super Mario Bros. 3.nes») ya se encuentran.
- Una carátula recién guardada ya no queda tapada por otras variantes ni por la caché.
- Las carátulas ya no se rompen al volver a conectar la microSD.
- Las carpetas de CubeGM (FC, SFC, MD, GG, NGP, NGPC, SWC) se reconocen al buscar carátulas.

## [0.3.0] - 2026-11-02

### Añadido

- Sugerencias de títulos al añadir pendientes.
- Menú con clic derecho en los juegos: editar, cambiar imagen, quitar y quitar para añadir a pendientes.
- Vaciar la lista de pendientes con opción de «Deshacer».
- Cambiar el nombre de un juego en la consola y organizar el orden por nombre o por saga.

## [0.2.0] - 2026-11-02

### Añadido

- Fondos de menús y sistemas, logos de arranque y apagado y sonidos de la consola.
- Favoritos de la consola, perfiles de tarjeta y copias de las partidas guardadas.
- Extraer ROMs comprimidas al añadirlas.

[0.5.0]: https://github.com/OscarP29/Bunko-R36S/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/OscarP29/Bunko-R36S/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/OscarP29/Bunko-R36S/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/OscarP29/Bunko-R36S/releases/tag/v0.2.0
