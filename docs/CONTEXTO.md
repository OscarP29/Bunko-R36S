# Bunko — contexto del proyecto

## Objetivo

Aplicación de escritorio para Windows, hecha con Tauri 2, React y TypeScript, que permite explorar y administrar una tarjeta microSD de una consola R36S/clon. El usuario elige manualmente la carpeta `ROMS`; la app busca dentro de ella las carpetas que contienen `filelist.csv`.

## Estado actual

- El frontend y el backend Rust compilan por separado.
- `npm run build` compila TypeScript y genera la web de producción en `dist/`.
- `npm run tauri build` genera el ejecutable y los instaladores (`.msi` y `.exe`) sin errores.
- `cargo test --offline` dentro de `src-tauri/` valida el backend nativo.
- `npm test` ejecuta la lógica del frontend y luego las de Rust.
- El flujo contra una microSD física no se ha probado en este entorno. Antes de dar una versión por buena conviene probarla con una tarjeta real o con una carpeta que imite su estructura.

## Funciones implementadas

### Biblioteca y microSD

- Selección de carpeta con el diálogo nativo de Tauri.
- Detección de sistemas por subcarpetas con `filelist.csv`.
- Lectura de CSV de dos columnas: archivo y título. Si el título está vacío, se usa el nombre de archivo sin extensión.
- Búsqueda local, filtro de juegos sin imagen, orden por título/archivo y vistas de cuadrícula/lista.
- Acciones para abrir la raíz seleccionada o la carpeta del sistema en el explorador del equipo. La apertura se hace desde Rust, no desde el webview.

### Juegos e imágenes

- Añadir una ROM: se copia a la carpeta del sistema y se añade una fila al `filelist.csv`.
- Si la ROM es un `.7z` (cualquier sistema salvo arcade) o un `.zip` en GBA/NES, el modal avisa de que no es recomendable y deja elegir entre extraerla al copiar o dejarla comprimida. En Configuración se puede activar «Extraer siempre». Solo se extraen comprimidos con un único archivo; los de varios (`.cue` + `.bin`) se rechazan con un mensaje.
- Renombrar un juego cambia solo su título en `filelist.csv`; la ROM, la carátula y las partidas guardadas no se tocan.
- «Organizar» reescribe el orden de `filelist.csv`, que es el que sigue la consola: alfabético o por sagas. Las sagas se detectan por el título (`src/lib/sagas.ts`) y se pueden elegir a mano al editar un juego; esas elecciones se guardan en `.r36s-manager-sagas.json` en la raíz de la tarjeta. El orden «Orden de la consola» de la biblioteca muestra el orden real del CSV.
- **Ficha de la tarjeta** (`.bunko-card.json` en la raíz): id único, nombre y modelo de la consola. Se crea al conectar la microSD y se edita en Configuración → Consola. El modelo decide dónde están favoritos y partidas; solo existe «R36SX» (clon con firmware CubeGM) y ArkOS, ROCKNIX y muOS aparecen como «Próximamente» (`src/lib/consoles.ts`).
- **Favoritos (R36SX):** se leen de `cubegm/favorites.lst` (líneas `SISTEMA/archivo|título|…`). Solo lectura: se marcan en la consola. La biblioteca muestra una estrella en la carátula y un filtro «Favoritos».
- **Emulador por juego (R36SX):** «Editar juego» ofrece los emuladores de `cubegm/cores/config.xml` que abren la extensión del juego (en un comprimido de un solo archivo, la de dentro). La elección se guarda en `cubegm/cores/filelist.xml` (`<file name="SISTEMA/archivo" core="libemu_x.so" />`), tocando solo la línea del juego y con copia `.bak`. «El del sistema» quita la línea; ese emulador va dentro del firmware, por eso sistemas como PS no tienen alternativas.
- **Partidas (R36SX):** los guardados del juego están en `cubegm/saves/<rom>.sav` (todos los sistemas juntos; arcade usa `.nv`) y los rápidos en `cubegm/states/<SISTEMA>/<rom>.svN`. Se asocian a una ROM por el nombre sin extensión. La consola no tiene reloj, así que las fechas de los archivos no sirven.
- **Copias de seguridad** (`src-tauri/src/saves.rs`): cada consola tiene su carpeta `<trabajo>/<nombre>-<id>/` y cada copia un manifiesto `bunko-copia.json` con el id de la tarjeta. «Copiar partidas» abre un modal para elegir cuáles. «Restaurar» solo ofrece copias de la misma tarjeta y partidas de juegos que siguen en ella; lo que se reemplaza se guarda antes en `antes-de-restaurar-…`. «Mover al PC y limpiar» copia las partidas sobrantes y solo después las quita. La carpeta de trabajo por defecto es `Documentos\Bunko` y no puede estar en la tarjeta.
- **Sonidos de la consola** (`src-tauri/src/look.rs`, Configuración): `cubegm/setting.xml` asigna un archivo a la música (`<bgm>`, `bgm.mp3`, que no viene de serie) y a cada efecto (`<effect0>`…`<effect8>`). Bunko no toca el XML: solo reemplaza esos archivos. Los efectos se convierten en el navegador a WAV PCM 16 bits estéreo 22050 Hz (`src/lib/wav.ts`, máx. 5 s); la música se copia como MP3. Antes del primer cambio el original se guarda en `<trabajo>/<consola>/consola-original/` con `originales.json`; «Restaurar» lo devuelve o quita el archivo si no existía.
- **Fondos de la consola** (`src-tauri/src/backgrounds.rs`, Configuración › Consola): `cubegm/UI_Res.cpd` es un ZIP sin compresión con imágenes `.raw` sin cabecera; las de 1 228 800 bytes son fondos de 640×480 en BGRA (29: menús, sistemas, multimedia y ajustes). Bunko lee y escribe el ZIP a mano con la misma forma que el firmware (versión 1.0, sin extras, conserva fecha y atributos de cada entrada): reconstruir el archivo real sin cambios da los mismos bytes. La imagen elegida se recorta a 640×480 y se aplana sobre negro. Antes del primer cambio se guarda el `UI_Res.cpd` completo en `consola-original/`; `originales.json` lista los fondos cambiados y «Restaurar» copia la entrada original.
  - **Teclas resaltadas** (`KeyMap_Key.raw`, 66×492 BGRA): seis recortes de 66×82 (X, Y, R1, A, B, L1) que la consola pega sobre `KeyMapping.raw` en posiciones fijas (`TILE_SPOTS`) para marcar el botón elegido. Llevan el fondo original incrustado, así que al cambiar `KeyMapping` Bunko los rehace: toma del `UI_Res.cpd` original solo el botón naranja (rojo mucho mayor que azul) y lo mezcla sobre el fondo nuevo. Restaurar `KeyMapping` restaura también la tira; también se puede subir una tira propia.
  - **Pantalla de carga** (`load_bg.raw` dentro de `cubegm/resource.cpd`): 640×480 en RGB565 little-endian, sin cabecera. `resource.cpd` es un ZIP con deflate (versión 2.0 y campos extra NTFS en el directorio central); `deflated_zip.rs` lo reconstruye copiando byte a byte las cabeceras originales y solo cambia datos, CRC, tamaños y desplazamientos. Su original se guarda también en `consola-original/`.
  - **Lista de juegos y buscador** (`menu.raw`, `search.raw` en `resource.cpd`, `sheets.rs`): hojas RGB565 con una tabla de 16 bytes por pieza (desplazamiento, 640, 480 y rectángulo en pantalla); la pieza 0 es el fondo y las demás (fila resaltada, títulos de sistema, iconos, teclas resaltadas) llevan el fondo original incrustado. Al cambiar el fondo se rehacen todas desde el `resource.cpd` original: lo que apenas difiere del fondo viejo se sustituye, lo opaco se conserva y lo translúcido se traslada como diferencia. En el buscador el teclado y la barra de texto están pintados en el fondo, así que se conservan (lo claro dentro de cada tecla y de `SEARCH_FIELD`).
  - Menú de pausa (`pause.raw` en Bunko, no es un archivo real): está en cada `ui_xx.cpd` de idioma, un ZIP camuflado con firmas `WQW\x03`/`WQW\x02`/`WQW\x01` en lugar de `PK…` y nombres con XOR 0xE5. Dentro, `game.raw` y `game_1.raw` (con Trucos) son hojas de piezas como `menu.raw`. Bunko rehace las dos hojas de todos los idiomas desde los originales guardados, conserva los textos claros de las opciones, el marco de la vista previa y la barra inferior, vuelve a camuflar el ZIP y actualiza la copia `game.raw` de `resource.cpd`. Restaurar devuelve los paquetes originales.
- **Logos de la consola** (`src-tauri/src/logos.rs`): `xgame-logo.bmp` (arranque, 640×480) y `cubepoweroff.bmp` (apagado, 167×175) son BMP de 32 bits sin compresión. El firmware lee las filas de arriba abajo tal como están guardadas, sin mirar el signo de la altura (`cubepoweroff.bmp` declara altura positiva pero está guardado de arriba abajo). Bunko conserva la cabecera y los bytes finales y solo cambia los píxeles, con el mismo cuarto byte (255 en el arranque, 0 en el apagado). El arranque se recorta para llenar; el apagado se encaja entero sobre negro. Los originales se guardan como los sonidos (`replace_file`/`restore_file` en `look.rs`).
- Las carátulas se convierten en el backend Rust a PNG de 512 × 512 y se guardan en `images/`.
- Para juegos existentes, el backend busca imágenes por nombre con y sin extensión dentro de `images/`. El contenido de la carpeta se indexa **una sola vez por sistema**, así que el tiempo de escaneo crece de forma lineal y no cuadrática.
- Es posible quitar la entrada del catálogo. El archivo de ROM se conserva.
- `add_game` valida y procesa todo antes de escribir: si la imagen no se puede decodificar, no se copia la ROM ni se toca el catálogo. Si algo falla a mitad, se revierte lo ya escrito.

### Escritura segura del catálogo

- `filelist.csv` se escribe en un temporal de la misma carpeta y se reemplaza con un `rename` atómico. Un corte de luz o una SD desconectada no deja el catálogo a medias.
- Antes de reemplazarlo se guarda `filelist.csv.bak` con el contenido anterior. Solo se conserva la última copia.
- La libreta (`.r36s-manager-notes.json`) también se escribe de forma atómica.

### Búsqueda de carátulas

- La búsqueda usa el árbol de GitHub de `libretro-thumbnails` para cargar los archivos de carátulas, títulos y capturas una vez por consola, y guarda el índice durante siete días.
- El índice se guarda en el directorio de caché de la app (no en `localStorage`), así que consolas grandes como PlayStation o MAME no chocan con la cuota de ~5 MB del webview. En modo navegador (`npm run dev`) se usa `localStorage` como respaldo.
- Las peticiones pasan por el plugin HTTP de Tauri, que no depende de las cabeceras CORS de los servidores y tiene el scope limitado a `api.github.com` y `thumbnails.libretro.com`.
- Si la respuesta de GitHub informa `truncated`, la app avisa e intenta obtener listados alternativos desde el servidor `thumbnails.libretro.com`.
- Normaliza nombres, quita extensión, regiones y etiquetas entre paréntesis/corchetes, elimina acentos y compara con Fuse.js. El umbral configurado es `0.34`.
- Prioriza resultados de España, Europa, USA/Europa, USA y World, en ese orden.
- Si no encuentra una carátula, intenta `Named_Titles` y `Named_Snaps`; existe también una ruta de búsqueda exacta como respaldo.
- En el modal de carátulas se pueden revisar resultados ambiguos, escoger una imagen local o marcar el juego como «sin carátula».
- La pantalla ofrece «Buscar faltantes», con hasta seis workers simultáneos y una barra de progreso. El índice se carga una sola vez para todo el lote.

### Pendientes

- Lista de juegos por añadir, con opción de completar, desmarcar y eliminar.
- Con una carpeta SD seleccionada, se guarda en `.r36s-manager-notes.json` dentro de la raíz. Sin SD, usa `localStorage`.
- La libreta no se copia de una tarjeta a otra: solo se carga y guarda para la raíz activa.

### Diseño

- La dirección visual actual es neo-brutalista clara: papel crema, contornos negros gruesos, esquinas cuadradas, sombras desplazadas y acentos morados/verde lima inspirados en Game Boy Advance.
- Las tarjetas de juegos tienen sombra y movimiento en perspectiva al pasar el cursor para sugerir cartuchos en relieve.
- Los estilos están en `src/styles/`, divididos por zonas y cargados desde `index.css`. No se usa `!important`; las reglas y la deuda pendiente están en `DESIGN.md`.

## Seguridad y datos

- La app recuerda la raíz elegida en Rust y **valida cada ruta** que llega del frontend contra esa raíz. El webview no puede leer ni escribir archivos arbitrarios del equipo.
- Los comandos de la libreta, de apertura de carpetas y de guardado de imágenes usan rutas derivadas de la raíz, no rutas enviadas por la interfaz.
- La CSP está activa y el protocolo de assets solo autoriza la carpeta de la SD cuando se selecciona. Ya no se acepta `"**"`.
- Los permisos de Tauri son mínimos: diálogo de selección, HTTP con scope explícito y comandos propios. Se retiró el plugin de sistema de archivos del frontend.
- `filelist.csv.bak` es la red de seguridad del catálogo. Si algo sale mal, basta con renombrarlo a `filelist.csv`.
- Quitar un juego del catálogo **no borra la ROM**. Añadir una ROM sí copia el archivo a la tarjeta.

## Cómo ejecutar y compilar

Requisitos: Node.js 22 o superior, Rust estable con MSVC, WebView2 (viene con Windows 10/11) y los prerequisitos de Tauri para Windows.

Desde la raíz del proyecto:

```powershell
npm install
npm run tauri dev
```

Para generar el ejecutable/instalador:

```powershell
npm run tauri build
```

La app abierta tiene que ser el ejecutable recién generado o la sesión de desarrollo actual. Reiniciar un ejecutable viejo no incorpora cambios recientes del código.

Otros comandos útiles:

```powershell
npm run typecheck   # solo TypeScript
npm run test:ts     # lógica pura del frontend (Node, sin dependencias extra)
npm run test:rust   # backend (cargo test --offline)
npm test            # ambas suites
```

## Estructura importante

- `src/App.tsx`: estado de la interfaz, selección de microSD, biblioteca, búsqueda de carátulas y libreta.
- `src/pages/`: `LibraryPage` y `NotesPage`.
- `src/hooks/`: `useLibraryView` y `useNotesView` (estado de vista que se conserva al cambiar de pestaña) , `useArtworkSearch` (búsqueda de carátulas) , `useSettings` (tema y tamaño de letra) y `useShortcuts` (atajos de teclado).
- `src/components/`: `Sidebar`, `Topbar`, `GameCard`, `NoteCard`, `AddGameModal`, `ArtworkModal` y `AiListOrganizer`.
- `src/components/ui/`: `Button`, `IconButton`, `Field`, `Chip`, `ModalBackdrop` y `ModalHeader`.
- `src/lib/rom.ts`: normalización de nombres, regiones y mapeo de carpetas a consolas Libretro.
- `src/lib/artwork.ts`: lectura de índices, ranking con Fuse y heurísticas de match automático.
- `src/lib/backend.ts`: envoltorios tipados de los comandos Rust.
- `src/lib/store.ts`: caché en disco con respaldo en `localStorage`.
- `src/lib/http.ts`: peticiones con el plugin HTTP y reintento desde el webview.
- `src/lib/aliases.ts`: lectura de `src/aliases.json`.
- `src/lib/*.test.ts`: pruebas de la lógica pura.
- `src/styles/`: `tokens.css`, `reset.css`, `layout/`, `components/` y `pages/`.
- `src-tauri/src/lib.rs`: comandos, lectura/escritura CSV atómica con copia de seguridad, índice de imágenes, caché en disco, validación de rutas y pruebas unitarias.
- `src-tauri/tauri.conf.json`: ventanas, CSP, protocolo de assets y configuración del plugin HTTP.
- `src-tauri/capabilities/default.json`: permisos y scope de red.

## Añadir alias

Edita `src/aliases.json`. La clave es el nombre de ROM en español y el valor es el título que usa Libretro. Por ejemplo:

```json
{
  "pokemon esmeralda": "Pokemon - Edicion Esmeralda",
  "pokemon rubi": "Pokemon - Edicion Rubi"
}
```

La clave se compara después de normalizar, así que no necesita extensión ni acentos. El archivo se importa en tiempo de compilación: hay que recompilar para ver los cambios.

## Añadir un sistema

En `guessLibretroSystem` dentro de `src/lib/rom.ts`, añade una entrada al objeto `names`. La clave se forma con el nombre de carpeta pasado a minúsculas y quitando signos/espacios; el valor debe ser el nombre exacto de la consola en el servidor Libretro. Ejemplo: `nintendoentertainmentsystem: "Nintendo - Nintendo Entertainment System"`.

## Datos y límites conocidos

- La raíz seleccionada se recuerda en `localStorage`.
- El índice de carátulas vive en la caché de la app y caduca a los siete días; en modo navegador se usa `localStorage`.
- La lista «sin carátula» está actualmente en estado de interfaz; no se sincroniza con la tarjeta después de cerrar la app.
- El mapeo de nombres de carpetas a nombres de sistemas Libretro es manual y está en `guessLibretroSystem`.
- El contenido de los índices remotos y la disponibilidad de los listados web depende de GitHub y `thumbnails.libretro.com`. Sin token, GitHub limita a 60 peticiones por hora.
- Algunos nombres localizados pueden necesitar alias para acertar el título inglés exacto.
- Las pruebas de Rust y de TypeScript cubren lógica y escritura de archivos, pero no la interfaz ni el diálogo nativo.
