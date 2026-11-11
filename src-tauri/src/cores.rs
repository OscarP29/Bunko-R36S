//! Emulador de cada juego en la consola clon (firmware CubeGM).
//!
//! `cubegm/cores/config.xml` lista los emuladores que se pueden elegir y qué
//! extensiones abre cada uno. `cubegm/cores/filelist.xml` asigna un emulador a
//! juegos concretos, una línea `<file name="SFC/juego.zip" core="libemu_x.so" />`
//! por juego. Los juegos que no aparecen usan el emulador del sistema, que va
//! dentro del firmware (por eso no todos los sistemas tienen alternativas).
//!
//! Bunko solo cambia, añade o quita la línea del juego; el resto del archivo
//! queda igual byte a byte.

use crate::write_atomic_with_backup;
use serde::Serialize;
use std::{fs, path::Path};

const CONFIG: &str = "cubegm/cores/config.xml";
const ASSIGNMENTS: &str = "cubegm/cores/filelist.xml";

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Core {
    /// Archivo del emulador, el valor que guarda `filelist.xml`.
    pub file: String,
    pub name: String,
    #[serde(skip)]
    extensions: Vec<String>,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GameCores {
    /// Emuladores que abren este juego. Vacío si no hay donde elegir.
    pub options: Vec<Core>,
    /// Emulador asignado al juego; `None` = el del sistema.
    pub current: Option<String>,
}

fn unescape(value: &str) -> String {
    value
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
}

fn escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Valor del atributo `name="…"` dentro de `tag`.
fn attribute(tag: &str, name: &str) -> Option<String> {
    let start = tag.find(&format!("{name}=\""))? + name.len() + 2;
    let end = tag[start..].find('"')? + start;
    Some(unescape(&tag[start..end]))
}

fn parse_config(text: &str) -> Vec<Core> {
    text.split("<core>")
        .skip(1)
        .filter_map(|block| {
            let block = block.split("</core>").next()?;
            let tag = &block[block.find("<emucore")?..];
            let tag = &tag[..tag.find('>')?];
            let extensions = block
                .split("<supported_extensions>")
                .skip(1)
                .filter_map(|part| part.split('<').next())
                .map(|ext| ext.trim().to_ascii_lowercase())
                .filter(|ext| !ext.is_empty())
                .collect();
            Some(Core { file: attribute(tag, "file")?, name: attribute(tag, "name")?, extensions })
        })
        .collect()
}

/// Ruta del juego tal como la escribe la consola: `SISTEMA/archivo`.
fn game_key(dir: &Path, file_name: &str) -> Result<String, String> {
    let system = dir.file_name().and_then(|name| name.to_str()).ok_or("Carpeta de sistema inválida")?;
    Ok(format!("{system}/{file_name}"))
}

/// Línea de `filelist.xml` que corresponde al juego.
fn find_line(text: &str, key: &str) -> Option<usize> {
    text.split('\n').position(|line| {
        line.trim_start().starts_with("<file")
            && attribute(line, "name").is_some_and(|name| name.replace('\\', "/").eq_ignore_ascii_case(key))
    })
}

/// Extensión con la que se elige emulador. En un comprimido de un solo archivo
/// manda la de dentro (un `.zip` de Super Nintendo trae un `.sfc`); si trae
/// varios, como los de arcade, la del propio comprimido.
fn game_extension(path: &Path, cores: &[Core]) -> String {
    let own = path.extension().and_then(|e| e.to_str()).unwrap_or_default().to_ascii_lowercase();
    if let Some(kind) = crate::archive_kind(path) {
        if let Ok(inner) = crate::archive_single_entry(path, kind) {
            let inner = Path::new(&inner).extension().and_then(|e| e.to_str()).unwrap_or_default().to_ascii_lowercase();
            if cores.iter().any(|core| core.extensions.contains(&inner)) {
                return inner;
            }
        }
    }
    own
}

pub fn game_cores(root: &Path, dir: &Path, file_name: &str) -> Result<GameCores, String> {
    let Ok(config) = fs::read_to_string(root.join(CONFIG)) else {
        return Ok(GameCores { options: Vec::new(), current: None });
    };
    let cores = parse_config(&config);
    let extension = game_extension(&dir.join(file_name), &cores);
    let options = cores.into_iter().filter(|core| core.extensions.contains(&extension)).collect();
    let assignments = fs::read_to_string(root.join(ASSIGNMENTS)).unwrap_or_default();
    let key = game_key(dir, file_name)?;
    let current = find_line(&assignments, &key)
        .and_then(|index| attribute(assignments.split('\n').nth(index)?, "core"));
    Ok(GameCores { options, current })
}

/// Asigna `core` al juego, o lo deja con el del sistema si es `None`.
pub fn set_game_core(root: &Path, dir: &Path, file_name: &str, core: Option<&str>) -> Result<(), String> {
    if let Some(core) = core {
        let available = game_cores(root, dir, file_name)?;
        if !available.options.iter().any(|option| option.file == core) {
            return Err("Ese emulador no abre este juego".into());
        }
    }
    let path = root.join(ASSIGNMENTS);
    let text = match fs::read(&path) {
        Ok(bytes) => String::from_utf8(bytes).map_err(|_| "filelist.xml no está en UTF-8".to_string())?,
        Err(_) if core.is_none() => return Ok(()),
        Err(_) => "<?xml version=\"1.0\" encoding=\"utf-8\" ?>\n".to_string(),
    };
    let key = game_key(dir, file_name)?;
    let crlf = text.contains("\r\n");
    let mut lines: Vec<String> = text.split('\n').map(str::to_string).collect();
    let line = core.map(|core| {
        format!("<file name=\"{}\" core=\"{}\" />{}", escape(&key), escape(core), if crlf { "\r" } else { "" })
    });
    match (find_line(&text, &key), line) {
        (Some(index), Some(line)) => lines[index] = line,
        (Some(index), None) => {
            lines.remove(index);
        }
        (None, Some(line)) => {
            // Antes del salto final, si el archivo termina en uno.
            let at = if lines.last().is_some_and(|last| last.trim().is_empty()) { lines.len() - 1 } else { lines.len() };
            lines.insert(at, line);
        }
        (None, None) => return Ok(()),
    }
    write_atomic_with_backup(&path, lines.join("\n").as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    const CONFIG_XML: &str = "<?xml version=\"1.0\" encoding=\"utf-8\" ?>\n\n<core>\n<emucore name=\"libemu_fba\" file=\"libemu_fba.so\" />\n<supported_extensions>ZIP</supported_extensions>\n</core>\n\n<core>\n<emucore name=\"Snes9x 2005\" file=\"libemu_sfc.so\" />\n<supported_extensions>SMC</supported_extensions>\n<supported_extensions>SFC</supported_extensions>\n</core>\n\n<core>\n<emucore name=\"Snes9x 2010\" file=\"libemu_snes9x2010.so\" />\n<supported_extensions>SFC</supported_extensions>\n</core>\n";
    const FILELIST_XML: &str = "<?xml version=\"1.0\" encoding=\"utf-8\" ?>\n<file name=\"SFC/Otro.sfc\" core=\"libemu_snes9x2010.so\" />\n<file name=\"MAME/acitya.zip\" core=\"libemu_fba.so\" />\n";

    fn card() -> (std::path::PathBuf, std::path::PathBuf) {
        let root = std::env::temp_dir().join(format!("bunko-cores-{}-{:?}", std::process::id(), std::thread::current().id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("cubegm/cores")).unwrap();
        fs::create_dir_all(root.join("SFC")).unwrap();
        fs::create_dir_all(root.join("MAME")).unwrap();
        fs::write(root.join(CONFIG), CONFIG_XML).unwrap();
        fs::write(root.join(ASSIGNMENTS), FILELIST_XML).unwrap();
        fs::write(root.join("SFC/Mario & Luigi.sfc"), b"rom").unwrap();
        fs::write(root.join("SFC/Otro.sfc"), b"rom").unwrap();
        (root.clone(), root.join("SFC"))
    }

    fn zip_with(path: &Path, names: &[&str]) {
        let mut writer = zip::ZipWriter::new(fs::File::create(path).unwrap());
        for name in names {
            writer.start_file(*name, zip::write::SimpleFileOptions::default()).unwrap();
            writer.write_all(b"x").unwrap();
        }
        writer.finish().unwrap();
    }

    #[test]
    fn lee_los_emuladores_y_sus_extensiones() {
        let cores = parse_config(CONFIG_XML);
        assert_eq!(cores.len(), 3);
        assert_eq!(cores[1].name, "Snes9x 2005");
        assert_eq!(cores[1].extensions, ["smc", "sfc"]);
    }

    #[test]
    fn ofrece_los_emuladores_que_abren_el_juego() {
        let (root, sfc) = card();
        let found = game_cores(&root, &sfc, "Otro.sfc").unwrap();
        let files: Vec<_> = found.options.iter().map(|core| core.file.as_str()).collect();
        assert_eq!(files, ["libemu_sfc.so", "libemu_snes9x2010.so"]);
        assert_eq!(found.current.as_deref(), Some("libemu_snes9x2010.so"));
        assert_eq!(game_cores(&root, &sfc, "Mario & Luigi.sfc").unwrap().current, None);

        // Un .zip con una ROM de Super Nintendo dentro sigue siendo de Super Nintendo;
        // uno de arcade, con varios archivos, abre con los emuladores de .zip.
        zip_with(&sfc.join("Zelda.zip"), &["Zelda.sfc"]);
        zip_with(&root.join("MAME/acitya.zip"), &["a.bin", "b.bin"]);
        assert_eq!(game_cores(&root, &sfc, "Zelda.zip").unwrap().options.len(), 2);
        let arcade = game_cores(&root, &root.join("MAME"), "acitya.zip").unwrap();
        assert_eq!(arcade.options[0].file, "libemu_fba.so");
        assert_eq!(arcade.current.as_deref(), Some("libemu_fba.so"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn cambia_anade_y_quita_solo_la_linea_del_juego() {
        let (root, sfc) = card();
        let read = || fs::read_to_string(root.join(ASSIGNMENTS)).unwrap();

        set_game_core(&root, &sfc, "Mario & Luigi.sfc", Some("libemu_sfc.so")).unwrap();
        assert_eq!(read(), format!("{FILELIST_XML}<file name=\"SFC/Mario &amp; Luigi.sfc\" core=\"libemu_sfc.so\" />\n"));
        assert_eq!(game_cores(&root, &sfc, "Mario & Luigi.sfc").unwrap().current.as_deref(), Some("libemu_sfc.so"));

        set_game_core(&root, &sfc, "Otro.sfc", Some("libemu_sfc.so")).unwrap();
        assert!(read().contains("<file name=\"SFC/Otro.sfc\" core=\"libemu_sfc.so\" />\n<file name=\"MAME/acitya.zip\""));

        set_game_core(&root, &sfc, "Mario & Luigi.sfc", None).unwrap();
        set_game_core(&root, &sfc, "Otro.sfc", Some("libemu_snes9x2010.so")).unwrap();
        assert_eq!(read(), FILELIST_XML);
        assert!(root.join("cubegm/cores/filelist.xml.bak").exists());

        // Un emulador que no abre el juego se rechaza sin tocar nada.
        assert!(set_game_core(&root, &sfc, "Otro.sfc", Some("libemu_fba.so")).is_err());
        assert_eq!(read(), FILELIST_XML);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn sin_configuracion_no_hay_nada_que_elegir() {
        let (root, sfc) = card();
        fs::remove_file(root.join(CONFIG)).unwrap();
        assert_eq!(game_cores(&root, &sfc, "Otro.sfc").unwrap().options, Vec::new());
        assert!(set_game_core(&root, &sfc, "Otro.sfc", Some("libemu_sfc.so")).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
