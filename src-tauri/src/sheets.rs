//! Hojas de imágenes de `resource.cpd` (`menu.raw`, `search.raw`).
//!
//! Formato: una tabla de 16 bytes por pieza (`u32` desplazamiento, `u16` 640,
//! `u16` 480 y el rectángulo `x0, y0, x1, y1` en pantalla) seguida de los
//! píxeles de cada pieza en RGB565 little-endian. La pieza 0 es el fondo de
//! 640×480; las demás (fila resaltada, títulos, iconos, teclas) llevan el
//! fondo original incrustado porque la consola las pega tal cual encima.
//!
//! Para cambiar el fondo, cada pieza se rehace sobre el nuevo: lo que apenas
//! difiere del fondo original se sustituye por el nuevo, lo opaco (texto,
//! iconos) se conserva y lo translúcido (brillos, sombras) se traslada como
//! diferencia sobre el fondo nuevo.

const SCREEN_WIDTH: usize = 640;
const SCREEN_HEIGHT: usize = 480;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Piece {
    pub x0: usize,
    pub y0: usize,
    pub x1: usize,
    pub y1: usize,
    offset: usize,
}

impl Piece {
    fn width(&self) -> usize {
        self.x1 - self.x0
    }
    fn len(&self) -> usize {
        self.width() * (self.y1 - self.y0) * 2
    }
}

fn u16_at(bytes: &[u8], pos: usize) -> usize {
    u16::from_le_bytes([bytes[pos], bytes[pos + 1]]) as usize
}

/// Lee la tabla de piezas y comprueba que todo encaja: la primera es la
/// pantalla completa, las demás caen dentro de la pantalla y los datos ocupan
/// exactamente el archivo, sin huecos ni solapes.
pub fn parse(data: &[u8], label: &str) -> Result<Vec<Piece>, String> {
    let invalid = || format!("{label} tiene un formato que Bunko no sabe editar");
    if data.len() < 16 {
        return Err(invalid());
    }
    let header = u32::from_le_bytes(data[..4].try_into().unwrap()) as usize;
    if header == 0 || header % 16 != 0 || header > data.len() {
        return Err(invalid());
    }
    let mut pieces = Vec::with_capacity(header / 16);
    let mut expected = header;
    for i in 0..header / 16 {
        let at = i * 16;
        let piece = Piece {
            offset: u32::from_le_bytes(data[at..at + 4].try_into().unwrap()) as usize,
            x0: u16_at(data, at + 8),
            y0: u16_at(data, at + 10),
            x1: u16_at(data, at + 12),
            y1: u16_at(data, at + 14),
        };
        let screen_ok = u16_at(data, at + 4) == SCREEN_WIDTH && u16_at(data, at + 6) == SCREEN_HEIGHT;
        let rect_ok = piece.x0 < piece.x1 && piece.y0 < piece.y1 && piece.x1 <= SCREEN_WIDTH && piece.y1 <= SCREEN_HEIGHT;
        if !screen_ok || !rect_ok || piece.offset != expected {
            return Err(invalid());
        }
        expected += piece.len();
        pieces.push(piece);
    }
    let full = Piece { x0: 0, y0: 0, x1: SCREEN_WIDTH, y1: SCREEN_HEIGHT, offset: header };
    if expected != data.len() || pieces[0] != full {
        return Err(invalid());
    }
    Ok(pieces)
}

fn decode(v: u16) -> [i32; 3] {
    let (r, g, b) = ((v >> 11) & 31, (v >> 5) & 63, v & 31);
    [(r * 255 / 31) as i32, (g * 255 / 63) as i32, (b * 255 / 31) as i32]
}

fn encode(p: [i32; 3]) -> [u8; 2] {
    let c = |v: i32| v.clamp(0, 255) as u16;
    (((c(p[0]) >> 3) << 11) | ((c(p[1]) >> 2) << 5) | (c(p[2]) >> 3)).to_le_bytes()
}

fn pixel(data: &[u8], piece: &Piece, x: usize, y: usize) -> [i32; 3] {
    let at = piece.offset + (y * piece.width() + x) * 2;
    decode(u16::from_le_bytes([data[at], data[at + 1]]))
}

/// Fondo (pieza 0) en RGB, 640×480×3.
pub fn base_rgb(data: &[u8], pieces: &[Piece]) -> Vec<u8> {
    let base = &pieces[0];
    (0..SCREEN_HEIGHT)
        .flat_map(|y| (0..SCREEN_WIDTH).map(move |x| (x, y)))
        .flat_map(|(x, y)| pixel(data, base, x, y).map(|c| c as u8))
        .collect()
}

fn rgb_at(rgb: &[u8], x: usize, y: usize) -> [i32; 3] {
    let at = (y * SCREEN_WIDTH + x) * 3;
    [rgb[at] as i32, rgb[at + 1] as i32, rgb[at + 2] as i32]
}

fn max_diff(a: [i32; 3], b: [i32; 3]) -> i32 {
    (0..3).map(|c| (a[c] - b[c]).abs()).max().unwrap_or(0)
}

/// Rehace la hoja con `new_base` (RGB 640×480) como fondo.
///
/// `keep` son zonas de la interfaz dibujadas en el propio fondo (el teclado y
/// la barra del buscador): dentro de ellas se conserva lo claro del fondo
/// original, que es la interfaz, y lo oscuro deja ver el fondo nuevo.
pub fn rebuild(data: &[u8], pieces: &[Piece], new_base: &[u8], keep: &[(usize, usize, usize, usize)]) -> Vec<u8> {
    let old = base_rgb(data, pieces);
    let mut base: Vec<[i32; 3]> = (0..SCREEN_WIDTH * SCREEN_HEIGHT)
        .map(|i| [new_base[i * 3] as i32, new_base[i * 3 + 1] as i32, new_base[i * 3 + 2] as i32])
        .collect();
    for &(x0, y0, x1, y1) in keep {
        for y in y0..y1.min(SCREEN_HEIGHT) {
            for x in x0..x1.min(SCREEN_WIDTH) {
                let ui = rgb_at(&old, x, y);
                let light = *ui.iter().max().unwrap();
                let w = (light - 55).clamp(0, 25);
                let cell = &mut base[y * SCREEN_WIDTH + x];
                *cell = [0, 1, 2].map(|c| (ui[c] * w + cell[c] * (25 - w)) / 25);
            }
        }
    }

    let mut out = data[..pieces[0].offset].to_vec();
    for p in &base {
        out.extend(encode(*p));
    }
    for piece in &pieces[1..] {
        for y in piece.y0..piece.y1 {
            for x in piece.x0..piece.x1 {
                let own = pixel(data, piece, x - piece.x0, y - piece.y0);
                let before = rgb_at(&old, x, y);
                let now = base[y * SCREEN_WIDTH + x];
                let diff = max_diff(own, before);
                let mixed = if diff < 6 {
                    now
                } else {
                    // 0 = translúcido (se traslada la diferencia); 60 = opaco.
                    let w = (diff - 60).clamp(0, 60);
                    [0, 1, 2].map(|c| {
                        let shifted = (now[c] + own[c] - before[c]).clamp(0, 255);
                        (own[c] * w + shifted * (60 - w)) / 60
                    })
                };
                out.extend(encode(mixed));
            }
        }
    }
    out
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// Hoja de prueba: fondo gris, una pieza opaca blanca y una translúcida
    /// (fondo gris un poco más claro).
    pub(crate) fn sample() -> Vec<u8> {
        let rects = [(0, 0, 640, 480), (10, 10, 20, 20), (100, 100, 110, 104)];
        let header = rects.len() * 16;
        let mut table = Vec::new();
        let mut pixels = Vec::new();
        for (i, &(x0, y0, x1, y1)) in rects.iter().enumerate() {
            table.extend(((header + pixels.len()) as u32).to_le_bytes());
            for v in [640u16, 480, x0, y0, x1, y1] {
                table.extend(v.to_le_bytes());
            }
            let color = match i {
                0 => [96, 96, 96],
                1 => [255, 255, 255],
                _ => [126, 126, 126],
            };
            for _ in 0..(x1 - x0) as usize * (y1 - y0) as usize {
                pixels.extend(encode(color));
            }
        }
        table.extend(pixels);
        table
    }

    #[test]
    fn lee_la_tabla_y_rechaza_hojas_incoherentes() {
        let data = sample();
        let pieces = parse(&data, "x").unwrap();
        assert_eq!(pieces.len(), 3);
        assert_eq!((pieces[1].x0, pieces[1].y1), (10, 20));
        assert!(parse(&data[..data.len() - 2], "x").is_err());
        let mut broken = data.clone();
        broken[4] = 0; // ancho de pantalla distinto de 640
        assert!(parse(&broken, "x").is_err());
    }

    #[test]
    fn rehace_las_piezas_sobre_el_fondo_nuevo() {
        let data = sample();
        let pieces = parse(&data, "x").unwrap();
        let red = [200u8, 0, 0].repeat(SCREEN_WIDTH * SCREEN_HEIGHT);
        let out = rebuild(&data, &pieces, &red, &[]);
        assert_eq!(out.len(), data.len());
        assert_eq!(parse(&out, "x").unwrap(), pieces);
        let base = pieces[0];
        let near = |a: [i32; 3], b: [i32; 3]| max_diff(a, b) <= 8;
        assert!(near(pixel(&out, &base, 0, 0), [200, 0, 0]));
        // Lo opaco se conserva.
        assert!(near(pixel(&out, &pieces[1], 0, 0), [255, 255, 255]));
        // Lo translúcido (+30 sobre el gris) se traslada sobre el rojo.
        assert!(near(pixel(&out, &pieces[2], 0, 0), [230, 30, 30]));
    }

    #[test]
    fn conserva_la_interfaz_clara_de_las_zonas_indicadas() {
        let data = sample();
        let pieces = parse(&data, "x").unwrap();
        let black = vec![0u8; SCREEN_WIDTH * SCREEN_HEIGHT * 3];
        let out = rebuild(&data, &pieces, &black, &[(0, 0, 5, 5)]);
        let base = pieces[0];
        // Dentro de la zona: el gris original (más claro que 55) se mantiene.
        assert!(max_diff(pixel(&out, &base, 2, 2), [96, 96, 96]) <= 8);
        assert_eq!(pixel(&out, &base, 50, 50), [0, 0, 0]);
    }
}
