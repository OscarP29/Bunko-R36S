//! Fondos del menú de la consola (perfil R36SX / firmware CubeGM).
//!
//! `cubegm/UI_Res.cpd` es un ZIP sin compresión con imágenes `.raw` sin
//! cabecera. Las de pantalla completa miden 640×480 en BGRA (1 228 800 bytes):
//! el fondo de cada sistema y de cada pantalla de ajustes. Bunko lo reescribe
//! con la misma estructura que el original (entradas guardadas, sin campos
//! extra) y guarda antes una copia completa para poder restaurar cada fondo.
//!
//! Además de los fondos de pantalla completa:
//! - `KeyMap_Key.raw` (66×492 BGRA): seis recortes de 66×82 que la consola
//!   pega sobre `KeyMapping.raw` para resaltar el botón elegido. Llevan dentro
//!   el fondo original, así que al cambiar `KeyMapping` Bunko los rehace sobre
//!   el fondo nuevo, conservando solo el botón resaltado.
//! - `load_bg.raw` de `cubegm/resource.cpd`: la pantalla «Loading…», 640×480
//!   en RGB565. Ese `.cpd` sí va comprimido; ver [`crate::deflated_zip`].

use crate::deflated_zip;
use crate::sheets;
use crate::look::{originals_folder, read_originals, write_originals, Originals, CUBEGM_DIR};
use crate::write_atomic;
use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, DynamicImage, RgbImage, RgbaImage};
use serde::Serialize;
use std::{fs, path::Path};

const UI_FILE: &str = "UI_Res.cpd";
pub const SCREEN_WIDTH: u32 = 640;
pub const SCREEN_HEIGHT: u32 = 480;
const SCREEN_BYTES: usize = (SCREEN_WIDTH * SCREEN_HEIGHT * 4) as usize;
const THUMB_WIDTH: u32 = 320;
const THUMB_HEIGHT: u32 = 240;

const RESOURCE_FILE: &str = "resource.cpd";
/// Pantalla de carga, dentro de `resource.cpd`.
pub const LOADING: &str = "load_bg.raw";
const LOADING_BYTES: usize = (SCREEN_WIDTH * SCREEN_HEIGHT * 2) as usize;
/// Lista de juegos y buscador: hojas de piezas, ver [`crate::sheets`].
const GAME_LIST: &str = "menu.raw";
const SEARCH: &str = "search.raw";
const RESOURCE_SCREENS: [&str; 3] = [LOADING, GAME_LIST, SEARCH];
/// Barra de texto del buscador, dibujada en su fondo (con margen).
const SEARCH_FIELD: (usize, usize, usize, usize) = (258, 34, 532, 68);

const KEY_MAPPING: &str = "KeyMapping.raw";
const KEY_TILES: &str = "KeyMap_Key.raw";
const TILE_WIDTH: u32 = 66;
const TILE_HEIGHT: u32 = 82;
/// Esquina de cada recorte sobre `KeyMapping`, en el orden de la tira
/// (X, Y, R1, A, B, L1). Medido sobre el original del firmware.
const TILE_SPOTS: [(u32, u32); 6] = [(400, 296), (368, 336), (427, 192), (440, 336), (400, 368), (176, 192)];
const TILES_HEIGHT: u32 = TILE_HEIGHT * TILE_SPOTS.len() as u32;
const TILES_BYTES: usize = (TILE_WIDTH * TILES_HEIGHT * 4) as usize;

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Background {
    /// Nombre dentro del `.cpd`, como `GBA.raw`.
    pub name: String,
    pub customized: bool,
}

/// Entrada de un ZIP sin compresión.
#[derive(Clone, Debug)]
struct Entry {
    name: String,
    time: u16,
    date: u16,
    /// Atributos externos (el bit de archivo de Windows en algunas entradas).
    attrs: u32,
    data: std::ops::Range<usize>,
}

fn u16_at(bytes: &[u8], pos: usize) -> u16 {
    u16::from_le_bytes([bytes[pos], bytes[pos + 1]])
}

fn u32_at(bytes: &[u8], pos: usize) -> u32 {
    u32::from_le_bytes(bytes[pos..pos + 4].try_into().unwrap())
}

/// Lee el directorio central. Solo admite entradas guardadas (sin compresión),
/// que es lo que usa el firmware; si no, se niega a editar el archivo.
fn read_entries(bytes: &[u8]) -> Result<Vec<Entry>, String> {
    let invalid = || "UI_Res.cpd tiene un formato que Bunko no sabe editar".to_string();
    let eocd = bytes
        .len()
        .checked_sub(22)
        .and_then(|last| (0..=last).rev().find(|&i| bytes[i..].starts_with(b"PK\x05\x06")))
        .ok_or_else(invalid)?;
    let count = u16_at(bytes, eocd + 10) as usize;
    let mut pos = u32_at(bytes, eocd + 16) as usize;
    let mut entries = Vec::with_capacity(count);
    for _ in 0..count {
        if pos + 46 > bytes.len() || !bytes[pos..].starts_with(b"PK\x01\x02") {
            return Err(invalid());
        }
        let method = u16_at(bytes, pos + 10);
        let size = u32_at(bytes, pos + 20) as usize;
        let name_len = u16_at(bytes, pos + 28) as usize;
        let extra_len = u16_at(bytes, pos + 30) as usize;
        let comment_len = u16_at(bytes, pos + 32) as usize;
        let local = u32_at(bytes, pos + 42) as usize;
        if method != 0 || u32_at(bytes, pos + 24) as usize != size || pos + 46 + name_len > bytes.len() {
            return Err(invalid());
        }
        let name = String::from_utf8_lossy(&bytes[pos + 46..pos + 46 + name_len]).to_string();
        if local + 30 > bytes.len() || !bytes[local..].starts_with(b"PK\x03\x04") {
            return Err(invalid());
        }
        let start = local + 30 + u16_at(bytes, local + 26) as usize + u16_at(bytes, local + 28) as usize;
        if start + size > bytes.len() {
            return Err(invalid());
        }
        entries.push(Entry {
            name,
            time: u16_at(bytes, pos + 12),
            date: u16_at(bytes, pos + 14),
            attrs: u32_at(bytes, pos + 38),
            data: start..start + size,
        });
        pos += 46 + name_len + extra_len + comment_len;
    }
    Ok(entries)
}

/// ZIP sin compresión con la misma forma que el original del firmware:
/// versión 1.0, sin banderas, sin campos extra ni comentarios.
fn write_entries(entries: &[(&Entry, &[u8])]) -> Vec<u8> {
    let total: usize = entries.iter().map(|(e, d)| 30 + 46 + 2 * e.name.len() + d.len()).sum();
    let mut out = Vec::with_capacity(total + 22);
    let mut central = Vec::new();
    for (entry, data) in entries {
        let offset = out.len() as u32;
        let crc = crc32fast::hash(data);
        let name = entry.name.as_bytes();
        let common = |buf: &mut Vec<u8>| {
            buf.extend(0u16.to_le_bytes()); // banderas
            buf.extend(0u16.to_le_bytes()); // sin compresión
            buf.extend(entry.time.to_le_bytes());
            buf.extend(entry.date.to_le_bytes());
            buf.extend(crc.to_le_bytes());
            buf.extend((data.len() as u32).to_le_bytes());
            buf.extend((data.len() as u32).to_le_bytes());
            buf.extend((name.len() as u16).to_le_bytes());
            buf.extend(0u16.to_le_bytes()); // campo extra
        };
        out.extend(b"PK\x03\x04");
        out.extend(10u16.to_le_bytes());
        common(&mut out);
        out.extend(name);
        out.extend(*data);

        central.extend(b"PK\x01\x02");
        central.extend(20u16.to_le_bytes());
        central.extend(10u16.to_le_bytes());
        common(&mut central);
        central.extend([0u8; 6]); // comentario, disco, atributos internos
        central.extend(entry.attrs.to_le_bytes());
        central.extend(offset.to_le_bytes());
        central.extend(name);
    }
    let central_offset = out.len() as u32;
    out.extend(&central);
    out.extend(b"PK\x05\x06");
    out.extend([0u8; 4]);
    out.extend((entries.len() as u16).to_le_bytes());
    out.extend((entries.len() as u16).to_le_bytes());
    out.extend((central.len() as u32).to_le_bytes());
    out.extend(central_offset.to_le_bytes());
    out.extend(0u16.to_le_bytes());
    out
}

fn ui_path(root: &Path) -> std::path::PathBuf {
    root.join(CUBEGM_DIR).join(UI_FILE)
}

fn read_ui(root: &Path) -> Result<Vec<u8>, String> {
    fs::read(ui_path(root)).map_err(|_| "No se encontró cubegm/UI_Res.cpd en la tarjeta".to_string())
}

fn is_screen(entry: &Entry) -> bool {
    entry.data.len() == SCREEN_BYTES && entry.name.to_ascii_lowercase().ends_with(".raw")
}

/// Fondos de pantalla completa y la tira de teclas resaltadas.
fn is_editable(entry: &Entry) -> bool {
    is_screen(entry) || (entry.name == KEY_TILES && entry.data.len() == TILES_BYTES)
}

fn find_screen<'a>(entries: &'a [Entry], name: &str) -> Result<&'a Entry, String> {
    entries
        .iter()
        .find(|entry| entry.name == name && is_editable(entry))
        .ok_or_else(|| format!("La consola no tiene el fondo {name}"))
}

fn resource_path(root: &Path) -> std::path::PathBuf {
    root.join(CUBEGM_DIR).join(RESOURCE_FILE)
}

fn is_resource_screen(name: &str) -> bool {
    RESOURCE_SCREENS.contains(&name)
}

/// `resource.cpd` y sus entradas.
fn read_resource(root: &Path) -> Result<(Vec<u8>, Vec<deflated_zip::ZipEntry>), String> {
    let bytes = fs::read(resource_path(root)).map_err(|_| "No se encontró cubegm/resource.cpd en la tarjeta".to_string())?;
    let entries = deflated_zip::read_entries(&bytes, RESOURCE_FILE)?;
    Ok((bytes, entries))
}

/// Datos de una pantalla de `resource.cpd`, comprobando que tienen la forma esperada.
fn resource_screen(bytes: &[u8], entries: &[deflated_zip::ZipEntry], name: &str) -> Result<Vec<u8>, String> {
    let missing = || format!("Esta consola no tiene la pantalla {name} que se pueda cambiar");
    let entry = entries.iter().find(|entry| entry.name == name).ok_or_else(missing)?;
    if name == LOADING && entry.size != LOADING_BYTES {
        return Err(missing());
    }
    let data = deflated_zip::read_data(bytes, entry)?;
    if name != LOADING {
        sheets::parse(&data, name)?;
    }
    Ok(data)
}

/// Fondo de una pantalla de `resource.cpd`, para la vista previa.
fn resource_base(name: &str, data: &[u8]) -> Result<RgbImage, String> {
    if name == LOADING {
        return Ok(rgb565_to_image(data));
    }
    let pieces = sheets::parse(data, name)?;
    Ok(RgbImage::from_raw(SCREEN_WIDTH, SCREEN_HEIGHT, sheets::base_rgb(data, &pieces)).expect("tamaño de pantalla"))
}

/// Datos nuevos de una pantalla de `resource.cpd` con `image` de fondo.
fn resource_data(name: &str, old: &[u8], image: &DynamicImage) -> Result<Vec<u8>, String> {
    if name == LOADING {
        return Ok(image_to_rgb565(image));
    }
    let pieces = sheets::parse(old, name)?;
    let rgb: Vec<u8> = fit_bgra(image, SCREEN_WIDTH, SCREEN_HEIGHT, false, 255)
        .chunks_exact(4)
        .flat_map(|p| [p[2], p[1], p[0]])
        .collect();
    // En el buscador el teclado y la barra de texto forman parte del fondo.
    let keep: Vec<_> = if name == SEARCH {
        pieces[1..].iter().map(|p| (p.x0, p.y0, p.x1, p.y1)).chain([SEARCH_FIELD]).collect()
    } else {
        Vec::new()
    };
    Ok(sheets::rebuild(old, &pieces, &rgb, &keep))
}

pub fn list_backgrounds(root: &Path, work_dir: &str) -> Result<Vec<Background>, String> {
    let customized = match originals_folder(root, work_dir) {
        Ok((folder, card_id)) => read_originals(&folder, &card_id).backgrounds,
        Err(_) => Vec::new(),
    };
    let mut list: Vec<Background> = read_entries(&read_ui(root)?)?
        .iter()
        .filter(|entry| is_editable(entry))
        .map(|entry| Background { customized: customized.contains(&entry.name), name: entry.name.clone() })
        .collect();
    if let Ok((bytes, entries)) = read_resource(root) {
        for name in RESOURCE_SCREENS {
            if resource_screen(&bytes, &entries, name).is_ok() {
                list.push(Background { customized: customized.iter().any(|item| item == name), name: name.into() });
            }
        }
    }
    Ok(list)
}

fn bgra_to_image(raw: &[u8], width: u32, height: u32) -> RgbImage {
    let pixels = raw.chunks_exact(4).flat_map(|p| [p[2], p[1], p[0]]).collect();
    RgbImage::from_raw(width, height, pixels).expect("tamaño de la imagen")
}

/// RGB565 en little-endian (rojo en los bits altos), como `resource.cpd`.
fn rgb565_to_image(raw: &[u8]) -> RgbImage {
    let pixels = raw
        .chunks_exact(2)
        .flat_map(|p| {
            let v = u16::from_le_bytes([p[0], p[1]]);
            let (r, g, b) = ((v >> 11) & 31, (v >> 5) & 63, v & 31);
            [(r * 255 / 31) as u8, (g * 255 / 63) as u8, (b * 255 / 31) as u8]
        })
        .collect();
    RgbImage::from_raw(SCREEN_WIDTH, SCREEN_HEIGHT, pixels).expect("tamaño de pantalla")
}

/// Ajusta la imagen a 640×480 (recortando para llenar) y la pasa a RGB565.
pub fn image_to_rgb565(image: &DynamicImage) -> Vec<u8> {
    fit_bgra(image, SCREEN_WIDTH, SCREEN_HEIGHT, false, 255)
        .chunks_exact(4)
        .flat_map(|p| {
            let (b, g, r) = (p[0] as u16, p[1] as u16, p[2] as u16);
            (((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)).to_le_bytes()
        })
        .collect()
}

/// Los seis recortes de la tira, uno al lado del otro, para la vista previa.
fn tiles_side_by_side(raw: &[u8]) -> RgbImage {
    let strip = bgra_to_image(raw, TILE_WIDTH, TILES_HEIGHT);
    let mut row = RgbImage::new(TILE_WIDTH * TILE_SPOTS.len() as u32, TILE_HEIGHT);
    for i in 0..TILE_SPOTS.len() as u32 {
        let tile = image::imageops::crop_imm(&strip, 0, i * TILE_HEIGHT, TILE_WIDTH, TILE_HEIGHT).to_image();
        image::imageops::replace(&mut row, &tile, (i * TILE_WIDTH) as i64, 0);
    }
    row
}

/// Miniatura JPEG de 320×240 para la vista previa.
pub fn background_preview(root: &Path, name: &str) -> Result<Vec<u8>, String> {
    let full = if is_resource_screen(name) {
        let (bytes, entries) = read_resource(root)?;
        resource_base(name, &resource_screen(&bytes, &entries, name)?)?
    } else {
        let ui = read_ui(root)?;
        let entries = read_entries(&ui)?;
        let entry = find_screen(&entries, name)?;
        if name == KEY_TILES {
            let row = DynamicImage::ImageRgb8(tiles_side_by_side(&ui[entry.data.clone()]));
            let raw = fit_bgra(&row, THUMB_WIDTH, THUMB_HEIGHT, true, 255);
            bgra_to_image(&raw, THUMB_WIDTH, THUMB_HEIGHT)
        } else {
            bgra_to_image(&ui[entry.data.clone()], SCREEN_WIDTH, SCREEN_HEIGHT)
        }
    };
    let thumb = image::imageops::resize(&full, THUMB_WIDTH, THUMB_HEIGHT, FilterType::Triangle);
    let mut jpeg = Vec::new();
    JpegEncoder::new_with_quality(&mut jpeg, 82)
        .encode_image(&thumb)
        .map_err(|e| format!("No se pudo preparar la vista previa: {e}"))?;
    Ok(jpeg)
}

/// Ajusta la imagen a 640×480 recortando lo que sobre del centro, la pone
/// sobre negro si tiene transparencia y la deja en BGRA opaco.
pub fn image_to_bgra(image: &DynamicImage) -> Vec<u8> {
    fit_bgra(image, SCREEN_WIDTH, SCREEN_HEIGHT, false, 255)
}

/// Ajusta la imagen a `width`×`height` y la deja en BGRA sobre negro, filas
/// de arriba abajo. `contain` la encaja entera con bandas negras; si no, la
/// recorta para llenar. `alpha` es el valor fijo del cuarto byte.
pub fn fit_bgra(image: &DynamicImage, width: u32, height: u32, contain: bool, alpha: u8) -> Vec<u8> {
    let fitted: RgbaImage = if contain {
        let inner = image.resize(width, height, FilterType::Lanczos3).to_rgba8();
        let mut canvas = RgbaImage::from_pixel(width, height, image::Rgba([0, 0, 0, 255]));
        let x = (width - inner.width()) / 2;
        let y = (height - inner.height()) / 2;
        image::imageops::overlay(&mut canvas, &inner, x as i64, y as i64);
        canvas
    } else {
        image.resize_to_fill(width, height, FilterType::Lanczos3).to_rgba8()
    };
    fitted
        .pixels()
        .flat_map(|p| {
            let [r, g, b, a] = p.0;
            let over_black = |c: u8| ((c as u16 * a as u16 + 127) / 255) as u8;
            [over_black(b), over_black(g), over_black(r), alpha]
        })
        .collect()
}

/// Reescribe `UI_Res.cpd` cambiando solo las entradas de `changes`.
fn rewrite_ui(root: &Path, ui: &[u8], entries: &[Entry], changes: &[(&str, Vec<u8>)]) -> Result<(), String> {
    let parts: Vec<(&Entry, &[u8])> = entries
        .iter()
        .map(|entry| {
            let data = changes
                .iter()
                .find(|(name, _)| *name == entry.name)
                .map_or(&ui[entry.data.clone()], |(_, data)| data.as_slice());
            (entry, data)
        })
        .collect();
    let rebuilt = write_entries(&parts);
    // Comprobación de seguridad antes de tocar la tarjeta.
    let check = read_entries(&rebuilt)?;
    if check.len() != entries.len() {
        return Err("No se pudo reconstruir UI_Res.cpd".into());
    }
    write_atomic(&ui_path(root), &rebuilt)
}

/// Guarda una copia del archivo original de la tarjeta antes del primer cambio.
fn keep_original(folder: &Path, originals: &mut Originals, file: &str, bytes: &[u8]) -> Result<(), String> {
    if !originals.files.contains_key(file) {
        fs::create_dir_all(folder).map_err(|e| format!("No se pudo crear la carpeta de originales: {e}"))?;
        fs::write(folder.join(file), bytes).map_err(|e| format!("No se pudo guardar el original de {file}: {e}"))?;
        originals.files.insert(file.to_string(), true);
    }
    Ok(())
}

fn mark_customized(originals: &mut Originals, name: &str) {
    if !originals.backgrounds.iter().any(|item| item == name) {
        originals.backgrounds.push(name.to_string());
    }
}

/// Rehace la tira de teclas resaltadas sobre un `KeyMapping` nuevo.
///
/// De cada recorte original se conserva solo el botón resaltado, que es lo
/// único naranja (rojo claramente mayor que azul; el fondo es gris o azulado);
/// el resto se toma del fondo nuevo. La mezcla es gradual para que el borde
/// del botón no quede dentado.
fn rebuild_key_tiles(original_ui: &[u8], new_mapping: &[u8]) -> Result<Option<Vec<u8>>, String> {
    let entries = read_entries(original_ui)?;
    let Some(tiles) = entries.iter().find(|entry| entry.name == KEY_TILES && entry.data.len() == TILES_BYTES) else {
        return Ok(None);
    };
    let old_tiles = &original_ui[tiles.data.clone()];
    let mut out = vec![0u8; TILES_BYTES];
    for (i, &(sx, sy)) in TILE_SPOTS.iter().enumerate() {
        for y in 0..TILE_HEIGHT {
            for x in 0..TILE_WIDTH {
                let tile = ((i as u32 * TILE_HEIGHT + y) * TILE_WIDTH + x) as usize * 4;
                let screen = ((sy + y) * SCREEN_WIDTH + sx + x) as usize * 4;
                // BGRA: rojo en [2], azul en [0].
                let orange = (old_tiles[tile + 2] as u32).saturating_sub(old_tiles[tile] as u32);
                // 0 = fondo; 255 = botón resaltado.
                let weight = orange.saturating_sub(16).min(48) * 255 / 48;
                for c in 0..3 {
                    let highlight = old_tiles[tile + c] as u32;
                    let background = new_mapping[screen + c] as u32;
                    out[tile + c] = ((highlight * weight + background * (255 - weight) + 127) / 255) as u8;
                }
                out[tile + 3] = 255;
            }
        }
    }
    Ok(Some(out))
}

pub fn replace_background(root: &Path, work_dir: &str, name: &str, source: &Path) -> Result<(), String> {
    let image = image::open(source).map_err(|_| "No se pudo leer esa imagen; usa PNG, JPG o WebP".to_string())?;
    if is_resource_screen(name) {
        return replace_resource(root, work_dir, name, &image);
    }
    let data = if name == KEY_TILES {
        fit_bgra(&image, TILE_WIDTH, TILES_HEIGHT, false, 255)
    } else {
        image_to_bgra(&image)
    };
    let ui = read_ui(root)?;
    let entries = read_entries(&ui)?;
    find_screen(&entries, name)?;

    let (folder, card_id) = originals_folder(root, work_dir)?;
    let mut originals = read_originals(&folder, &card_id);
    keep_original(&folder, &mut originals, UI_FILE, &ui)?;

    let mut changes: Vec<(&str, Vec<u8>)> = Vec::new();
    if name == KEY_MAPPING && find_screen(&entries, KEY_TILES).is_ok() {
        let original = fs::read(folder.join(UI_FILE)).map_err(|e| format!("No se encontró el UI_Res.cpd original: {e}"))?;
        if let Some(tiles) = rebuild_key_tiles(&original, &data)? {
            changes.push((KEY_TILES, tiles));
        }
    }
    changes.insert(0, (name, data));
    rewrite_ui(root, &ui, &entries, &changes)?;
    for (changed, _) in &changes {
        mark_customized(&mut originals, changed);
    }
    write_originals(&folder, &originals)
}

pub fn restore_background(root: &Path, work_dir: &str, name: &str) -> Result<(), String> {
    let (folder, card_id) = originals_folder(root, work_dir)?;
    let mut originals = read_originals(&folder, &card_id);
    if !originals.backgrounds.iter().any(|item| item == name) {
        return Err(format!("{name} ya es el original"));
    }
    if is_resource_screen(name) {
        return restore_resource(root, &folder, &mut originals, name);
    }
    let original = fs::read(folder.join(UI_FILE)).map_err(|e| format!("No se encontró el UI_Res.cpd original: {e}"))?;
    let original_entries = read_entries(&original)?;
    let mut names = vec![name];
    // Las teclas resaltadas se rehicieron con el KeyMapping: vuelven con él.
    if name == KEY_MAPPING && originals.backgrounds.iter().any(|item| item == KEY_TILES) {
        names.push(KEY_TILES);
    }
    let ui = read_ui(root)?;
    let entries = read_entries(&ui)?;
    let mut changes = Vec::new();
    for item in &names {
        find_screen(&entries, item)?;
        changes.push((*item, original[find_screen(&original_entries, item)?.data.clone()].to_vec()));
    }
    rewrite_ui(root, &ui, &entries, &changes)?;
    originals.backgrounds.retain(|item| !names.contains(&item.as_str()));
    write_originals(&folder, &originals)
}

fn replace_resource(root: &Path, work_dir: &str, name: &str, image: &DynamicImage) -> Result<(), String> {
    let (bytes, entries) = read_resource(root)?;
    resource_screen(&bytes, &entries, name)?;
    let (folder, card_id) = originals_folder(root, work_dir)?;
    let mut originals = read_originals(&folder, &card_id);
    keep_original(&folder, &mut originals, RESOURCE_FILE, &bytes)?;
    // Las piezas se rehacen desde el original: así cambiar el fondo dos veces
    // no arrastra restos del fondo anterior.
    let original = fs::read(folder.join(RESOURCE_FILE)).map_err(|e| format!("No se encontró el resource.cpd original: {e}"))?;
    let original_entries = deflated_zip::read_entries(&original, RESOURCE_FILE)?;
    let data = resource_data(name, &resource_screen(&original, &original_entries, name)?, image)?;
    let rebuilt = deflated_zip::replace(&bytes, &entries, name, &data)?;
    write_atomic(&resource_path(root), &rebuilt)?;
    mark_customized(&mut originals, name);
    write_originals(&folder, &originals)
}

fn restore_resource(root: &Path, folder: &Path, originals: &mut Originals, name: &str) -> Result<(), String> {
    let original = fs::read(folder.join(RESOURCE_FILE))
        .map_err(|e| format!("No se encontró el resource.cpd original: {e}"))?;
    let original_entries = deflated_zip::read_entries(&original, RESOURCE_FILE)?;
    let data = resource_screen(&original, &original_entries, name)?;
    let (bytes, entries) = read_resource(root)?;
    resource_screen(&bytes, &entries, name)?;
    let rebuilt = deflated_zip::replace(&bytes, &entries, name, &data)?;
    write_atomic(&resource_path(root), &rebuilt)?;
    originals.backgrounds.retain(|item| item != name);
    write_originals(folder, originals)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    struct TempDir(PathBuf);

    impl TempDir {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "bunko-bg-{}-{label}-{}",
                std::process::id(),
                COUNTER.fetch_add(1, Ordering::Relaxed)
            ));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).unwrap();
            TempDir(fs::canonicalize(path).unwrap())
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn entry(name: &str, len: usize) -> Entry {
        Entry { name: name.into(), time: 0x0c32, date: 0x5d61, attrs: 0x20, data: 0..len }
    }

    /// `.cpd` de prueba: dos fondos de pantalla completa y un icono pequeño.
    fn sample_ui() -> Vec<u8> {
        let gba = vec![1u8; SCREEN_BYTES];
        let fc = vec![2u8; SCREEN_BYTES];
        let icon = vec![3u8; 64];
        let (a, b, c) = (entry("GBA.raw", SCREEN_BYTES), entry("FC.raw", SCREEN_BYTES), entry("Icon.raw", 64));
        write_entries(&[(&a, &gba), (&b, &fc), (&c, &icon)])
    }

    fn card(label: &str) -> (TempDir, TempDir, PathBuf) {
        let sd = TempDir::new(&format!("{label}-sd"));
        fs::create_dir_all(sd.0.join("cubegm")).unwrap();
        fs::write(sd.0.join("cubegm/UI_Res.cpd"), sample_ui()).unwrap();
        let pc = TempDir::new(&format!("{label}-pc"));
        let picture = pc.0.join("fondo.png");
        RgbaImage::from_pixel(800, 600, image::Rgba([255, 0, 0, 255])).save(&picture).unwrap();
        (sd, pc, picture)
    }

    #[test]
    fn escribe_el_mismo_formato_que_el_firmware() {
        let ui = sample_ui();
        // Cabecera local: versión 1.0, sin banderas, sin compresión, sin extra.
        assert_eq!(&ui[..10], b"PK\x03\x04\x0a\x00\x00\x00\x00\x00");
        assert_eq!(u16_at(&ui, 28), 0);
        let entries = read_entries(&ui).unwrap();
        assert_eq!(entries.iter().map(|e| e.name.as_str()).collect::<Vec<_>>(), ["GBA.raw", "FC.raw", "Icon.raw"]);
        assert!(ui[entries[1].data.clone()].iter().all(|&b| b == 2));
        assert_eq!((entries[0].time, entries[0].date), (0x0c32, 0x5d61));
    }

    #[test]
    fn convierte_la_imagen_a_640x480_bgra_opaco() {
        let red = DynamicImage::ImageRgba8(RgbaImage::from_pixel(100, 50, image::Rgba([255, 0, 0, 128])));
        let raw = image_to_bgra(&red);
        assert_eq!(raw.len(), SCREEN_BYTES);
        assert_eq!(&raw[..4], &[0, 0, 128, 255]);
    }

    #[test]
    fn lista_solo_los_fondos_de_pantalla_completa() {
        let (sd, pc, _) = card("list");
        let names: Vec<String> = list_backgrounds(&sd.0, &pc.0.to_string_lossy())
            .unwrap()
            .into_iter()
            .map(|b| b.name)
            .collect();
        assert_eq!(names, ["GBA.raw", "FC.raw"]);
        assert!(!background_preview(&sd.0, "GBA.raw").unwrap().is_empty());
        assert!(background_preview(&sd.0, "Icon.raw").is_err());
    }

    #[test]
    fn cambia_un_fondo_y_lo_restaura_sin_tocar_los_demas() {
        let (sd, pc, picture) = card("swap");
        let work = pc.0.to_string_lossy().to_string();
        let before = sample_ui();

        replace_background(&sd.0, &work, "GBA.raw", &picture).unwrap();
        let ui = fs::read(sd.0.join("cubegm/UI_Res.cpd")).unwrap();
        let entries = read_entries(&ui).unwrap();
        assert_eq!(&ui[entries[0].data.start..entries[0].data.start + 4], &[0, 0, 255, 255]);
        assert!(ui[entries[1].data.clone()].iter().all(|&b| b == 2));
        assert!(ui[entries[2].data.clone()].iter().all(|&b| b == 3));
        assert!(list_backgrounds(&sd.0, &work).unwrap()[0].customized);

        // Un segundo cambio no pisa el original guardado.
        replace_background(&sd.0, &work, "FC.raw", &picture).unwrap();
        restore_background(&sd.0, &work, "GBA.raw").unwrap();
        restore_background(&sd.0, &work, "FC.raw").unwrap();
        assert_eq!(fs::read(sd.0.join("cubegm/UI_Res.cpd")).unwrap(), before);
        assert!(restore_background(&sd.0, &work, "FC.raw").is_err());
    }

    #[test]
    fn cambia_y_restaura_la_pantalla_de_carga_de_resource_cpd() {
        let (sd, pc, picture) = card("loading");
        let work = pc.0.to_string_lossy().to_string();
        let resource = deflated_zip::tests::sample(&[
            ("game.raw", &[5u8; 1000]),
            (LOADING, &vec![0x42u8; LOADING_BYTES]),
            ("ui.cfg", b"[Setting]"),
        ]);
        fs::write(sd.0.join("cubegm/resource.cpd"), &resource).unwrap();

        let list = list_backgrounds(&sd.0, &work).unwrap();
        assert_eq!(list.last().unwrap().name, LOADING);
        assert!(!background_preview(&sd.0, LOADING).unwrap().is_empty());

        replace_background(&sd.0, &work, LOADING, &picture).unwrap();
        let bytes = fs::read(sd.0.join("cubegm/resource.cpd")).unwrap();
        let entries = deflated_zip::read_entries(&bytes, "resource.cpd").unwrap();
        let data = deflated_zip::read_data(&bytes, &entries[1]).unwrap();
        assert_eq!(&data[..2], &0xF800u16.to_le_bytes(), "rojo puro en RGB565");
        assert_eq!(deflated_zip::read_data(&bytes, &entries[0]).unwrap(), vec![5u8; 1000]);
        assert!(list_backgrounds(&sd.0, &work).unwrap().last().unwrap().customized);
        // UI_Res.cpd no se toca.
        assert_eq!(fs::read(sd.0.join("cubegm/UI_Res.cpd")).unwrap(), sample_ui());

        restore_background(&sd.0, &work, LOADING).unwrap();
        assert_eq!(fs::read(sd.0.join("cubegm/resource.cpd")).unwrap(), resource);
    }

    #[test]
    fn cambia_el_fondo_de_la_lista_y_del_buscador_rehaciendo_sus_piezas() {
        let (sd, pc, picture) = card("sheets");
        let work = pc.0.to_string_lossy().to_string();
        let sheet = sheets::tests::sample();
        let resource = deflated_zip::tests::sample(&[(GAME_LIST, &sheet), (SEARCH, &sheet), ("ui.cfg", b"x")]);
        fs::write(sd.0.join("cubegm/resource.cpd"), &resource).unwrap();
        let names: Vec<String> = list_backgrounds(&sd.0, &work).unwrap().into_iter().map(|b| b.name).collect();
        assert!(names.ends_with(&[GAME_LIST.to_string(), SEARCH.to_string()]));

        for name in [GAME_LIST, SEARCH] {
            replace_background(&sd.0, &work, name, &picture).unwrap();
            assert!(!background_preview(&sd.0, name).unwrap().is_empty());
        }
        let bytes = fs::read(sd.0.join("cubegm/resource.cpd")).unwrap();
        let entries = deflated_zip::read_entries(&bytes, "resource.cpd").unwrap();
        let menu = resource_screen(&bytes, &entries, GAME_LIST).unwrap();
        // Fondo rojo y la pieza opaca blanca intacta.
        let pieces = sheets::parse(&menu, GAME_LIST).unwrap();
        let base = sheets::base_rgb(&menu, &pieces);
        assert_eq!(&base[..3], &[255, 0, 0]);
        assert_eq!(menu.len(), sheet.len());

        restore_background(&sd.0, &work, GAME_LIST).unwrap();
        restore_background(&sd.0, &work, SEARCH).unwrap();
        assert_eq!(fs::read(sd.0.join("cubegm/resource.cpd")).unwrap(), resource);
    }

    #[test]
    fn sin_resource_cpd_no_ofrece_pantalla_de_carga() {
        let (sd, pc, _) = card("noloading");
        let list = list_backgrounds(&sd.0, &pc.0.to_string_lossy()).unwrap();
        assert!(list.iter().all(|b| b.name != LOADING));
    }

    /// `KeyMapping` gris y una tira con un píxel naranja (el botón) por recorte.
    fn ui_with_keys() -> Vec<u8> {
        let mapping = vec![0x8Cu8; SCREEN_BYTES];
        let mut tiles = vec![0x8Cu8; TILES_BYTES];
        for i in 0..TILE_SPOTS.len() {
            let pos = (i * TILE_HEIGHT as usize * TILE_WIDTH as usize + 10) * 4;
            tiles[pos..pos + 4].copy_from_slice(&[0x10, 0x70, 0xE0, 0xFF]);
        }
        let (a, b) = (entry(KEY_MAPPING, SCREEN_BYTES), entry(KEY_TILES, TILES_BYTES));
        write_entries(&[(&a, &mapping), (&b, &tiles)])
    }

    #[test]
    fn al_cambiar_el_mapa_de_teclas_rehace_las_teclas_resaltadas() {
        let (sd, pc, picture) = card("keys");
        let work = pc.0.to_string_lossy().to_string();
        let before = ui_with_keys();
        fs::write(sd.0.join("cubegm/UI_Res.cpd"), &before).unwrap();
        let names: Vec<String> = list_backgrounds(&sd.0, &work).unwrap().into_iter().map(|b| b.name).collect();
        assert_eq!(names, [KEY_MAPPING, KEY_TILES]);
        assert!(!background_preview(&sd.0, KEY_TILES).unwrap().is_empty());

        replace_background(&sd.0, &work, KEY_MAPPING, &picture).unwrap();
        let ui = fs::read(sd.0.join("cubegm/UI_Res.cpd")).unwrap();
        let entries = read_entries(&ui).unwrap();
        let tiles = &ui[entries[1].data.clone()];
        // El botón conserva su color y el resto toma el fondo nuevo (rojo).
        assert_eq!(&tiles[40..44], &[0x10, 0x70, 0xE0, 0xFF]);
        assert_eq!(&tiles[..4], &[0, 0, 255, 255]);
        let list = list_backgrounds(&sd.0, &work).unwrap();
        assert!(list.iter().all(|b| b.customized));

        // Restaurar el mapa de teclas devuelve también las teclas resaltadas.
        restore_background(&sd.0, &work, KEY_MAPPING).unwrap();
        assert_eq!(fs::read(sd.0.join("cubegm/UI_Res.cpd")).unwrap(), before);
    }

    #[test]
    fn las_teclas_resaltadas_tambien_se_pueden_subir_a_mano() {
        let (sd, pc, picture) = card("keys-manual");
        let work = pc.0.to_string_lossy().to_string();
        fs::write(sd.0.join("cubegm/UI_Res.cpd"), ui_with_keys()).unwrap();
        replace_background(&sd.0, &work, KEY_TILES, &picture).unwrap();
        let ui = fs::read(sd.0.join("cubegm/UI_Res.cpd")).unwrap();
        let entries = read_entries(&ui).unwrap();
        assert_eq!(entries[1].data.len(), TILES_BYTES);
        assert!(ui[entries[0].data.clone()].iter().all(|&b| b == 0x8C), "el mapa de teclas no cambia");
    }

    #[test]
    fn rechaza_entradas_pequenas_e_imagenes_invalidas() {
        let (sd, pc, _) = card("bad");
        let work = pc.0.to_string_lossy().to_string();
        let not_image = pc.0.join("nota.txt");
        fs::write(&not_image, "hola").unwrap();
        assert!(replace_background(&sd.0, &work, "GBA.raw", &not_image).is_err());
        let (_, _, picture) = card("bad2");
        assert!(replace_background(&sd.0, &work, "Icon.raw", &picture).is_err());
    }
}

/// Prueba manual con archivos reales: `BUNKO_REAL_SD=<carpeta con cubegm/>`
/// (una copia, nunca la tarjeta) y `cargo test --offline real_card -- --ignored`.
#[cfg(test)]
mod real_card {
    use super::*;

    #[test]
    #[ignore]
    fn real_card() {
        let sd = std::path::PathBuf::from(std::env::var("BUNKO_REAL_SD").unwrap());
        let work = std::env::var("BUNKO_REAL_WORK").unwrap();
        let loading = std::env::var("BUNKO_REAL_LOADING").unwrap();
        let mapping = std::env::var("BUNKO_REAL_MAPPING").unwrap();
        replace_background(&sd, &work, LOADING, Path::new(&loading)).unwrap();
        replace_background(&sd, &work, KEY_MAPPING, Path::new(&mapping)).unwrap();
        if let Ok(list_image) = std::env::var("BUNKO_REAL_LIST") {
            replace_background(&sd, &work, GAME_LIST, Path::new(&list_image)).unwrap();
            replace_background(&sd, &work, SEARCH, Path::new(&list_image)).unwrap();
        }
        let list = list_backgrounds(&sd, &work).unwrap();
        for b in list.iter().filter(|b| b.customized) {
            println!("personalizado: {}", b.name);
        }
    }
}
