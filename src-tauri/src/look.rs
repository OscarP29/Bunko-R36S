//! Apariencia de la consola (perfil R36SX / firmware CubeGM): sonidos del menú.
//!
//! `cubegm/setting.xml` asigna un archivo a cada efecto y a la música de fondo.
//! Bunko nunca toca ese XML: solo reemplaza los archivos que nombra. Antes del
//! primer cambio guarda el original en `<trabajo>/<consola>/consola-original/`
//! para poder volver atrás.

use crate::saves::{card_folder, read_or_create_card};
use crate::write_atomic;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::Path};

const SETTINGS_FILE: &str = "cubegm/setting.xml";
pub(crate) const CUBEGM_DIR: &str = "cubegm";
const ORIGINALS_DIR: &str = "consola-original";
const ORIGINALS_MANIFEST: &str = "originales.json";
/// Los efectos del menú duran menos de un segundo; esto da margen de sobra.
const MAX_EFFECT_BYTES: usize = 2 * 1024 * 1024;
const MAX_MUSIC_BYTES: usize = 20 * 1024 * 1024;

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SoundSlot {
    /// `bgm` o `effect0`…`effect8`, tal como aparece en `setting.xml`.
    pub slot: String,
    pub file: String,
    pub exists: bool,
    pub bytes: u64,
    /// Bunko lo cambió y guarda el original para restaurarlo.
    pub customized: bool,
}

/// Originales guardados: archivo → si existía antes del primer cambio.
#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Originals {
    card_id: String,
    pub(crate) files: HashMap<String, bool>,
    /// Fondos de `UI_Res.cpd` cambiados; el original completo está en la carpeta.
    #[serde(default)]
    pub(crate) backgrounds: Vec<String>,
}

/// Nombre de archivo simple dentro de `cubegm/`, sin rutas.
fn valid_file_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    !name.is_empty()
        && !name.starts_with('.')
        && !name.contains(['/', '\\', ':'])
        && (lower.ends_with(".wav") || lower.ends_with(".mp3"))
}

/// Ranuras `<bgm file=".."/>` y `<effectN file=".."/>` de la sección `<sound>`.
fn parse_sound_slots(xml: &str) -> Vec<(String, String)> {
    let Some(start) = xml.find("<sound>") else { return Vec::new() };
    let end = xml[start..].find("</sound>").map_or(xml.len(), |i| start + i);
    let mut slots = Vec::new();
    let mut rest = &xml[start + "<sound>".len()..end];
    while let Some(open) = rest.find('<') {
        rest = &rest[open + 1..];
        let tag_end = rest.find('>').unwrap_or(rest.len());
        let tag = &rest[..tag_end];
        let name: String = tag.chars().take_while(|c| c.is_ascii_alphanumeric()).collect();
        let is_slot = name == "bgm"
            || name
                .strip_prefix("effect")
                .is_some_and(|n| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit()));
        if is_slot {
            if let Some(file) = tag
                .split("file=\"")
                .nth(1)
                .and_then(|value| value.split('"').next())
            {
                if valid_file_name(file) {
                    slots.push((name, file.to_string()));
                }
            }
        }
        rest = &rest[tag_end.min(rest.len())..];
    }
    slots
}

fn read_slots(root: &Path) -> Result<Vec<(String, String)>, String> {
    let xml = fs::read(root.join(SETTINGS_FILE))
        .map_err(|_| "No se encontró cubegm/setting.xml en la tarjeta".to_string())?;
    Ok(parse_sound_slots(&String::from_utf8_lossy(&xml)))
}

fn slot_file(root: &Path, slot: &str) -> Result<String, String> {
    read_slots(root)?
        .into_iter()
        .find(|(name, _)| name == slot)
        .map(|(_, file)| file)
        .ok_or_else(|| format!("La consola no tiene el sonido {slot}"))
}

pub(crate) fn read_originals(folder: &Path, card_id: &str) -> Originals {
    fs::read(folder.join(ORIGINALS_MANIFEST))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Originals>(&bytes).ok())
        .filter(|originals| originals.card_id == card_id)
        .unwrap_or_else(|| Originals { card_id: card_id.to_string(), ..Originals::default() })
}

pub(crate) fn write_originals(folder: &Path, originals: &Originals) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(originals).map_err(|e| e.to_string())?;
    write_atomic(&folder.join(ORIGINALS_MANIFEST), &json)
}

/// Carpeta de originales de esta tarjeta y su id.
pub(crate) fn originals_folder(root: &Path, work_dir: &str) -> Result<(std::path::PathBuf, String), String> {
    let card = read_or_create_card(root)?;
    Ok((card_folder(root, work_dir, &card)?.join(ORIGINALS_DIR), card.id))
}

pub fn list_sounds(root: &Path, work_dir: &str) -> Result<Vec<SoundSlot>, String> {
    let customized = match originals_folder(root, work_dir) {
        Ok((folder, card_id)) => read_originals(&folder, &card_id).files,
        Err(_) => HashMap::new(),
    };
    Ok(read_slots(root)?
        .into_iter()
        .map(|(slot, file)| {
            let meta = fs::metadata(root.join(CUBEGM_DIR).join(&file)).ok();
            SoundSlot {
                customized: customized.contains_key(&file),
                exists: meta.is_some(),
                bytes: meta.map_or(0, |m| m.len()),
                slot,
                file,
            }
        })
        .collect())
}

pub fn read_sound(root: &Path, slot: &str) -> Result<Vec<u8>, String> {
    let file = slot_file(root, slot)?;
    fs::read(root.join(CUBEGM_DIR).join(&file)).map_err(|_| format!("{file} no está en la tarjeta"))
}

/// WAV PCM de 16 bits, mono o estéreo, como los originales de la consola.
fn check_wav(bytes: &[u8]) -> Result<(), String> {
    let invalid = || "El efecto tiene que ser un WAV PCM de 16 bits".to_string();
    if bytes.len() < 44 || &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err(invalid());
    }
    let mut pos = 12;
    while pos + 8 <= bytes.len() {
        let size = u32::from_le_bytes(bytes[pos + 4..pos + 8].try_into().unwrap()) as usize;
        if &bytes[pos..pos + 4] == b"fmt " && pos + 24 <= bytes.len() {
            let format = u16::from_le_bytes([bytes[pos + 8], bytes[pos + 9]]);
            let channels = u16::from_le_bytes([bytes[pos + 10], bytes[pos + 11]]);
            let bits = u16::from_le_bytes([bytes[pos + 22], bytes[pos + 23]]);
            return if format == 1 && (1..=2).contains(&channels) && bits == 16 {
                Ok(())
            } else {
                Err(invalid())
            };
        }
        pos += 8 + size + (size & 1);
    }
    Err(invalid())
}

/// MP3 con etiqueta ID3 o que empieza por una cabecera de trama.
fn check_mp3(bytes: &[u8]) -> Result<(), String> {
    let id3 = bytes.starts_with(b"ID3");
    let frame = bytes.len() > 2 && bytes[0] == 0xFF && bytes[1] & 0xE0 == 0xE0;
    if id3 || frame {
        Ok(())
    } else {
        Err("La música tiene que ser un archivo MP3".into())
    }
}

pub fn replace_sound(root: &Path, work_dir: &str, slot: &str, bytes: &[u8]) -> Result<SoundSlot, String> {
    let file = slot_file(root, slot)?;
    if file.to_ascii_lowercase().ends_with(".mp3") {
        if bytes.len() > MAX_MUSIC_BYTES {
            return Err("La música no puede pasar de 20 MB".into());
        }
        check_mp3(bytes)?;
    } else {
        if bytes.len() > MAX_EFFECT_BYTES {
            return Err("El efecto es demasiado largo; usa uno de pocos segundos".into());
        }
        check_wav(bytes)?;
    }
    replace_file(root, work_dir, &file, bytes)?;
    Ok(SoundSlot {
        slot: slot.to_string(),
        bytes: bytes.len() as u64,
        exists: true,
        customized: true,
        file,
    })
}

pub fn restore_sound(root: &Path, work_dir: &str, slot: &str) -> Result<(), String> {
    restore_file(root, work_dir, &slot_file(root, slot)?)
}

/// Escribe `cubegm/<file>`; la primera vez guarda antes el original (o que no existía).
pub(crate) fn replace_file(root: &Path, work_dir: &str, file: &str, bytes: &[u8]) -> Result<(), String> {
    let (folder, card_id) = originals_folder(root, work_dir)?;
    let mut originals = read_originals(&folder, &card_id);
    let target = root.join(CUBEGM_DIR).join(file);
    if !originals.files.contains_key(file) {
        fs::create_dir_all(&folder).map_err(|e| format!("No se pudo crear la carpeta de originales: {e}"))?;
        let existed = target.is_file();
        if existed {
            fs::copy(&target, folder.join(file))
                .map_err(|e| format!("No se pudo guardar el original de {file}: {e}"))?;
        }
        originals.files.insert(file.to_string(), existed);
        write_originals(&folder, &originals)?;
    }
    write_atomic(&target, bytes)
}

/// Devuelve `cubegm/<file>` a como estaba antes del primer cambio de Bunko.
pub(crate) fn restore_file(root: &Path, work_dir: &str, file: &str) -> Result<(), String> {
    let (folder, card_id) = originals_folder(root, work_dir)?;
    let mut originals = read_originals(&folder, &card_id);
    let Some(existed) = originals.files.get(file).copied() else {
        return Err(format!("{file} ya es el original"));
    };
    let target = root.join(CUBEGM_DIR).join(file);
    if existed {
        let original = fs::read(folder.join(file))
            .map_err(|e| format!("No se encontró el original de {file}: {e}"))?;
        write_atomic(&target, &original)?;
    } else if target.exists() {
        fs::remove_file(&target).map_err(|e| format!("No se pudo quitar {file}: {e}"))?;
    }
    originals.files.remove(file);
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
                "bunko-look-{}-{label}-{}",
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

    const XML: &str = r#"<config language="8" /> <sound> <bgm file="bgm.mp3" /> <effect0
file="MoveYesNo.wav" /> <effect1 file="SelectGame.wav" /> <effect9 file="../x.wav" /> </sound>"#;

    fn wav(channels: u16, bits: u16) -> Vec<u8> {
        let mut bytes = b"RIFF\0\0\0\0WAVEfmt \x10\0\0\0".to_vec();
        bytes.extend(1u16.to_le_bytes());
        bytes.extend(channels.to_le_bytes());
        bytes.extend(22050u32.to_le_bytes());
        bytes.extend((22050 * channels as u32 * 2).to_le_bytes());
        bytes.extend((channels * 2).to_le_bytes());
        bytes.extend(bits.to_le_bytes());
        bytes.extend(b"data\x04\0\0\0\x01\0\x02\0");
        bytes
    }

    fn card(label: &str) -> (TempDir, TempDir) {
        let sd = TempDir::new(&format!("{label}-sd"));
        fs::create_dir_all(sd.0.join("cubegm")).unwrap();
        fs::write(sd.0.join(SETTINGS_FILE), XML).unwrap();
        fs::write(sd.0.join("cubegm/MoveYesNo.wav"), wav(2, 16)).unwrap();
        (sd, TempDir::new(&format!("{label}-pc")))
    }

    #[test]
    fn lee_las_ranuras_de_sonido_y_descarta_rutas() {
        let slots = parse_sound_slots(XML);
        assert_eq!(
            slots,
            vec![
                ("bgm".into(), "bgm.mp3".into()),
                ("effect0".into(), "MoveYesNo.wav".into()),
                ("effect1".into(), "SelectGame.wav".into()),
            ]
        );
        assert!(parse_sound_slots("<config />").is_empty());
    }

    #[test]
    fn solo_acepta_wav_pcm_de_16_bits_y_mp3() {
        assert!(check_wav(&wav(2, 16)).is_ok());
        assert!(check_wav(&wav(1, 16)).is_ok());
        assert!(check_wav(&wav(2, 8)).is_err());
        assert!(check_wav(b"ID3 no es un wav").is_err());
        assert!(check_mp3(b"ID3\x04\0\0\0\0").is_ok());
        assert!(check_mp3(&[0xFF, 0xFB, 0x90]).is_ok());
        assert!(check_mp3(&wav(2, 16)).is_err());
    }

    #[test]
    fn reemplaza_guarda_el_original_y_lo_restaura() {
        let (sd, pc) = card("swap");
        let work = pc.0.to_string_lossy().to_string();
        let original = fs::read(sd.0.join("cubegm/MoveYesNo.wav")).unwrap();
        let mut nuevo = wav(1, 16);
        nuevo.extend([9, 9]);

        replace_sound(&sd.0, &work, "effect0", &nuevo).unwrap();
        replace_sound(&sd.0, &work, "effect0", &wav(2, 16)).unwrap();
        let slot = list_sounds(&sd.0, &work).unwrap().into_iter().find(|s| s.slot == "effect0").unwrap();
        assert!(slot.customized);

        restore_sound(&sd.0, &work, "effect0").unwrap();
        // El segundo cambio no pisa el original guardado en el primero.
        assert_eq!(fs::read(sd.0.join("cubegm/MoveYesNo.wav")).unwrap(), original);
        assert!(!list_sounds(&sd.0, &work).unwrap()[1].customized);
        assert!(restore_sound(&sd.0, &work, "effect0").is_err());
    }

    #[test]
    fn la_musica_nueva_se_quita_al_restaurar() {
        let (sd, pc) = card("bgm");
        let work = pc.0.to_string_lossy().to_string();
        assert!(!list_sounds(&sd.0, &work).unwrap()[0].exists);
        assert!(replace_sound(&sd.0, &work, "bgm", &wav(2, 16)).is_err());

        replace_sound(&sd.0, &work, "bgm", b"ID3\x04\0\0\0\0musica").unwrap();
        assert!(sd.0.join("cubegm/bgm.mp3").is_file());
        restore_sound(&sd.0, &work, "bgm").unwrap();
        assert!(!sd.0.join("cubegm/bgm.mp3").exists());
    }

    #[test]
    fn rechaza_ranuras_que_no_estan_en_el_xml() {
        let (sd, pc) = card("slot");
        let work = pc.0.to_string_lossy().to_string();
        assert!(replace_sound(&sd.0, &work, "effect9", &wav(2, 16)).is_err());
        assert!(read_sound(&sd.0, "effect7").is_err());
    }
}
