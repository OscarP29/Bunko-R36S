//! Fondos del menú de la consola (perfil R36SX / firmware CubeGM).
//!
//! `cubegm/UI_Res.cpd` es un ZIP sin compresión con imágenes `.raw` sin
//! cabecera. Las de pantalla completa miden 640×480 en BGRA (1 228 800 bytes):
//! el fondo de cada sistema y de cada pantalla de ajustes. Bunko lo reescribe
//! con la misma estructura que el original (entradas guardadas, sin campos
//! extra) y guarda antes una copia completa para poder restaurar cada fondo.

use crate::look::{originals_folder, read_originals, write_originals, CUBEGM_DIR};
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

fn find_screen<'a>(entries: &'a [Entry], name: &str) -> Result<&'a Entry, String> {
    entries
        .iter()
        .find(|entry| entry.name == name && is_screen(entry))
        .ok_or_else(|| format!("La consola no tiene el fondo {name}"))
}

pub fn list_backgrounds(root: &Path, work_dir: &str) -> Result<Vec<Background>, String> {
    let customized = match originals_folder(root, work_dir) {
        Ok((folder, card_id)) => read_originals(&folder, &card_id).backgrounds,
        Err(_) => Vec::new(),
    };
    Ok(read_entries(&read_ui(root)?)?
        .iter()
        .filter(|entry| is_screen(entry))
        .map(|entry| Background { customized: customized.contains(&entry.name), name: entry.name.clone() })
        .collect())
}

fn bgra_to_image(raw: &[u8]) -> RgbImage {
    let pixels = raw.chunks_exact(4).flat_map(|p| [p[2], p[1], p[0]]).collect();
    RgbImage::from_raw(SCREEN_WIDTH, SCREEN_HEIGHT, pixels).expect("tamaño de pantalla")
}

/// Miniatura JPEG de 320×240 para la vista previa.
pub fn background_preview(root: &Path, name: &str) -> Result<Vec<u8>, String> {
    let ui = read_ui(root)?;
    let entries = read_entries(&ui)?;
    let entry = find_screen(&entries, name)?;
    let thumb = image::imageops::resize(
        &bgra_to_image(&ui[entry.data.clone()]),
        THUMB_WIDTH,
        THUMB_HEIGHT,
        FilterType::Triangle,
    );
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

/// Reescribe `UI_Res.cpd` cambiando solo la entrada `name`.
fn rewrite_ui(root: &Path, ui: &[u8], entries: &[Entry], name: &str, data: &[u8]) -> Result<(), String> {
    let parts: Vec<(&Entry, &[u8])> = entries
        .iter()
        .map(|entry| (entry, if entry.name == name { data } else { &ui[entry.data.clone()] }))
        .collect();
    let rebuilt = write_entries(&parts);
    // Comprobación de seguridad antes de tocar la tarjeta.
    let check = read_entries(&rebuilt)?;
    if check.len() != entries.len() {
        return Err("No se pudo reconstruir UI_Res.cpd".into());
    }
    write_atomic(&ui_path(root), &rebuilt)
}

pub fn replace_background(root: &Path, work_dir: &str, name: &str, source: &Path) -> Result<(), String> {
    let image = image::open(source).map_err(|_| "No se pudo leer esa imagen; usa PNG, JPG o WebP".to_string())?;
    let data = image_to_bgra(&image);
    let ui = read_ui(root)?;
    let entries = read_entries(&ui)?;
    find_screen(&entries, name)?;

    let (folder, card_id) = originals_folder(root, work_dir)?;
    let mut originals = read_originals(&folder, &card_id);
    if !originals.files.contains_key(UI_FILE) {
        fs::create_dir_all(&folder).map_err(|e| format!("No se pudo crear la carpeta de originales: {e}"))?;
        fs::write(folder.join(UI_FILE), &ui).map_err(|e| format!("No se pudo guardar el original de UI_Res.cpd: {e}"))?;
        originals.files.insert(UI_FILE.to_string(), true);
    }
    rewrite_ui(root, &ui, &entries, name, &data)?;
    if !originals.backgrounds.iter().any(|item| item == name) {
        originals.backgrounds.push(name.to_string());
    }
    write_originals(&folder, &originals)
}

pub fn restore_background(root: &Path, work_dir: &str, name: &str) -> Result<(), String> {
    let (folder, card_id) = originals_folder(root, work_dir)?;
    let mut originals = read_originals(&folder, &card_id);
    if !originals.backgrounds.iter().any(|item| item == name) {
        return Err(format!("{name} ya es el original"));
    }
    let original = fs::read(folder.join(UI_FILE)).map_err(|e| format!("No se encontró el UI_Res.cpd original: {e}"))?;
    let original_entries = read_entries(&original)?;
    let data = original[find_screen(&original_entries, name)?.data.clone()].to_vec();
    let ui = read_ui(root)?;
    let entries = read_entries(&ui)?;
    find_screen(&entries, name)?;
    rewrite_ui(root, &ui, &entries, name, &data)?;
    originals.backgrounds.retain(|item| item != name);
    write_originals(&folder, &originals)
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
