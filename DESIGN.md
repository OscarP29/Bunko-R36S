# DESIGN.md — Sistema de diseóo de R36S Manager

> **Lectura obligatoria** antes de tocar cualquier parte de la interfaz (UI,
> estilos, layout, componentes). Si una regla de este documento choca con lo
> pedido, pregunta antes de implementar. No crees estilos nuevos si ya existe
> un componente equivalente.

---

## 1. Identidad visual

R36S Manager usa un estilo **neo-brutalista claro**: fondo papel crema, contornos
negros gruesos, esquinas cuadradas, sombras sólidas desplazadas sin difuminar y
acentos morados con verde lima para acciones positivas y contadores. Se siente
como un cartucho físico: contundente, legible, sin adornos suaves.

Principios:
- **Bordes y sombras sólidas, nunca difuminadas.** La profundidad se comunica
  con desplazamiento (`4px 4px 0 #111`), no con blur.
- **Cero radios en contenedores.** `border-radius: 0` en todo lo estructural;
  los radios existentes (3-8px) pertenecen a residuos de la base oscura y están
  anulados por `!important`.
- **Una acción principal por vista/modal.** El resto es secundario o de icono.
- **Respiración obligatoria.** Ningún bloque toca a otro sin espacio; las sombras
  necesitan aire para leerse.
- **Texto legible primero.** Mínimo 14px para contenido; 12px solo para meta.
- **Nada tapa nada.** Las acciones no se superponen a imágenes, texto ni campos.

---

## 2. Tokens de diseño (valores reales)

### Colores

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#f5f1e8` | Fondo de página (papel crema) |
| `--panel` | `#fffdf7` | Superficie de tarjetas y modales |
| `--panel2` | `#ece8dc` | Superficie secundaria, chips neutros |
| `--line` | `#111` | Bordes y sombras |
| `--muted` | `#55534d` | Texto secundario |
| `--muted2` | `#292821` | Texto terciario |
| `--purple` | `#6837d5` | Acento principal (cabeceras, chips) |
| `--purple2` | `#4e20b7` | Acento oscuro |
| `--green` | `#9fed5f` | Acciones positivas, contadores, checks |
| `--green2` | `#237437` | Verde oscuro (enfasis) |
| Error | `#7f1d1d` | Texto de error |
| Aviso | `#f4b66c` | Prioridad alta / aviso |
| Exito | `#9fed5f` / `#e8f2e8` | Fondo de estado completado |
| Superficie sidebar | `#e9e4d7` | Fondo de la barra lateral |

### Tipografia

Familias (Google Fonts): `DM Sans` (cuerpo, 400-700), `Manrope` (`--display`, 400-800), `DM Mono` (`--mono`, 400-500).

Escala en uso (px): 8, 9, 10, 11, 12, 13, 14, 15, 20, 40, 43, 77.

Regla: 14px minimo para contenido legible; 12px solo para metadatos; 11px o menos
solo para etiquetas tecnicas (monoespaciado, contadores) y nunca para instrucciones.

Pesos usados: 400, 500, 600, 700, 800. Interlineado: 1.22 (titulos grandes),
1.3 (titulos), 1.4-1.5 (cuerpo), 1.8 (monoespaciado).

### Espaciado

No existe una escala formal. Valores observados (px): 2, 3, 4, 5, 6, 7, 8, 9, 10,
11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 25, 37.

Escala propuesta (4/8px) para uso futuro:
- `4` (xs), `8` (sm), `12` (md), `16` (lg), `24` (xl), `32` (2xl).

### Bordes, radios y sombras

Bordes: `1.5px`, `2px`, `3px`, `4px` (solidos `#111`). Inconsistencia: mezcla
de grosores sin criterio claro. Regla propuesta: 3px para contenedores/tarjetas,
2px para chips y controles, 4px solo para modales y sidebar.

Radios: `0` (estructural, obligatorio), residuos de 3-8px en la base oscura.

Sombras solidas (sin blur, salvo decorativas del fondo): `2px 2px`, `3px 3px`,
`4px 4px`, `5px 5px`, `6px 6px`, `8px 8px`, `9px 9px`, `10px 12px`. Color
`#111` o `rgba(17,17,17, 0.8-0.9)`.

### Z-index (capas)

| Capa | Valor | Uso |
|---|---|---|
| Contenido | 1 | Elementos base |
| Sidebar | 5 | Barra lateral fija |
| Sticky | 10 | Cabecera pegajosa / backdrop de modal |
| Modal | 20 | Contenido modal (sobre backdrop) |
| Toast | 30 (propuesto) | Notificaciones flotantes |

---

## 3. Componentes

### Boton
- **Primario**: fondo morado `#794ce2`/`#6837d5`, texto claro, borde 2-3px, sombra
  4-5px. Una sola accion principal por vista/modal.
- **Secundario**: fondo `#ece8dc` o `#fffdf7`, borde 2px, sin sombra o sombra 2px.
- **Destructivo**: separado del de confirmacion; icono de papelera; confirmacion
  o "Deshacer".
- **Icono**: cuadrado, solo icono, `aria-label` + tooltip obligatorio; area minima
  40x40px (44x44 preferible).
- Estados: hover (ligero desplazamiento de sombra), focus (outline visible),
  disabled (opacity 0.6, cursor not-allowed), activo (borde morado).

### Input / Select
- Borde 2px `#111`, fondo `#f5f1e8` o `#fffdf7`, sin radio.
- Texto 13-14px. Placeholder en `#696b77` (residuo) usar `--muted`.
- Focus: borde morado o outline visible.

### Checkbox
- 16x16px, borde 2px `#111`, fondo `#f5f1e8`. Marcado: fondo verde `#9fed5f`.

### Chip / etiqueta
- Pequeno, borde 1.5-2px, padding 3-6px, texto 10-11px uppercase, letter-spacing
  0.12em. Variantes: prioridad alta (`#f4b66c`), media (`#b99aff`), baja (`#ddd5c7`),
  consola (`#a9ee69`), categoria (`#d5c7f7`), neutro (`#ece8dc`).
- No usar barras a todo el ancho: siempre chips compactos con wrap.

### Tarjeta
- Fondo `#fffdf7`, borde 3px `#111`, sombra 4-5px, padding 12-16px.
- Un titulo protagonista, contenido, meta. Maximo 3 niveles de peso.

### Cabecera de seccion plegable
- Barra con fondo morado, texto claro, contador en badge verde, flecha indicadora.
- Clic para expandir/contraer.

### Caja punteada (drop zone)
- Solo para zonas de arrastrar/soltar. Borde `2px dashed`, fondo claro.
- Prohibido usarla como contenedor de listas.

### Modal
- Estructura fija: cabecera (titulo + cerrar), cuerpo con scroll unico, pie con
  acciones. Separador visible entre pie y cuerpo.
- Fondo backdrop `#17141dbb` con blur 5px. Modal: borde 4px, sombra 9px.
- Maximo 3 secciones principales por modal.

### Toast
- Notificacion flotante con icono + texto. (Propuesto: z-index 30.)

### Contador
- Badge con borde, fondo `#ece8dc` o verde, texto 10-11px, min-width 22-26px.

---

## 4. REGLAS ANTI-SATURACION (obligatorias)

### Espaciado y respiracion
- Minimo 24px entre secciones de un modal; 12-16px entre tarjetas de una lista;
  8px entre chips.
- Padding interno minimo de una tarjeta: 16px (12px en movil).
- Ningun elemento toca el borde de su contenedor ni el de otro bloque.
- Nunca apilar dos bordes gruesos o dos cajas con sombra sin espacio entre ellas.

### Nada tapa nada
- Prohibido colocar botones, etiquetas o iconos superpuestos sobre imagenes,
  caratulas, texto o campos. Las acciones van en una fila propia debajo o al lado.
- Si hace falta un badge sobre una imagen, solo en una esquina, tamano maximo
  del 20% de la imagen, sin cubrir el contenido principal.
- Los elementos sticky/fijos deben reservar espacio para no ocultar contenido
  al hacer scroll.

### Jerarquia visual
- Cada pantalla o tarjeta tiene UN elemento protagonista (titulo) y UNA accion
  principal destacada. El resto es secundario o terciario.
- Maximo 1 boton primario por vista/modal.
- No repetir la misma informacion en mas de un lugar a la vez.
- Maximo 3 niveles de peso visual por tarjeta (titulo, contenido, meta).

### Texto
- Tamano minimo: 14px para contenido legible; 12px solo para metadatos secundarios;
  11px o menos solo para etiquetas tecnicas.
- Prohibido concatenar varios datos en una sola linea con separadores
  (guion largo, punto medio, parentesis). Cada dato va en su propio elemento.
- Texto largo: maximo 3 lineas y opcion de expandir. Lineas de maximo ~70
  caracteres.
- Contraste minimo WCAG AA (4.5:1 texto normal, 3:1 texto grande y bordes).

### Densidad y scroll
- Evitar scroll anidado. Un modal tiene UN scroll.
- Maximo ~7 elementos de interaccion visibles por bloque antes de agrupar,
  plegar o mover a un menu secundario.
- Las listas largas tienen busqueda o filtro.
- Cajas punteadas solo para zonas de arrastrar/soltar.

### Modales
- Estructura fija: cabecera, cuerpo con scroll unico, pie con acciones.
- Separador visible entre pie y cuerpo.
- Maximo 3 secciones principales por modal.
- Accion principal a la derecha en el pie; secundaria a su izquierda. Siempre
  visible, nunca tapada.

### Interaccion
- Area tactil minima 40x40px (44x44 preferible).
- Minimo 8px entre dos botones adyacentes.
- Botones destructivos separados y con confirmacion o "Deshacer".
- Estado de foco visible en todo lo interactivo.
- Boton solo con icono lleva `aria-label` y tooltip.

### Responsive
- Disenar desde 380px: una columna, tarjetas apiladas, chips con wrap.
- Pies de modal con 2+ botones se apilan en movil, primario arriba.

---

## 5. Patrones de composicion

### Tarjeta de juego
```
+----------------------------------+
| [img 80x80]  Titulo (bold)       |
|              [chip prio] [chip]  |
|              motivo (13px)        |
|              notas (12px, muted)  |
|              [archivo] [copiar]   |
+----------------------------------+
```

### Fila de archivo en "Anadir juegos"
```
+------------------------------------------+
| [cover 112x112]  nombre.gba              |
|                  [input titulo]          |
|                  sin caratula | error    |
|                  [Buscar] [Subir] [X]    |
+------------------------------------------+
```
Las acciones de caratula van DEBAJO de la imagen, nunca superpuestas.

### Lista de pendientes
```
+-- Grupo (morado, plegable) ----------+
|  [check] Titulo (bold)        [trash]|
|      [chip cat] [chip prio] [chip]   |
|      motivo                          |
|      notas                           |
|      [archivo] [copiar]              |
+--------------------------------------+
```

### Panel de resumen
```
+----------------------------------+
| 24 juegos | 3 categorias         |
| 8 alta · 12 media · 7 baja      |
+----------------------------------+
```

### Estado vacio / carga / error
- Vacio: icono + titulo + texto explicativo + accion.
- Carga: spinner + texto.
- Error: banner rojo con icono, texto y boton cerrar.

---

## 6. Checklist de revision (antes de dar un cambio por terminado)

1. Alg??n boton cubre una imagen o texto?
2. Hay scroll dentro de scroll?
3. Hay mas de un boton primario en la vista/modal?
4. Alg??n texto por debajo de 14px es importante?
5. Se ve bien a 380px de ancho?
6. Hay dos bordes gruesos pegados sin espacio?
7. Se repite la misma informacion en varios sitios?
8. Alg??n chip o badge supera el 20% de la imagen?
9. Todos los botones con solo icono tienen `aria-label`?
10. El area tactil es al menos 40x40px?
11. Hay minimo 8px entre botones adyacentes?
12. Los modales tienen cabecera, cuerpo con scroll unico y pie visible?
13. La accion principal esta a la derecha y siempre visible?
14. Se usan solo tokens existentes (o se marcan como "Propuesto")?
15. Se aplico la escala de espaciado 4/8px?

---

## 7. Deuda de diseno detectada

1. `base.css` conserva estilos de la base oscura (1px solid `#292a35`, radios
   8px) anulados por `!important` en el tema. Archivo: `src/styles/base.css`.
2. Bordes mezclados: 1.5px, 2px, 3px, 4px sin criterio. `src/styles/theme.css`.
3. Sombras con dos familias (rgba vs `#111`) y 8 grosores distintos.
4. Espaciados fuera de escala (11, 13, 17, 19, 25, 37px). `src/styles/*.css`.
5. z-index sin escala (1, 5, 10, 20). `src/styles/base.css`.
6. Textos de 8-11px usados para informacion importante en varios componentes.
7. `modal-backdrop` usa `backdrop-filter: blur(5px)` (base) y fondo `#17141dbb`
   (tema): mezcla de dos enfoques.
8. Inline styles para sombras y tamanos en `App.tsx` (avatares, iconos).
9. `.note-composer` combina base (1px, radio 8px) y tema (3px, radio 0) con
   `!important`.

---

## 8. Casos conocidos a corregir

1. **Modal "Anadir juegos":** botones BUSCAR / SUBIR / ✕ superpuestos sobre la
   caratula. Incumple "Nada tapa nada". Deben ir en una fila debajo de la imagen.
2. **Modal "Anadir juegos":** la lista de pendientes va en una caja punteada con
   scroll propio dentro del modal, con cada juego como una linea de texto
   concatenada pegada al borde. Incumple "Evitar scroll anidado" y "Texto".
3. **Falta de separacion** entre la tarjeta del archivo, la lista de pendientes
   y el pie del modal. Incumple "Espaciado y respiracion".
4. **Textos de ayuda de 11-12px** poco legibles. Incumple "Texto".
5. **El mismo nombre de juego aparece en tres sitios** (nombre de archivo, campo
   editable, pendiente tachado) sin jerarquia clara. Incumple "Jerarquia visual".

---

## 9. Instrucciones para IAs

1. Lee este archivo completo antes de tocar la interfaz.
2. Usa solo los tokens y componentes existentes; no inventes estilos nuevos.
3. Aplica la checklist de revision antes de dar un cambio por terminado.
4. No crees estilos nuevos si hay un componente equivalente.
5. Si una regla de este documento choca con lo pedido, pregunta antes de
   implementar.
6. Marca como "Propuesto" cualquier token que no exista aun.
7. No cambies la identidad neo-brutalista ni la paleta.
8. Verifica el resultado a 380px de ancho.
