//! Menú de pausa dentro del juego (Volver, Renunciar, Cargar, Salvar, Trucos).
//!
//! Está en cada paquete de idioma `cubegm/ui_xx.cpd`: un ZIP camuflado (ver
//! [`deflated_zip::unmask`]) con dos hojas de piezas, `game.raw` (sin trucos)
//! y `game_1.raw` (con trucos), con los textos dibujados en ese idioma.
//! `resource.cpd` guarda además una copia de respaldo de `game.raw`.
//!
//! Cambiar el fondo rehace las dos hojas de todos los idiomas a la vez, para
//! que el menú se vea igual elija el idioma que elija la consola. Los textos
//! del menú, el marco de la vista previa y la barra inferior están pintados en
//! el fondo y se conservan encima de la imagen nueva.

use crate::backgrounds::{fit_rgb, keep_original, mark_customized, resource_path, RESOURCE_FILE};
use crate::look::{write_originals, Originals, CUBEGM_DIR};
use crate::sheets::{self, Keep};
use crate::{deflated_zip, write_atomic};
use image::{DynamicImage, RgbImage};
use std::{fs, path::Path};

/// Nombre con el que Bunko lista el menú de pausa (no es un archivo real).
pub const PAUSE: &str = "pause.raw";
const SHEETS: [&str; 2] = ["game.raw", "game_1.raw"];

/// Zonas pintadas en el fondo del menú que hay que conservar.
const KEEP: [Keep; 6] = [
    // Textos de las opciones: solo lo muy claro (el bosque no pasa de 106).
    Keep { x0: 30, y0: 50, x1: 276, y1: 340, from: 120 },
    // Barra inferior con los botones.
    Keep { x0: 0, y0: 443, x1: 640, y1: 480, from: 0 },
    // Marco de la vista previa de la partida.
    Keep { x0: 279, y0: 68, x1: 606, y1: 74, from: 0 },
    Keep { x0: 279, y0: 309, x1: 606, y1: 316, from: 0 },
    Keep { x0: 278, y0: 68, x1: 285, y1: 316, from: 0 },
    Keep { x0: 599, y0: 68, x1: 606, y1: 316, from: 0 },
];

/// Paquetes de idioma de la tarjeta (`ui_es.cpd`…), ordenados.
fn language_packs(root: &Path) -> Vec<String> {
    let mut packs: Vec<String> = fs::read_dir(root.join(CUBEGM_DIR))
        .map(|dir| {
            dir.filter_map(|entry| entry.ok()?.file_name().into_string().ok())
                .filter(|name| {
                    let lower = name.to_ascii_lowercase();
                    lower.starts_with("ui_") && lower.ends_with(".cpd") && lower != "ui_res.cpd"
                })
                .collect()
        })
        .unwrap_or_default();
    packs.sort();
    packs
}

/// ZIP normal de un paquete de idioma y sus entradas, si tiene el menú.
fn open_pack(bytes: &[u8], label: &str) -> Result<(Vec<u8>, Vec<deflated_zip::ZipEntry>), String> {
    let plain = deflated_zip::unmask(bytes).ok_or_else(|| format!("{label} tiene un formato que Bunko no sabe editar"))?;
    let entries = deflated_zip::read_entries(&plain, label)?;
    sheet(&plain, &entries, SHEETS[0])?.ok_or_else(|| format!("{label} no tiene menú de pausa"))?;
    Ok((plain, entries))
}

/// Datos de una hoja, comprobando su formato; `None` si el archivo no la tiene.
fn sheet(bytes: &[u8], entries: &[deflated_zip::ZipEntry], name: &str) -> Result<Option<Vec<u8>>, String> {
    let Some(entry) = entries.iter().find(|entry| entry.name == name) else { return Ok(None) };
    let data = deflated_zip::read_data(bytes, entry)?;
    sheets::parse(&data, name)?;
    Ok(Some(data))
}

/// Cambia las hojas de `current` por las de `original` rehechas sobre `rgb`.
fn rebuild_zip(current: &[u8], original: &[u8], rgb: &[u8], names: &[&str]) -> Result<Vec<u8>, String> {
    let original_entries = deflated_zip::read_entries(original, "menú de pausa")?;
    let mut out = current.to_vec();
    for name in names {
        let Some(data) = sheet(original, &original_entries, name)? else { continue };
        let pieces = sheets::parse(&data, name)?;
        let rebuilt = sheets::rebuild(&data, &pieces, rgb, &KEEP);
        let entries = deflated_zip::read_entries(&out, name)?;
        out = deflated_zip::replace(&out, &entries, name, &rebuilt)?;
    }
    Ok(out)
}

/// Hay menú de pausa que cambiar en esta tarjeta.
pub fn available(root: &Path) -> bool {
    language_packs(root)
        .iter()
        .any(|pack| fs::read(root.join(CUBEGM_DIR).join(pack)).is_ok_and(|bytes| open_pack(&bytes, pack).is_ok()))
}

/// Fondo actual del menú, del español si existe (es el idioma de Bunko).
pub fn preview(root: &Path) -> Result<RgbImage, String> {
    let packs = language_packs(root);
    let pick = packs
        .iter()
        .find(|pack| pack.eq_ignore_ascii_case("ui_es.cpd"))
        .or_else(|| packs.first())
        .ok_or("Esta consola no tiene menú de pausa")?;
    let bytes = fs::read(root.join(CUBEGM_DIR).join(pick)).map_err(|e| e.to_string())?;
    let (plain, entries) = open_pack(&bytes, pick)?;
    let data = sheet(&plain, &entries, SHEETS[0])?.ok_or("Esta consola no tiene menú de pausa")?;
    let pieces = sheets::parse(&data, SHEETS[0])?;
    Ok(RgbImage::from_raw(640, 480, sheets::base_rgb(&data, &pieces)).expect("tamaño de pantalla"))
}

pub fn replace(root: &Path, folder: &Path, originals: &mut Originals, image: &DynamicImage) -> Result<(), String> {
    let rgb = fit_rgb(image);
    let cubegm = root.join(CUBEGM_DIR);
    // Primero se preparan todos los archivos; solo si todo sale bien se escriben.
    let mut writes = Vec::new();
    for pack in language_packs(root) {
        let bytes = fs::read(cubegm.join(&pack)).map_err(|e| format!("No se pudo leer {pack}: {e}"))?;
        if open_pack(&bytes, &pack).is_err() {
            continue;
        }
        keep_original(folder, originals, &pack, &bytes)?;
        let original = fs::read(folder.join(&pack)).map_err(|e| format!("No se encontró el {pack} original: {e}"))?;
        let (original_plain, _) = open_pack(&original, &pack)?;
        let rebuilt = rebuild_zip(&original_plain, &original_plain, &rgb, &SHEETS)?;
        writes.push((cubegm.join(&pack), deflated_zip::mask(&rebuilt)?));
    }
    if writes.is_empty() {
        return Err("Esta consola no tiene menú de pausa que se pueda cambiar".into());
    }
    // Copia de respaldo en resource.cpd: solo esa entrada, el resto puede
    // estar personalizado.
    if let Ok(bytes) = fs::read(resource_path(root)) {
        let entries = deflated_zip::read_entries(&bytes, RESOURCE_FILE)?;
        if sheet(&bytes, &entries, SHEETS[0])?.is_some() {
            keep_original(folder, originals, RESOURCE_FILE, &bytes)?;
            let original = fs::read(folder.join(RESOURCE_FILE)).map_err(|e| e.to_string())?;
            writes.push((resource_path(root), rebuild_zip(&bytes, &original, &rgb, &SHEETS[..1])?));
        }
    }
    write_originals(folder, originals)?;
    for (path, bytes) in &writes {
        write_atomic(path, bytes)?;
        mark_customized(originals, PAUSE);
    }
    write_originals(folder, originals)
}

pub fn restore(root: &Path, folder: &Path, originals: &mut Originals) -> Result<(), String> {
    for pack in language_packs(root) {
        if let Ok(original) = fs::read(folder.join(&pack)) {
            if originals.files.contains_key(&pack) {
                open_pack(&original, &pack)?;
                write_atomic(&root.join(CUBEGM_DIR).join(&pack), &original)?;
            }
        }
    }
    if let (Ok(original), Ok(current)) = (fs::read(folder.join(RESOURCE_FILE)), fs::read(resource_path(root))) {
        let original_entries = deflated_zip::read_entries(&original, RESOURCE_FILE)?;
        if let Some(data) = sheet(&original, &original_entries, SHEETS[0])? {
            let entries = deflated_zip::read_entries(&current, RESOURCE_FILE)?;
            write_atomic(&resource_path(root), &deflated_zip::replace(&current, &entries, SHEETS[0], &data)?)?;
        }
    }
    originals.backgrounds.retain(|item| item != PAUSE);
    write_originals(folder, originals)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conserva_los_textos_y_la_barra_inferior() {
        // Hoja con fondo oscuro, un texto claro en la columna de opciones y
        // la barra inferior azul.
        let mut data = sheets::tests::sample();
        let pieces = sheets::parse(&data, "x").unwrap();
        // La hoja de prueba tiene 3 piezas: la tabla ocupa 48 bytes.
        let set = |data: &mut Vec<u8>, x: usize, y: usize, v: u16| {
            let at = 48 + (y * 640 + x) * 2;
            data[at..at + 2].copy_from_slice(&v.to_le_bytes());
        };
        set(&mut data, 100, 100, 0xFFFF); // texto blanco
        set(&mut data, 10, 460, 0x2945); // barra
        let red = [200u8, 0, 0].repeat(640 * 480);
        let out = sheets::rebuild(&data, &pieces, &red, &KEEP);
        let base = sheets::base_rgb(&out, &pieces);
        let px = |x: usize, y: usize| base[(y * 640 + x) * 3..(y * 640 + x) * 3 + 3].to_vec();
        assert_eq!(px(100, 100), [255, 255, 255]);
        assert_ne!(px(10, 460)[0], px(60, 60)[0], "la barra se conserva");
        // Fuera de las zonas (y en la columna de textos, lo oscuro) manda el rojo.
        assert!(px(60, 60)[0] > 190 && px(60, 60)[1] == 0);
        assert!(px(400, 200)[0] > 190);
    }
}
