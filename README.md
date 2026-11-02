# R36S Manager — contexto del proyecto

## Objetivo

Aplicación de escritorio para Windows, hecha con Tauri 2, React y TypeScript, que permite explorar y administrar una tarjeta microSD de una consola R36S/clon. El usuario elige manualmente la carpeta `ROMS`; la app busca dentro de ella las carpetas que contienen `filelist.csv`.

## Estado actual

- El frontend y el backend Rust están creados y compilan por separado.
- `npm run build` compila TypeScript y genera la web de producción en `dist/`.
- `cargo check --offline` dentro de `src-tauri/` valida el backend nativo.
- La compilación completa del ejecutable Tauri se intentó, pero no terminó en la sesión de trabajo. Por eso abrir un ejecutable anterior puede mostrar una versión vieja; el cambio de estilos está en el código fuente y en el último `dist/` generado.
- No se ha validado el flujo contra una microSD física conectada en este entorno.

## Funciones implementadas

### Biblioteca y microSD

- Selección de carpeta con el diálogo nativo de Tauri.
- Detección de sistemas por subcarpetas con `filelist.csv`.
- Lectura de CSV de dos columnas: archivo y título. Si el título está vacío, se usa el nombre de archivo sin extensión.
- Búsqueda local, filtro de juegos sin imagen, orden por título/archivo y vistas de cuadrícula/lista.
- Acciones para abrir la raíz seleccionada o la carpeta del sistema seleccionado en el explorador del equipo. En Tauri se usa `plugin-opener`.

### Juegos e imágenes

- Añadir una ROM: se copia a la carpeta del sistema y se añade una fila al `filelist.csv`.
- Las carátulas se convierten en el backend Rust a PNG de 512 × 512 y se guardan en `images/`.
- Para juegos existentes, el backend busca imágenes por nombre con y sin extensión dentro de `images/`.
- Es posible quitar la entrada del catálogo. El archivo de ROM se conserva.

### Búsqueda de carátulas

- La búsqueda usa el árbol de GitHub de `libretro-thumbnails` para cargar los archivos `Named_Boxarts` una vez por consola y guarda el índice en `localStorage` durante siete días.
- Si la respuesta de GitHub informa `truncated`, la app avisa e intenta obtener listados alternativos desde el servidor `thumbnails.libretro.com`.
- Normaliza nombres, quita extensión, regiones y etiquetas entre paréntesis/corchetes, elimina acentos y compara con Fuse.js. El umbral configurado es `0.34`.
- Prioriza resultados de España, Europa, USA/Europa, USA y World, en ese orden.
- Si no encuentra una carátula, intenta `Named_Titles` y `Named_Snaps`; existe también una ruta de búsqueda exacta como respaldo.
- En el modal de carátulas se pueden revisar resultados ambiguos, escoger una imagen local o marcar el juego como «sin carátula».
- La pantalla ofrece «Buscar faltantes», con hasta seis workers simultáneos y una barra de progreso.

### Pendientes

- Lista de juegos por añadir, con opción de completar, desmarcar y eliminar.
- Con una carpeta SD seleccionada, se guarda en `.r36s-manager-notes.json` dentro de la raíz. Sin SD, usa `localStorage`.

### Diseño

- La dirección visual actual es neo-brutalista clara: papel crema, contornos negros gruesos, esquinas cuadradas, sombras desplazadas y acentos morados/verde lima inspirados en Game Boy Advance.
- Las tarjetas de juegos tienen sombra y movimiento en perspectiva al pasar el cursor para sugerir cartuchos en relieve.

## Cómo ejecutar y compilar

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

## Estructura importante

- `src/App.tsx`: interfaz, selección de microSD, biblioteca, búsqueda de carátulas y libreta.
- `src/styles.css`: estilos; el bloque neo-brutalista está al final y sobrescribe la hoja oscura inicial.
- `src/aliases.json`: diccionario editable de alias de nombres en español a títulos del catálogo.
- `src-tauri/src/lib.rs`: lectura/escritura CSV, escaneo, copia de ROMs, conversión/guardado de imágenes y libreta.
- `src-tauri/tauri.conf.json`: configuración de ventanas, protocolo de assets e iconos.
- `src-tauri/capabilities/default.json`: permisos de los plugins Tauri.

## Añadir alias

Edita `src/aliases.json`. La clave es el nombre de ROM en español y el valor es el título que usa Libretro. Por ejemplo:

```json
{
  "pokemon esmeralda": "Pokemon - Edicion Esmeralda",
  "pokemon rubi": "Pokemon - Edicion Rubi"
}
```

La clave se compara después de normalizar, así que no necesita extensión ni acentos.

## Añadir un sistema

En `guessLibretroSystem` dentro de `src/App.tsx`, añade una entrada al objeto `names`. La clave se forma con el nombre de carpeta pasado a minúsculas y quitando signos/espacios; el valor debe ser el nombre exacto de la consola en el servidor Libretro. Ejemplo: `nintendoentertainmentsystem: "Nintendo - Nintendo Entertainment System"`.

## Datos y límites conocidos

- La raíz seleccionada se recuerda en `localStorage`.
- La caché del índice de carátulas vive en `localStorage`, no en IndexedDB.
- La lista «sin carátula» está actualmente en estado de interfaz; no se sincroniza con la tarjeta después de cerrar la app.
- El mapeo de nombres de carpetas a nombres de sistemas Libretro es manual y está en `guessLibretroSystem`.
- El contenido de los índices remotos y la disponibilidad de los listados web depende de GitHub y `thumbnails.libretro.com`.
- Algunos nombres localizados pueden necesitar alias para acertar el título inglés exacto.
