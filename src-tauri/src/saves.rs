//! Ficha de la tarjeta y partidas guardadas (perfil R36SX / firmware CubeGM).
//!
//! Cada microSD lleva un `.bunko-card.json` con un id propio. Las copias se
//! guardan en `<trabajo>/<nombre>-<id>/<etiqueta>/` junto a un manifiesto con
//! ese id, así una copia nunca se restaura en la tarjeta de otra consola.

use crate::{parse_rows, system_name, write_atomic, FILELIST};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const CARD_FILE: &str = ".bunko-card.json";
/// Guardados del juego: un archivo por ROM, todos los sistemas juntos.
const SAVES_DIR: &str = "cubegm/saves";
/// Guardados rápidos: `states/<SISTEMA>/<rom>.svN`, una ranura por archivo.
const STATES_DIR: &str = "cubegm/states";
const CUBEGM_DIR: &str = "cubegm";
const MANIFEST: &str = "bunko-copia.json";
const DEFAULT_PROFILE: &str = "r36sx";
const PROFILES: &[&str] = &["r36sx"];

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CardInfo {
    pub id: String,
    pub name: String,
    pub profile: String,
}

/// Juego al que pertenece una partida.
#[derive(Clone, Debug, PartialEq)]
struct GameRef {
    system: String,
    title: String,
}

struct SaveFile {
    /// Ruta relativa a `cubegm/` con `/`, por ejemplo `states/GBA/x.sv0`.
    relative: String,
    absolute: PathBuf,
    bytes: u64,
    /// `None` si su juego ya no está en la tarjeta.
    game: Option<GameRef>,
}

#[derive(Serialize, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SavesSummary {
    owned: usize,
    owned_bytes: u64,
    orphans: usize,
    orphan_bytes: u64,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SaveEntry {
    relative: String,
    bytes: u64,
    /// `save` (guardado del juego) o `state` (guardado rápido).
    kind: &'static str,
    system: String,
    title: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SavesReport {
    folder: String,
    files: usize,
    bytes: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct ManifestFile {
    relative: String,
    bytes: u64,
    system: String,
    title: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    version: u32,
    card_id: String,
    card_name: String,
    /// `partidas`, `sobrantes` o `antes-de-restaurar`.
    kind: String,
    label: String,
    files: Vec<ManifestFile>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BackupFile {
    relative: String,
    bytes: u64,
    system: String,
    title: String,
    /// Su juego está en la tarjeta: solo así se puede restaurar.
    on_card: bool,
    /// Ya hay una partida en la tarjeta que se reemplazaría.
    replaces: bool,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    folder: String,
    label: String,
    kind: String,
    files: Vec<BackupFile>,
}

// ---------------------------------------------------------------------------
// Ficha de la tarjeta
// ---------------------------------------------------------------------------

fn new_card_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    format!("{:016x}{:04x}", nanos as u64, std::process::id() & 0xffff)
}

fn write_card(root: &Path, card: &CardInfo) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(card).map_err(|e| e.to_string())?;
    write_atomic(&root.join(CARD_FILE), &json)
        .map_err(|e| format!("No se pudo guardar la ficha de la tarjeta: {e}"))
}

/// Ficha de la tarjeta; la crea la primera vez que se conecta.
pub fn read_or_create_card(root: &Path) -> Result<CardInfo, String> {
    let path = root.join(CARD_FILE);
    if path.is_file() {
        let bytes = fs::read(&path).map_err(|e| format!("No se pudo leer la ficha: {e}"))?;
        if let Ok(card) = serde_json::from_slice::<CardInfo>(&bytes) {
            if !card.id.trim().is_empty() {
                return Ok(card);
            }
        }
    }
    let card = CardInfo {
        id: new_card_id(),
        name: "Mi consola".into(),
        profile: DEFAULT_PROFILE.into(),
    };
    write_card(root, &card)?;
    Ok(card)
}

pub fn update_card(root: &Path, name: &str, profile: &str) -> Result<CardInfo, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("El nombre de la consola no puede estar vacío".into());
    }
    if name.chars().count() > 40 {
        return Err("El nombre de la consola admite hasta 40 caracteres".into());
    }
    if !PROFILES.contains(&profile) {
        return Err("Ese modelo todavía no está disponible".into());
    }
    let mut card = read_or_create_card(root)?;
    card.name = name.to_string();
    card.profile = profile.to_string();
    write_card(root, &card)?;
    Ok(card)
}

// ---------------------------------------------------------------------------
// Partidas de la tarjeta
// ---------------------------------------------------------------------------

fn lower_stem(name: &str) -> Option<String> {
    Path::new(name)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .map(|stem| stem.to_lowercase())
}

/// Juegos de cada sistema por nombre de ROM sin extensión (en minúsculas):
/// los del catálogo con su título y también los archivos sueltos de la
/// carpeta, para no tratar como sobrante la partida de un juego sin catalogar.
fn rom_index(root: &Path) -> Result<HashMap<String, HashMap<String, GameRef>>, String> {
    let mut systems = HashMap::new();
    for entry in fs::read_dir(root).map_err(|e| format!("No se pudo leer la tarjeta: {e}"))? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if !path.is_dir() || !path.join(FILELIST).is_file() {
            continue;
        }
        let system = system_name(&path);
        let mut games: HashMap<String, GameRef> = HashMap::new();
        for file in fs::read_dir(&path).map_err(|e| e.to_string())?.flatten() {
            let name = file.file_name().to_string_lossy().to_string();
            if file.path().is_file() {
                if let Some(stem) = lower_stem(&name) {
                    let title = Path::new(&name)
                        .file_stem()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_default();
                    games.insert(stem, GameRef { system: system.clone(), title });
                }
            }
        }
        for (file, title) in parse_rows(&path.join(FILELIST))? {
            if let Some(stem) = lower_stem(&file) {
                games.insert(stem, GameRef { system: system.clone(), title });
            }
        }
        systems.insert(system.to_lowercase(), games);
    }
    Ok(systems)
}

/// Juego de una partida según su ruta relativa a `cubegm/`.
fn game_for(
    index: &HashMap<String, HashMap<String, GameRef>>,
    relative: &str,
) -> Option<GameRef> {
    let parts: Vec<&str> = relative.split('/').collect();
    match parts.as_slice() {
        ["saves", file] => {
            let stem = lower_stem(file)?;
            index.values().find_map(|games| games.get(&stem).cloned())
        }
        ["states", system, file] => index
            .get(&system.to_lowercase())?
            .get(&lower_stem(file)?)
            .cloned(),
        _ => None,
    }
}

fn collect_saves(root: &Path) -> Result<Vec<SaveFile>, String> {
    let index = rom_index(root)?;
    let mut files = Vec::new();
    let mut push = |absolute: PathBuf, relative: String| {
        let bytes = fs::metadata(&absolute).map(|m| m.len()).unwrap_or(0);
        let game = game_for(&index, &relative);
        files.push(SaveFile { relative, absolute, bytes, game });
    };

    // Solo los archivos sueltos: las subcarpetas (MAME, cfg…) son del emulador.
    if let Ok(entries) = fs::read_dir(root.join(SAVES_DIR)) {
        for entry in entries.flatten() {
            if entry.path().is_file() {
                let relative = format!("saves/{}", entry.file_name().to_string_lossy());
                push(entry.path(), relative);
            }
        }
    }
    if let Ok(entries) = fs::read_dir(root.join(STATES_DIR)) {
        for system in entries.flatten().filter(|entry| entry.path().is_dir()) {
            let system_dir = system.file_name().to_string_lossy().to_string();
            for entry in fs::read_dir(system.path()).map_err(|e| e.to_string())?.flatten() {
                if entry.path().is_file() {
                    let relative =
                        format!("states/{system_dir}/{}", entry.file_name().to_string_lossy());
                    push(entry.path(), relative);
                }
            }
        }
    }
    files.sort_by(|a, b| a.relative.cmp(&b.relative));
    Ok(files)
}

pub fn summarize(root: &Path) -> Result<SavesSummary, String> {
    Ok(collect_saves(root)?
        .iter()
        .fold(SavesSummary::default(), |mut summary, file| {
            if file.game.is_some() {
                summary.owned += 1;
                summary.owned_bytes += file.bytes;
            } else {
                summary.orphans += 1;
                summary.orphan_bytes += file.bytes;
            }
            summary
        }))
}

fn kind_of(relative: &str) -> &'static str {
    if relative.starts_with("states/") {
        "state"
    } else {
        "save"
    }
}

/// Partidas de los juegos que están en la tarjeta, para elegir cuáles copiar.
pub fn list_saves(root: &Path) -> Result<Vec<SaveEntry>, String> {
    Ok(collect_saves(root)?
        .into_iter()
        .filter_map(|file| {
            let game = file.game?;
            Some(SaveEntry {
                kind: kind_of(&file.relative),
                relative: file.relative,
                bytes: file.bytes,
                system: game.system,
                title: game.title,
            })
        })
        .collect())
}

// ---------------------------------------------------------------------------
// Copias en el PC
// ---------------------------------------------------------------------------

fn safe_component(text: &str) -> String {
    text.chars()
        .map(|c| if c.is_alphanumeric() || matches!(c, '-' | '_' | ' ') { c } else { '_' })
        .collect::<String>()
        .trim()
        .to_string()
}

/// Ruta relativa válida dentro de `cubegm/`: sin `..` ni rutas absolutas.
fn checked_relative(relative: &str) -> Result<PathBuf, String> {
    let parts: Vec<&str> = relative.split('/').collect();
    let valid = matches!(parts.first(), Some(&"saves") | Some(&"states"))
        && parts.len() <= 3
        && parts
            .iter()
            .all(|part| !part.is_empty() && *part != "." && *part != ".." && !part.contains(['\\', ':']));
    if !valid {
        return Err(format!("Ruta de partida inválida: {relative}"));
    }
    Ok(parts.iter().collect())
}

/// Carpeta de trabajo validada: ruta completa, fuera de la tarjeta, creada si falta.
fn work_folder(root: &Path, work_dir: &str) -> Result<PathBuf, String> {
    let requested = Path::new(work_dir.trim());
    if work_dir.trim().is_empty() || !requested.is_absolute() {
        return Err("Elige una carpeta de trabajo en Configuración".into());
    }
    if canonical_prefix(requested).starts_with(root) {
        return Err("La carpeta de trabajo no puede estar en la microSD".into());
    }
    fs::create_dir_all(requested)
        .map_err(|e| format!("No se pudo crear la carpeta de trabajo: {e}"))?;
    fs::canonicalize(requested).map_err(|e| format!("Carpeta de trabajo inválida: {e}"))
}

/// Canonicaliza la parte existente de `path` sin crear nada, para compararla
/// con la raíz antes de escribir.
fn canonical_prefix(path: &Path) -> PathBuf {
    let mut existing = path.to_path_buf();
    let mut rest = Vec::new();
    while !existing.exists() {
        match (existing.file_name().map(|n| n.to_os_string()), existing.parent()) {
            (Some(name), Some(parent)) => {
                rest.push(name);
                existing = parent.to_path_buf();
            }
            _ => return path.to_path_buf(),
        }
    }
    let mut result = fs::canonicalize(&existing).unwrap_or(existing);
    result.extend(rest.into_iter().rev());
    result
}

/// Carpeta de copias de esta tarjeta: `<trabajo>/<nombre>-<id8>`. Si el
/// usuario renombra la consola se sigue usando la carpeta existente.
pub(crate) fn card_folder(root: &Path, work_dir: &str, card: &CardInfo) -> Result<PathBuf, String> {
    let work = work_folder(root, work_dir)?;
    let suffix = format!("-{}", &card.id[..card.id.len().min(8)]);
    if let Ok(entries) = fs::read_dir(&work) {
        for entry in entries.flatten() {
            if entry.path().is_dir() && entry.file_name().to_string_lossy().ends_with(&suffix) {
                return Ok(entry.path());
            }
        }
    }
    let name = safe_component(&card.name);
    Ok(work.join(format!("{}{suffix}", if name.is_empty() { "consola" } else { &name })))
}

fn new_backup_folder(card_dir: &Path, label: &str) -> Result<PathBuf, String> {
    let label: String = label
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
        .collect();
    if label.is_empty() {
        return Err("Nombre de copia inválido".into());
    }
    let folder = card_dir.join(label);
    if folder.exists() {
        return Err("Ya existe una copia con ese nombre; espera un minuto y repite".into());
    }
    Ok(folder)
}

/// Copia `files` a `folder` con sus rutas relativas y escribe el manifiesto.
fn write_backup(
    folder: &Path,
    card: &CardInfo,
    kind: &str,
    files: &[(&Path, String, u64, Option<GameRef>)],
) -> Result<SavesReport, String> {
    let mut bytes = 0;
    let mut entries = Vec::with_capacity(files.len());
    for (source, relative, size, game) in files {
        let target = folder.join(checked_relative(relative)?);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("No se pudo crear {}: {e}", parent.display()))?;
        }
        bytes += fs::copy(source, &target)
            .map_err(|e| format!("No se pudo copiar {relative}: {e}"))?;
        let title = game
            .as_ref()
            .map(|g| g.title.clone())
            .unwrap_or_else(|| file_stem(relative));
        entries.push(ManifestFile {
            relative: relative.clone(),
            bytes: *size,
            system: game.as_ref().map(|g| g.system.clone()).unwrap_or_default(),
            title,
        });
    }
    let manifest = Manifest {
        version: 1,
        card_id: card.id.clone(),
        card_name: card.name.clone(),
        kind: kind.into(),
        label: folder
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default(),
        files: entries,
    };
    let json = serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?;
    write_atomic(&folder.join(MANIFEST), &json)?;
    Ok(SavesReport {
        folder: folder.to_string_lossy().to_string(),
        files: files.len(),
        bytes,
    })
}

fn file_stem(relative: &str) -> String {
    Path::new(relative.rsplit('/').next().unwrap_or(relative))
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// Copia las partidas elegidas (o todas si `selection` es `None`).
pub fn backup(
    root: &Path,
    work_dir: &str,
    label: &str,
    selection: Option<&[String]>,
) -> Result<SavesReport, String> {
    let card = read_or_create_card(root)?;
    let wanted: Option<HashSet<&str>> =
        selection.map(|items| items.iter().map(String::as_str).collect());
    let saves = collect_saves(root)?;
    let files: Vec<_> = saves
        .iter()
        .filter(|file| file.game.is_some())
        .filter(|file| wanted.as_ref().is_none_or(|set| set.contains(file.relative.as_str())))
        .map(|file| (file.absolute.as_path(), file.relative.clone(), file.bytes, file.game.clone()))
        .collect();
    if files.is_empty() {
        return Err("No hay partidas seleccionadas para copiar".into());
    }
    let folder = new_backup_folder(&card_folder(root, work_dir, &card)?, label)?;
    write_backup(&folder, &card, "partidas", &files)
}

/// Mueve al PC las partidas de juegos que ya no están en la tarjeta: primero
/// las copia y comprueba el tamaño, y solo entonces las borra de la microSD.
pub fn clean_orphans(root: &Path, work_dir: &str, label: &str) -> Result<SavesReport, String> {
    let card = read_or_create_card(root)?;
    let saves = collect_saves(root)?;
    let orphans: Vec<_> = saves
        .iter()
        .filter(|file| file.game.is_none())
        .map(|file| (file.absolute.as_path(), file.relative.clone(), file.bytes, None))
        .collect();
    if orphans.is_empty() {
        return Err("No hay partidas sobrantes".into());
    }
    let folder = new_backup_folder(&card_folder(root, work_dir, &card)?, label)?;
    let report = write_backup(&folder, &card, "sobrantes", &orphans)?;
    for (source, relative, bytes, _) in &orphans {
        let copied = checked_relative(relative)
            .ok()
            .and_then(|rel| fs::metadata(folder.join(rel)).ok())
            .map(|m| m.len());
        if copied == Some(*bytes) {
            fs::remove_file(source).map_err(|e| format!("No se pudo quitar {relative}: {e}"))?;
        }
    }
    Ok(report)
}

fn read_manifest(folder: &Path) -> Option<Manifest> {
    serde_json::from_slice(&fs::read(folder.join(MANIFEST)).ok()?).ok()
}

/// Copias de esta tarjeta, de la más reciente a la más antigua.
pub fn list_backups(root: &Path, work_dir: &str) -> Result<Vec<BackupInfo>, String> {
    let card = read_or_create_card(root)?;
    let card_dir = card_folder(root, work_dir, &card)?;
    let index = rom_index(root)?;
    let mut backups = Vec::new();
    let Ok(entries) = fs::read_dir(&card_dir) else {
        return Ok(backups);
    };
    for entry in entries.flatten().filter(|entry| entry.path().is_dir()) {
        let Some(manifest) = read_manifest(&entry.path()) else { continue };
        if manifest.card_id != card.id {
            continue;
        }
        let files = manifest
            .files
            .into_iter()
            .map(|file| BackupFile {
                on_card: game_for(&index, &file.relative).is_some(),
                replaces: checked_relative(&file.relative)
                    .map(|rel| root.join(CUBEGM_DIR).join(rel).exists())
                    .unwrap_or(false),
                relative: file.relative,
                bytes: file.bytes,
                system: file.system,
                title: file.title,
            })
            .collect();
        backups.push(BackupInfo {
            folder: entry.path().to_string_lossy().to_string(),
            label: manifest.label,
            kind: manifest.kind,
            files,
        });
    }
    backups.sort_by(|a, b| b.label.cmp(&a.label));
    Ok(backups)
}

/// Restaura partidas de una copia de esta tarjeta. Solo las de juegos que
/// están en ella; la partida que se reemplaza se guarda antes en el PC.
pub fn restore(
    root: &Path,
    work_dir: &str,
    folder: &str,
    selection: &[String],
    label: &str,
) -> Result<SavesReport, String> {
    let card = read_or_create_card(root)?;
    let card_dir = card_folder(root, work_dir, &card)?;
    let backup_dir = fs::canonicalize(folder).map_err(|_| "No se encontró la copia".to_string())?;
    if backup_dir.parent() != Some(card_dir.as_path()) {
        return Err("La copia no pertenece a esta consola".into());
    }
    let manifest = read_manifest(&backup_dir).ok_or("La copia no tiene manifiesto")?;
    if manifest.card_id != card.id {
        return Err("La copia es de otra consola".into());
    }
    let in_backup: HashSet<&str> = manifest.files.iter().map(|f| f.relative.as_str()).collect();
    let index = rom_index(root)?;
    let mut plan = Vec::new();
    for relative in selection {
        if !in_backup.contains(relative.as_str()) {
            return Err(format!("{relative} no está en la copia"));
        }
        let rel = checked_relative(relative)?;
        let game = game_for(&index, relative)
            .ok_or_else(|| format!("El juego de {relative} no está en la tarjeta"))?;
        plan.push((relative.clone(), rel, game));
    }
    if plan.is_empty() {
        return Err("No hay partidas seleccionadas para restaurar".into());
    }

    // Copia de seguridad de lo que se va a reemplazar.
    let cubegm = root.join(CUBEGM_DIR);
    let replaced: Vec<_> = plan
        .iter()
        .filter_map(|(relative, rel, game)| {
            let current = cubegm.join(rel);
            let bytes = fs::metadata(&current).ok()?.len();
            Some((current, relative.clone(), bytes, Some(game.clone())))
        })
        .collect();
    if !replaced.is_empty() {
        let safety = new_backup_folder(&card_dir, &format!("antes-de-restaurar-{label}"))?;
        let files: Vec<_> = replaced
            .iter()
            .map(|(path, relative, bytes, game)| (path.as_path(), relative.clone(), *bytes, game.clone()))
            .collect();
        write_backup(&safety, &card, "antes-de-restaurar", &files)?;
    }

    let mut bytes = 0;
    for (relative, rel, _) in &plan {
        let target = cubegm.join(rel);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        bytes += fs::copy(backup_dir.join(rel), &target)
            .map_err(|e| format!("No se pudo restaurar {relative}: {e}"))?;
    }
    Ok(SavesReport {
        folder: backup_dir.to_string_lossy().to_string(),
        files: plan.len(),
        bytes,
    })
}

/// Carpeta de copias de esta tarjeta, creada si falta, para abrirla.
pub fn backups_folder(root: &Path, work_dir: &str) -> Result<PathBuf, String> {
    let card = read_or_create_card(root)?;
    let folder = card_folder(root, work_dir, &card)?;
    fs::create_dir_all(&folder).map_err(|e| format!("No se pudo crear la carpeta: {e}"))?;
    Ok(folder)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    struct TempDir(PathBuf);

    impl TempDir {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "bunko-saves-{}-{label}-{}",
                std::process::id(),
                COUNTER.fetch_add(1, Ordering::Relaxed)
            ));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).unwrap();
            TempDir(fs::canonicalize(path).unwrap())
        }

        fn path(&self) -> &Path {
            &self.0
        }

        fn text(&self) -> String {
            self.0.to_string_lossy().to_string()
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    /// Tarjeta con un juego de GBA, sus partidas y otras de juegos que no están.
    fn card(label: &str) -> TempDir {
        let root = TempDir::new(label);
        let gba = root.path().join("GBA");
        fs::create_dir_all(&gba).unwrap();
        fs::write(gba.join(FILELIST), "Mother 3.gba,Mother 3 en español\n").unwrap();
        fs::write(gba.join("Mother 3.gba"), b"rom").unwrap();
        let saves = root.path().join(SAVES_DIR);
        fs::create_dir_all(saves.join("cfg")).unwrap();
        fs::write(saves.join("Mother 3.sav"), b"save").unwrap();
        fs::write(saves.join("Otro juego.sav"), b"orphan").unwrap();
        fs::write(saves.join("cfg/arcade.cfg"), b"cfg").unwrap();
        let states = root.path().join(STATES_DIR);
        fs::create_dir_all(states.join("GBA")).unwrap();
        fs::create_dir_all(states.join("FC")).unwrap();
        fs::write(states.join("GBA/Mother 3.sv0"), b"state").unwrap();
        fs::write(states.join("FC/Mario.sv0"), b"st").unwrap();
        root
    }

    #[test]
    fn la_ficha_se_crea_una_vez_y_se_puede_renombrar() {
        let root = card("card");
        let first = read_or_create_card(root.path()).unwrap();
        assert_eq!(read_or_create_card(root.path()).unwrap(), first);
        let renamed = update_card(root.path(), " R36SX de Ana ", "r36sx").unwrap();
        assert_eq!(renamed.id, first.id);
        assert_eq!(renamed.name, "R36SX de Ana");
        assert!(update_card(root.path(), "x", "arkos").is_err());
        assert!(update_card(root.path(), "  ", "r36sx").is_err());
    }

    #[test]
    fn separa_las_partidas_de_juegos_presentes() {
        let root = card("summary");
        assert_eq!(
            summarize(root.path()).unwrap(),
            SavesSummary { owned: 2, owned_bytes: 9, orphans: 2, orphan_bytes: 8 }
        );
        let saves = list_saves(root.path()).unwrap();
        assert_eq!(saves.len(), 2);
        assert!(saves.iter().all(|s| s.title == "Mother 3 en español" && s.system == "GBA"));
        assert_eq!(saves.iter().filter(|s| s.kind == "state").count(), 1);
    }

    #[test]
    fn copia_solo_la_seleccion_con_manifiesto() {
        let root = card("backup");
        let work = TempDir::new("backup-work");
        let selection = vec!["saves/Mother 3.sav".to_string()];
        let report = backup(root.path(), &work.text(), "copia-1", Some(&selection)).unwrap();
        assert_eq!(report.files, 1);
        let folder = PathBuf::from(&report.folder);
        assert!(folder.join("saves/Mother 3.sav").is_file());
        assert!(!folder.join("states").exists());
        let manifest = read_manifest(&folder).unwrap();
        assert_eq!(manifest.card_id, read_or_create_card(root.path()).unwrap().id);
        // Una segunda copia con el mismo nombre no pisa la primera.
        assert!(backup(root.path(), &work.text(), "copia-1", None).is_err());
    }

    #[test]
    fn restaura_y_guarda_antes_la_partida_reemplazada() {
        let root = card("restore");
        let work = TempDir::new("restore-work");
        let report = backup(root.path(), &work.text(), "copia", None).unwrap();
        let save = root.path().join(SAVES_DIR).join("Mother 3.sav");
        fs::write(&save, b"partida nueva").unwrap();

        let backups = list_backups(root.path(), &work.text()).unwrap();
        assert_eq!(backups.len(), 1);
        assert!(backups[0].files.iter().all(|f| f.on_card && f.replaces));

        let selection = vec!["saves/Mother 3.sav".to_string()];
        restore(root.path(), &work.text(), &report.folder, &selection, "r1").unwrap();
        assert_eq!(fs::read(&save).unwrap(), b"save");
        let safety = PathBuf::from(&report.folder)
            .parent()
            .unwrap()
            .join("antes-de-restaurar-r1/saves/Mother 3.sav");
        assert_eq!(fs::read(safety).unwrap(), b"partida nueva");
    }

    #[test]
    fn no_restaura_copias_de_otra_tarjeta() {
        let root = card("other-a");
        let other = card("other-b");
        let work = TempDir::new("other-work");
        let report = backup(root.path(), &work.text(), "copia", None).unwrap();
        let selection = vec!["saves/Mother 3.sav".to_string()];
        assert!(restore(other.path(), &work.text(), &report.folder, &selection, "r").is_err());
        assert!(list_backups(other.path(), &work.text()).unwrap().is_empty());
    }

    #[test]
    fn no_restaura_partidas_de_juegos_ausentes_ni_rutas_raras() {
        let root = card("absent");
        let work = TempDir::new("absent-work");
        let report = backup(root.path(), &work.text(), "copia", None).unwrap();
        fs::remove_file(root.path().join("GBA/Mother 3.gba")).unwrap();
        fs::write(root.path().join("GBA").join(FILELIST), "").unwrap();
        let selection = vec!["saves/Mother 3.sav".to_string()];
        assert!(restore(root.path(), &work.text(), &report.folder, &selection, "r").is_err());
        assert!(checked_relative("saves/../../x").is_err());
        assert!(checked_relative("otra/x.sav").is_err());
    }

    #[test]
    fn limpia_las_sobrantes_moviendolas_al_pc() {
        let root = card("clean");
        let work = TempDir::new("clean-work");
        let report = clean_orphans(root.path(), &work.text(), "sobrantes").unwrap();
        assert_eq!(report.files, 2);
        let folder = PathBuf::from(&report.folder);
        assert!(folder.join("saves/Otro juego.sav").is_file());
        assert!(folder.join("states/FC/Mario.sv0").is_file());
        let saves = root.path().join(SAVES_DIR);
        assert!(!saves.join("Otro juego.sav").exists());
        assert!(saves.join("Mother 3.sav").is_file());
        assert!(saves.join("cfg/arcade.cfg").is_file());
    }

    #[test]
    fn la_carpeta_de_trabajo_no_puede_estar_en_la_tarjeta() {
        let root = card("inside");
        let inside = root.path().join("copias");
        assert!(work_folder(root.path(), &inside.to_string_lossy()).is_err());
        assert!(!inside.exists());
    }
}
