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
