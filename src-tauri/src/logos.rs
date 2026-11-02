//! Logos de arranque y apagado de la consola (perfil R36SX / firmware CubeGM).
//!
//! Son BMP de 32 bits sin compresión (BGRA). El firmware lee las filas en el
//! orden en que están guardadas, de arriba abajo, sin mirar el signo de la
//! altura: `cubepoweroff.bmp` dice que va de abajo arriba pero está guardado al
//! revés. Por eso Bunko conserva la cabecera original tal cual y solo cambia
//! los píxeles, en el mismo orden y con el mismo cuarto byte.

use crate::backgrounds::fit_bgra;
use crate::look::{originals_folder, read_originals, replace_file, restore_file, CUBEGM_DIR};
use image::{codecs::png::PngEncoder, ImageEncoder};
use serde::Serialize;
use std::{fs, path::Path};

/// Logo, archivo y si la imagen se encaja entera (`contain`) o se recorta.
const LOGOS: &[(&str, &str, bool)] = &[
    ("boot", "xgame-logo.bmp", false),
    ("poweroff", "cubepoweroff.bmp", true),
];

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Logo {
    /// `boot` o `poweroff`.
    pub id: String,
    pub file: String,
    pub width: u32,
    pub height: u32,
    pub customized: bool,
}

/// Cabecera de un BMP de 32 bits sin compresión.
struct BmpLayout {
    width: u32,
    height: u32,
    /// Inicio y fin de los píxeles dentro del archivo.
    pixels: std::ops::Range<usize>,
}

fn u32_at(bytes: &[u8], pos: usize) -> u32 {
    u32::from_le_bytes(bytes[pos..pos + 4].try_into().unwrap())
}

fn bmp_layout(bytes: &[u8]) -> Result<BmpLayout, String> {
    let invalid = || "El logo de la consola tiene un formato que Bunko no sabe editar".to_string();
    if bytes.len() < 54 || &bytes[..2] != b"BM" {
        return Err(invalid());
    }
    let offset = u32_at(bytes, 10) as usize;
    let width = i32::from_le_bytes(bytes[18..22].try_into().unwrap()).unsigned_abs();
    let height = i32::from_le_bytes(bytes[22..26].try_into().unwrap()).unsigned_abs();
    let bpp = u16::from_le_bytes([bytes[28], bytes[29]]);
    let compression = u32_at(bytes, 30);
    let end = offset + (width * height * 4) as usize;
    if bpp != 32 || compression != 0 || width == 0 || height == 0 || width > 4096 || height > 4096 || end > bytes.len() {
        return Err(invalid());
    }
    Ok(BmpLayout { width, height, pixels: offset..end })
}

fn logo_entry(id: &str) -> Result<(&'static str, bool), String> {
    LOGOS
        .iter()
        .find(|(logo, _, _)| *logo == id)
        .map(|(_, file, contain)| (*file, *contain))
        .ok_or_else(|| format!("Logo desconocido: {id}"))
}

fn read_logo(root: &Path, file: &str) -> Result<Vec<u8>, String> {
    fs::read(root.join(CUBEGM_DIR).join(file)).map_err(|_| format!("No se encontró cubegm/{file} en la tarjeta"))
}

/// Logos presentes en la tarjeta; los que faltan o no se entienden se omiten.
pub fn list_logos(root: &Path, work_dir: &str) -> Result<Vec<Logo>, String> {
    let customized = match originals_folder(root, work_dir) {
        Ok((folder, card_id)) => read_originals(&folder, &card_id).files,
        Err(_) => Default::default(),
    };
    Ok(LOGOS
        .iter()
        .filter_map(|(id, file, _)| {
            let layout = bmp_layout(&read_logo(root, file).ok()?).ok()?;
            Some(Logo {
                id: id.to_string(),
                file: file.to_string(),
                width: layout.width,
                height: layout.height,
                customized: customized.contains_key(*file),
            })
        })
        .collect())
}

/// El logo como PNG, tal como se ve en la consola.
pub fn logo_preview(root: &Path, id: &str) -> Result<Vec<u8>, String> {
    let (file, _) = logo_entry(id)?;
    let bytes = read_logo(root, file)?;
    let layout = bmp_layout(&bytes)?;
    let rgb: Vec<u8> = bytes[layout.pixels]
        .chunks_exact(4)
        .flat_map(|p| [p[2], p[1], p[0]])
        .collect();
    let mut png = Vec::new();
    PngEncoder::new(&mut png)
        .write_image(&rgb, layout.width, layout.height, image::ExtendedColorType::Rgb8)
        .map_err(|e| format!("No se pudo preparar la vista previa: {e}"))?;
    Ok(png)
}

/// Mismo archivo con otros píxeles: cabecera y bytes finales intactos.
fn with_pixels(original: &[u8], image: &image::DynamicImage, contain: bool) -> Result<Vec<u8>, String> {
    let layout = bmp_layout(original)?;
    let alpha = original[layout.pixels.start + 3];
    let pixels = fit_bgra(image, layout.width, layout.height, contain, alpha);
    let mut out = original.to_vec();
    out[layout.pixels].copy_from_slice(&pixels);
    Ok(out)
}

pub fn replace_logo(root: &Path, work_dir: &str, id: &str, source: &Path) -> Result<(), String> {
    let (file, contain) = logo_entry(id)?;
    let image = image::open(source).map_err(|_| "No se pudo leer esa imagen; usa PNG, JPG o WebP".to_string())?;
    let updated = with_pixels(&read_logo(root, file)?, &image, contain)?;
    replace_file(root, work_dir, file, &updated)
}

pub fn restore_logo(root: &Path, work_dir: &str, id: &str) -> Result<(), String> {
    restore_file(root, work_dir, logo_entry(id)?.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    struct TempDir(PathBuf);

    impl TempDir {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "bunko-logo-{}-{label}-{}",
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

    /// BMP como los del firmware: 32 bits, sin compresión, 2 bytes de relleno.
    fn bmp(width: i32, height: i32, alpha: u8) -> Vec<u8> {
        let pixels = (width * height.abs() * 4) as u32;
        let mut bytes = b"BM".to_vec();
        bytes.extend((54 + pixels + 2).to_le_bytes());
        bytes.extend([0u8; 4]);
        bytes.extend(54u32.to_le_bytes());
        bytes.extend(40u32.to_le_bytes());
        bytes.extend(width.to_le_bytes());
        bytes.extend(height.to_le_bytes());
        bytes.extend(1u16.to_le_bytes());
        bytes.extend(32u16.to_le_bytes());
        bytes.extend([0u8; 24]);
        for _ in 0..pixels / 4 {
            bytes.extend([10, 20, 30, alpha]);
        }
        bytes.extend([0, 0]);
        bytes
    }

    fn card(label: &str) -> (TempDir, TempDir, PathBuf) {
        let sd = TempDir::new(&format!("{label}-sd"));
        fs::create_dir_all(sd.0.join("cubegm")).unwrap();
        fs::write(sd.0.join("cubegm/xgame-logo.bmp"), bmp(64, -48, 255)).unwrap();
        fs::write(sd.0.join("cubegm/cubepoweroff.bmp"), bmp(16, 20, 0)).unwrap();
        let pc = TempDir::new(&format!("{label}-pc"));
        let picture = pc.0.join("logo.png");
        // Mitad superior roja y mitad inferior azul, para comprobar el orden de las filas.
        let image = RgbaImage::from_fn(80, 60, |_, y| if y < 30 { Rgba([255, 0, 0, 255]) } else { Rgba([0, 0, 255, 255]) });
        image.save(&picture).unwrap();
        (sd, pc, picture)
    }

    #[test]
    fn lista_los_logos_con_su_tamano() {
        let (sd, pc, _) = card("list");
        let logos = list_logos(&sd.0, &pc.0.to_string_lossy()).unwrap();
        assert_eq!(
            logos.iter().map(|l| (l.id.as_str(), l.width, l.height)).collect::<Vec<_>>(),
            [("boot", 64, 48), ("poweroff", 16, 20)]
        );
        assert!(logo_preview(&sd.0, "boot").unwrap().starts_with(b"\x89PNG"));
    }

    #[test]
    fn cambia_solo_los_pixeles_de_arriba_abajo() {
        let (sd, pc, picture) = card("swap");
        let work = pc.0.to_string_lossy().to_string();
        let original = fs::read(sd.0.join("cubegm/cubepoweroff.bmp")).unwrap();

        replace_logo(&sd.0, &work, "poweroff", &picture).unwrap();
        let updated = fs::read(sd.0.join("cubegm/cubepoweroff.bmp")).unwrap();
        assert_eq!(updated.len(), original.len());
        assert_eq!(&updated[..54], &original[..54]);
        assert_eq!(&updated[updated.len() - 2..], &[0, 0]);
        // Encajada entera: banda negra arriba, rojo después y azul al final; alfa original (0).
        let row = |y: usize| &updated[54 + y * 16 * 4 + 8 * 4..54 + y * 16 * 4 + 8 * 4 + 4];
        assert_eq!(row(0), &[0, 0, 0, 0]);
        assert_eq!(row(8), &[0, 0, 255, 0]);
        assert_eq!(row(13), &[255, 0, 0, 0]);
        assert!(list_logos(&sd.0, &work).unwrap()[1].customized);

        restore_logo(&sd.0, &work, "poweroff").unwrap();
        assert_eq!(fs::read(sd.0.join("cubegm/cubepoweroff.bmp")).unwrap(), original);
    }

    #[test]
    fn el_arranque_se_recorta_y_queda_opaco() {
        let (sd, pc, picture) = card("boot");
        replace_logo(&sd.0, &pc.0.to_string_lossy(), "boot", &picture).unwrap();
        let updated = fs::read(sd.0.join("cubegm/xgame-logo.bmp")).unwrap();
        assert_eq!(&updated[54..58], &[0, 0, 255, 255]);
        let last = 54 + 64 * 48 * 4 - 4;
        assert_eq!(&updated[last..last + 4], &[255, 0, 0, 255]);
    }

    #[test]
    fn rechaza_bmp_que_no_son_de_32_bits() {
        let mut bytes = bmp(4, 4, 255);
        bytes[28] = 24;
        assert!(bmp_layout(&bytes).is_err());
        assert!(bmp_layout(b"no es un bmp").is_err());
    }
}
