use image::ImageFormat;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::{Cursor, Write},
    path::{Path, PathBuf},
    sync::{Mutex, RwLock, RwLockReadGuard, RwLockWriteGuard},
};
use tauri::{AppHandle, Manager, State};

mod backgrounds;
mod deflated_zip;
mod logos;
mod look;
mod saves;
mod sheets;

/// Tamaño final de todas las carátulas guardadas en la microSD.
const COVER_SIZE: u32 = 512;
const NOTES_FILE: &str = ".r36s-manager-notes.json";
/// Sagas asignadas a mano, por carpeta de sistema y archivo de juego.
const SAGAS_FILE: &str = ".r36s-manager-sagas.json";
/// Favoritos que marca la consola clon (firmware CubeGM), relativo a la raíz.
const FAVORITES_FILE: &str = "cubegm/favorites.lst";
const FILELIST: &str = "filelist.csv";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Game {
    id: String,
    file_name: String,
    title: String,
    image_name: Option<String>,
    image_path: Option<String>,
    image_version: Option<u64>,
    has_image: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct System {
    id: String,
    name: String,
    path: String,
    game_count: usize,
    missing_images: usize,
}

/// Raíz de la microSD elegida por el usuario. Todas las operaciones de disco se
/// validan contra esta raíz, así el frontend no puede leer ni escribir fuera de ella.
///
/// Los comandos corren fuera del hilo principal para no congelar la ventana, así
/// que `disk` los ordena: varias lecturas a la vez y una sola escritura. Sin él,
/// dos escrituras podrían pisarse `filelist.csv` o su archivo temporal.
#[derive(Default)]
struct AppState {
    root: Mutex<Option<PathBuf>>,
    disk: RwLock<()>,
}

fn disk_read<'a>(state: &'a State<AppState>) -> Result<RwLockReadGuard<'a, ()>, String> {
    state
        .disk
        .read()
        .map_err(|_| "Estado interno bloqueado".to_string())
}

fn disk_write<'a>(state: &'a State<AppState>) -> Result<RwLockWriteGuard<'a, ()>, String> {
    state
        .disk
        .write()
        .map_err(|_| "Estado interno bloqueado".to_string())
}

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

fn canonical_dir(path: &str) -> Result<PathBuf, String> {
    let canonical = fs::canonicalize(path)
        .map_err(|_| format!("La ruta indicada no existe o no se puede leer: {path}"))?;
    if !canonical.is_dir() {
        return Err(format!("La ruta indicada no es una carpeta: {path}"));
    }
    Ok(canonical)
}

fn path_within(root: &Path, candidate: &Path) -> Result<PathBuf, String> {
    let root =
        fs::canonicalize(root).map_err(|_| "La carpeta raíz ya no está disponible".to_string())?;
    let resolved = fs::canonicalize(candidate)
        .map_err(|_| "La ruta no existe dentro de la microSD seleccionada".to_string())?;
    if !resolved.starts_with(&root) {
        return Err("La ruta está fuera de la carpeta de la microSD seleccionada".into());
    }
    Ok(resolved)
}

fn require_root(state: &State<AppState>) -> Result<PathBuf, String> {
    state
        .root
        .lock()
        .map_err(|_| "Estado interno bloqueado".to_string())?
        .clone()
        .ok_or_else(|| "Selecciona primero la carpeta ROMS de la microSD".to_string())
}

/// Resuelve la carpeta de un sistema validando que cuelga de la raíz seleccionada.
fn require_system(state: &State<AppState>, system_path: &str) -> Result<PathBuf, String> {
    let root = require_root(state)?;
    let system = path_within(&root, Path::new(system_path))?;
    if !system.is_dir() {
        return Err("La carpeta del emulador no existe".into());
    }
    if !system.join(FILELIST).is_file() {
        return Err("La carpeta no contiene filelist.csv".into());
    }
    Ok(system)
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

fn parse_rows(path: &Path) -> Result<Vec<(String, String)>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = fs::read(path).map_err(|e| format!("No se pudo leer {}: {e}", path.display()))?;
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_reader(data.as_slice());
    let mut rows = Vec::new();
    for row in reader.records() {
        let row = row.map_err(|e| format!("CSV inválido: {e}"))?;
        let file = row
            .get(0)
            .unwrap_or("")
            .trim()
            .trim_start_matches('\u{feff}')
            .to_string();
        if file.is_empty() {
            continue;
        }
        let title = row.get(1).unwrap_or("").trim().to_string();
        rows.push((file, title));
    }
    Ok(rows)
}

fn serialize_rows(rows: &[(String, String)]) -> Result<Vec<u8>, String> {
    let mut writer = csv::WriterBuilder::new()
        .has_headers(false)
        .from_writer(Vec::new());
    for (file, title) in rows {
        writer
            .write_record([file, title])
            .map_err(|e| format!("No se pudo preparar el CSV: {e}"))?;
    }
    writer
        .into_inner()
        .map_err(|e| format!("No se pudo preparar el CSV: {e}"))
}

/// Escribe un archivo de forma atómica: primero un temporal en la misma carpeta,
/// luego un rename sobre el destino. Si algo falla, el archivo original no se toca.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Ruta de archivo inválida")?;
    let tmp = path.with_file_name(format!(".{file_name}.tmp"));
    {
        let mut file =
            File::create(&tmp).map_err(|e| format!("No se pudo crear el archivo temporal: {e}"))?;
        file.write_all(bytes)
            .map_err(|e| format!("No se pudo escribir el archivo temporal: {e}"))?;
        file.sync_all()
            .map_err(|e| format!("No se pudo sincronizar el archivo temporal: {e}"))?;
    }
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("No se pudo reemplazar {}: {e}", path.display())
    })
}

/// Igual que `write_atomic`, pero conserva una copia `<archivo>.bak` del contenido anterior.
fn write_atomic_with_backup(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if path.exists() {
        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or("Ruta de archivo inválida")?;
        let backup = path.with_file_name(format!("{file_name}.bak"));
        fs::copy(path, &backup)
            .map_err(|e| format!("No se pudo crear la copia de seguridad {e}"))?;
    }
    write_atomic(path, bytes)
}

// ---------------------------------------------------------------------------
// Imágenes
// ---------------------------------------------------------------------------

/// Índice de `images/`: nombre del archivo sin su última extensión, en
/// minúsculas. Permite resolver todas las carátulas con un solo `read_dir`.
type ImageIndex = HashMap<String, Vec<String>>;

fn index_images(dir: &Path) -> ImageIndex {
    let mut index: ImageIndex = HashMap::new();
    let Ok(entries) = fs::read_dir(dir.join("images")) else {
        return index;
    };
    for entry in entries.flatten() {
        if !entry
            .file_type()
            .map(|kind| kind.is_file())
            .unwrap_or(false)
        {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        // "Juego.png" → "juego", "Juego.gba.png" → "juego.gba",
        // "Super Mario Bros. 3.png" → "super mario bros. 3".
        let Some((base, _)) = name.rsplit_once('.') else {
            continue;
        };
        if base.is_empty() {
            continue;
        }
        index.entry(base.to_lowercase()).or_default().push(name);
    }
    for names in index.values_mut() {
        // El PNG primero: es el que escribe Bunko al guardar una carátula.
        names.sort_by_key(|name| (!name.to_lowercase().ends_with(".png"), name.clone()));
    }
    index
}

/// Carátulas de una ROM, de más a menos preferida: primero `<rom sin
/// extensión>.*` (lo que escribe `save_image`) y después `<rom con extensión>.*`.
fn rom_image_names(index: &ImageIndex, file_name: &str) -> Vec<String> {
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file_name);
    let mut names: Vec<String> = Vec::new();
    for key in [stem, file_name] {
        for name in index.get(&key.to_lowercase()).into_iter().flatten() {
            if !names.contains(name) {
                names.push(name.clone());
            }
        }
    }
    names
}

/// Fecha de modificación en milisegundos. El frontend la añade a la URL de la
/// carátula para que el webview no siga mostrando la copia en caché.
fn modified_ms(path: &Path) -> Option<u64> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    let elapsed = modified.duration_since(std::time::UNIX_EPOCH).ok()?;
    Some(elapsed.as_millis() as u64)
}

fn encode_cover(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let decoded =
        image::load_from_memory(bytes).map_err(|e| format!("La imagen no se pudo leer: {e}"))?;
    let mut output = Cursor::new(Vec::new());
    decoded
        .resize_exact(
            COVER_SIZE,
            COVER_SIZE,
            image::imageops::FilterType::Lanczos3,
        )
        .write_to(&mut output, ImageFormat::Png)
        .map_err(|e| format!("La imagen no se pudo convertir: {e}"))?;
    Ok(output.into_inner())
}

// ---------------------------------------------------------------------------
// Biblioteca
// ---------------------------------------------------------------------------

fn system_name(path: &Path) -> String {
    path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Emulador")
        .replace('_', " ")
        .replace('-', " ")
}

fn game_from_row(dir: &Path, index: &ImageIndex, file_name: &str, listed_title: &str) -> Game {
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file_name)
        .to_string();
    let title = if listed_title.is_empty() {
        stem
    } else {
        listed_title.to_string()
    };
    let image_name = rom_image_names(index, file_name).into_iter().next();
    let image_file = image_name.as_ref().map(|name| dir.join("images").join(name));
    let image_version = image_file.as_deref().and_then(modified_ms);
    let image_path = image_file.map(|path| path.to_string_lossy().to_string());
    let has_image = image_name.is_some();
    Game {
        id: file_name.to_string(),
        file_name: file_name.to_string(),
        title,
        image_name,
        image_path,
        image_version,
        has_image,
    }
}

fn list_games_at(dir: &Path) -> Result<Vec<Game>, String> {
    let rows = parse_rows(&dir.join(FILELIST))?;
    let index = index_images(dir);
    Ok(rows
        .iter()
        .map(|(file_name, title)| game_from_row(dir, &index, file_name, title))
        .collect())
}

fn scan_root(root: &Path) -> Result<Vec<System>, String> {
    let mut systems = Vec::new();
    for entry in fs::read_dir(root).map_err(|e| format!("No se pudo leer la carpeta: {e}"))? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            continue;
        }
        let path = entry.path();
        if !path.join(FILELIST).is_file() {
            continue;
        }
        let games = list_games_at(&path)?;
        systems.push(System {
            id: path.to_string_lossy().to_string(),
            name: system_name(&path),
            path: path.to_string_lossy().to_string(),
            game_count: games.len(),
            missing_images: games.iter().filter(|game| !game.has_image).count(),
        });
    }
    systems.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(systems)
}

/// Comprimidos que se pueden extraer al añadir un juego.
#[derive(Clone, Copy)]
enum ArchiveKind {
    Zip,
    SevenZ,
}

fn archive_kind(path: &Path) -> Option<ArchiveKind> {
    let ext = path.extension()?.to_str()?.to_lowercase();
    match ext.as_str() {
        "zip" => Some(ArchiveKind::Zip),
        "7z" => Some(ArchiveKind::SevenZ),
        _ => None,
    }
}

/// Último componente de una ruta interna del comprimido, sin carpetas.
fn entry_file_name(name: &str) -> Option<String> {
    let base = name.rsplit(['/', '\\']).next()?.trim();
    (!base.is_empty() && base != "." && base != "..").then(|| base.to_string())
}

/// Nombre del único archivo que contiene el comprimido. Si hay varios (por
/// ejemplo `.cue` + `.bin`) no se adivina cuál es la ROM: hay que extraerlo a mano.
fn archive_single_entry(path: &Path, kind: ArchiveKind) -> Result<String, String> {
    let label = path.file_name().and_then(|n| n.to_str()).unwrap_or("el comprimido");
    let names: Vec<String> = match kind {
        ArchiveKind::Zip => {
            let file = File::open(path).map_err(|e| format!("No se pudo abrir {label}: {e}"))?;
            let mut archive = zip::ZipArchive::new(file)
                .map_err(|e| format!("{label} no es un .zip válido: {e}"))?;
            let mut names = Vec::new();
            for index in 0..archive.len() {
                let entry = archive.by_index(index).map_err(|e| e.to_string())?;
                if !entry.is_dir() {
                    names.push(entry.name().unwrap_or_default().to_string());
                }
            }
            names
        }
        ArchiveKind::SevenZ => {
            let reader = sevenz_rust2::ArchiveReader::open(path, sevenz_rust2::Password::empty())
                .map_err(|e| format!("{label} no es un .7z válido: {e}"))?;
            reader
                .archive()
                .files
                .iter()
                .filter(|entry| !entry.is_directory)
                .map(|entry| entry.name.clone())
                .collect()
        }
    };
    match names.as_slice() {
        [only] => entry_file_name(only).ok_or_else(|| format!("{label} contiene un nombre inválido")),
        [] => Err(format!("{label} está vacío")),
        _ => Err(format!(
            "{label} contiene {} archivos; extráelo a mano o añádelo sin extraer",
            names.len()
        )),
    }
}

/// Extrae el único archivo del comprimido en `destination`. Si falla a mitad,
/// borra lo escrito para no dejar una ROM truncada en la tarjeta.
fn extract_single_entry(source: &Path, kind: ArchiveKind, destination: &Path) -> Result<(), String> {
    let result = (|| -> Result<(), String> {
        let mut output = File::create(destination).map_err(|e| e.to_string())?;
        match kind {
            ArchiveKind::Zip => {
                let file = File::open(source).map_err(|e| e.to_string())?;
                let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
                for index in 0..archive.len() {
                    let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
                    if !entry.is_dir() {
                        std::io::copy(&mut entry, &mut output).map_err(|e| e.to_string())?;
                        break;
                    }
                }
            }
            ArchiveKind::SevenZ => {
                let mut reader =
                    sevenz_rust2::ArchiveReader::open(source, sevenz_rust2::Password::empty())
                        .map_err(|e| e.to_string())?;
                reader
                    .for_each_entries(|entry, data| {
                        if entry.is_directory {
                            return Ok(true);
                        }
                        std::io::copy(data, &mut output)?;
                        Ok(false)
                    })
                    .map_err(|e| e.to_string())?;
            }
        }
        output.flush().map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(destination);
    }
    result
}

/// Un juego que llega desde la interfaz para añadirlo al catálogo.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NewGameInput {
    source_path: String,
    title: String,
    image_bytes: Option<Vec<u8>>,
    /// Si la ROM viene en .zip o .7z, copia solo el archivo de dentro.
    #[serde(default)]
    extract: bool,
}

struct PreparedGame {
    source: PathBuf,
    destination: PathBuf,
    file_name: String,
    title: String,
    /// Formato del comprimido cuando hay que extraerlo en vez de copiarlo.
    extract: Option<ArchiveKind>,
    /// Ruta final de la carátula y sus bytes ya convertidos a PNG.
    cover: Option<(PathBuf, Vec<u8>, bool)>,
}

/// Añade uno o varios juegos con una sola escritura del `filelist.csv`.
///
/// Todo lo que puede fallar (leer el CSV, validar duplicados, decodificar las
/// imágenes y serializar el catálogo) se resuelve antes de tocar la tarjeta. Si
/// una copia falla a mitad, se borran las ROM y carátulas ya escritas.
fn add_games_impl(dir: &Path, inputs: &[NewGameInput]) -> Result<Vec<Game>, String> {
    if inputs.is_empty() {
        return Err("Selecciona al menos un archivo de juego".into());
    }

    let mut rows = parse_rows(&dir.join(FILELIST))?;
    let existing: HashSet<String> = rows.iter().map(|(file, _)| file.to_lowercase()).collect();
    let mut in_batch: HashSet<String> = HashSet::new();
    let images = dir.join("images");
    let mut prepared: Vec<PreparedGame> = Vec::with_capacity(inputs.len());

    for input in inputs {
        let source = Path::new(&input.source_path);
        if !source.is_file() {
            return Err(format!(
                "No se encontró el archivo de juego: {}",
                input.source_path
            ));
        }
        let extract = input.extract.then(|| archive_kind(source)).flatten();
        let file_name = match extract {
            Some(kind) => archive_single_entry(source, kind)?,
            None => source
                .file_name()
                .and_then(|name| name.to_str())
                .ok_or("Nombre de archivo inválido")?
                .to_string(),
        };
        let key = file_name.to_lowercase();
        if existing.contains(&key) || !in_batch.insert(key) {
            return Err(format!(
                "El juego {file_name} ya existe en la carpeta del emulador o está repetido en la selección"
            ));
        }
        let destination = dir.join(&file_name);
        if destination.exists() {
            return Err(format!("El juego {file_name} ya existe en la carpeta del emulador"));
        }

        let cover = match input.image_bytes.as_ref() {
            Some(bytes) => {
                let encoded = encode_cover(bytes)
                    .map_err(|e| format!("La carátula de {file_name} no es válida: {e}"))?;
                let stem = Path::new(&file_name)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("game");
                let path = images.join(format!("{stem}.png"));
                let was_new = !path.exists();
                Some((path, encoded, was_new))
            }
            None => None,
        };

        prepared.push(PreparedGame {
            source: source.to_path_buf(),
            destination,
            file_name,
            title: input.title.trim().to_string(),
            extract,
            cover,
        });
    }

    for game in &prepared {
        rows.push((game.file_name.clone(), game.title.clone()));
    }
    let csv_bytes = serialize_rows(&rows)?;

    let mut copied: Vec<PathBuf> = Vec::new();
    let mut written_covers: Vec<PathBuf> = Vec::new();
    let result = (|| -> Result<(), String> {
        for game in &prepared {
            match game.extract {
                Some(kind) => extract_single_entry(&game.source, kind, &game.destination)
                    .map_err(|e| format!("No se pudo extraer {}: {e}", game.file_name))?,
                None => {
                    fs::copy(&game.source, &game.destination)
                        .map_err(|e| format!("No se pudo copiar {}: {e}", game.file_name))?;
                }
            }
            copied.push(game.destination.clone());
        }
        for game in &prepared {
            if let Some((path, bytes, _)) = &game.cover {
                fs::create_dir_all(&images)
                    .map_err(|e| format!("No se pudo crear la carpeta images: {e}"))?;
                write_atomic(path, bytes)?;
                written_covers.push(path.clone());
            }
        }
        write_atomic_with_backup(&dir.join(FILELIST), &csv_bytes)
    })();

    if let Err(error) = result {
        // Revertir lo ya escrito para no dejar el catálogo a medias.
        for path in copied.iter().chain(written_covers.iter()) {
            let _ = fs::remove_file(path);
        }
        return Err(error);
    }

    let index = index_images(dir);
    Ok(prepared
        .iter()
        .map(|game| game_from_row(dir, &index, &game.file_name, &game.title))
        .collect())
}

fn remove_game_impl(dir: &Path, file_name: &str) -> Result<(), String> {
    let safe_name = Path::new(file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Nombre de archivo inválido")?;
    let mut rows = parse_rows(&dir.join(FILELIST))?;
    let original_len = rows.len();
    rows.retain(|(file, _)| file != safe_name);
    if rows.len() == original_len {
        return Err("No se encontró el juego en filelist.csv".into());
    }
    let csv_bytes = serialize_rows(&rows)?;
    // El archivo de ROM se conserva a propósito.
    write_atomic_with_backup(&dir.join(FILELIST), &csv_bytes)
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Favorite {
    /// Carpeta del sistema, por ejemplo `GBA`.
    system: String,
    file_name: String,
}

/// Lee `favorites.lst`: una línea por juego con `SISTEMA/archivo|título|…`.
/// El archivo puede acabar en un byte nulo y no traer saltos de línea Windows.
fn parse_favorites(bytes: &[u8]) -> Vec<Favorite> {
    String::from_utf8_lossy(bytes)
        .lines()
        .filter_map(|line| {
            let path = line.trim_matches(|c: char| c == '\0' || c.is_whitespace());
            let path = path.split('|').next()?;
            let (system, file_name) = path.split_once(['/', '\\'])?;
            (!system.is_empty() && !file_name.is_empty()).then(|| Favorite {
                system: system.to_string(),
                file_name: file_name.to_string(),
            })
        })
        .collect()
}

/// Cambia el título que muestra la consola. El archivo de ROM no se toca.
fn rename_game_impl(dir: &Path, file_name: &str, title: &str) -> Result<(), String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("El nombre no puede estar vacío".into());
    }
    let mut rows = parse_rows(&dir.join(FILELIST))?;
    let row = rows
        .iter_mut()
        .find(|(file, _)| file == file_name)
        .ok_or("No se encontró el juego en filelist.csv")?;
    row.1 = title.to_string();
    let csv_bytes = serialize_rows(&rows)?;
    write_atomic_with_backup(&dir.join(FILELIST), &csv_bytes)
}

/// Reescribe `filelist.csv` en el orden de `order`, que es el que sigue la
/// consola. Tiene que contener exactamente los mismos juegos del catálogo.
fn reorder_games_impl(dir: &Path, order: &[String]) -> Result<(), String> {
    let rows = parse_rows(&dir.join(FILELIST))?;
    let mut by_file: HashMap<&str, &(String, String)> =
        rows.iter().map(|row| (row.0.as_str(), row)).collect();
    if order.len() != rows.len() {
        return Err("El orden no coincide con el catálogo; vuelve a cargar el sistema".into());
    }
    let mut sorted = Vec::with_capacity(rows.len());
    for file in order {
        let row = by_file
            .remove(file.as_str())
            .ok_or("El orden no coincide con el catálogo; vuelve a cargar el sistema")?;
        sorted.push(row.clone());
    }
    let csv_bytes = serialize_rows(&sorted)?;
    write_atomic_with_backup(&dir.join(FILELIST), &csv_bytes)
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

#[tauri::command(async)]
fn scan_sd(app: AppHandle, state: State<AppState>, root: String) -> Result<Vec<System>, String> {
    let _disk = disk_read(&state)?;
    let canonical = canonical_dir(&root)?;
    let systems = scan_root(&canonical)?;

    // El protocolo de assets solo puede leer lo que se autorice aquí.
    let scope = app.asset_protocol_scope();
    let _ = scope.allow_directory(&canonical, true);
    let _ = scope.allow_directory(PathBuf::from(&root), true);

    *state
        .root
        .lock()
        .map_err(|_| "Estado interno bloqueado".to_string())? = Some(canonical);

    Ok(systems)
}

#[tauri::command(async)]
fn list_games(state: State<AppState>, system_path: String) -> Result<Vec<Game>, String> {
    let _disk = disk_read(&state)?;
    list_games_at(&require_system(&state, &system_path)?)
}

#[tauri::command(async)]
fn add_games(
    state: State<AppState>,
    system_path: String,
    games: Vec<NewGameInput>,
) -> Result<Vec<Game>, String> {
    let _disk = disk_write(&state)?;
    add_games_impl(&require_system(&state, &system_path)?, &games)
}

#[tauri::command(async)]
fn remove_game(
    state: State<AppState>,
    system_path: String,
    file_name: String,
) -> Result<(), String> {
    let _disk = disk_write(&state)?;
    remove_game_impl(&require_system(&state, &system_path)?, &file_name)
}

#[tauri::command(async)]
fn rename_game(
    state: State<AppState>,
    system_path: String,
    file_name: String,
    title: String,
) -> Result<(), String> {
    let _disk = disk_write(&state)?;
    rename_game_impl(&require_system(&state, &system_path)?, &file_name, &title)
}

#[tauri::command(async)]
fn reorder_games(
    state: State<AppState>,
    system_path: String,
    order: Vec<String>,
) -> Result<(), String> {
    let _disk = disk_write(&state)?;
    reorder_games_impl(&require_system(&state, &system_path)?, &order)
}

#[tauri::command(async)]
fn save_image(
    state: State<AppState>,
    system_path: String,
    file_name: String,
    image_bytes: Vec<u8>,
) -> Result<String, String> {
    let _disk = disk_write(&state)?;
    let dir = require_system(&state, &system_path)?;
    let stem = Path::new(&file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("Nombre inválido")?;
    if !parse_rows(&dir.join(FILELIST))?
        .iter()
        .any(|(file, _)| file == &file_name)
    {
        return Err("El juego no existe en filelist.csv".into());
    }
    let encoded = encode_cover(&image_bytes)?;
    let images = dir.join("images");
    fs::create_dir_all(&images).map_err(|e| format!("No se pudo crear images/: {e}"))?;
    let destination = images.join(format!("{stem}.png"));
    write_atomic(&destination, &encoded)?;
    Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
fn open_folder(state: State<AppState>, system_path: Option<String>) -> Result<(), String> {
    let root = require_root(&state)?;
    let target = match system_path {
        Some(path) => path_within(&root, Path::new(&path))?,
        None => root,
    };
    tauri_plugin_opener::open_path(target.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("No se pudo abrir la carpeta: {e}"))
}

/// Espacio de la unidad que contiene la raíz, en bytes.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiskSpace {
    free_bytes: u64,
    total_bytes: u64,
}

#[cfg(windows)]
fn disk_space_at(path: &Path) -> Result<DiskSpace, String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let (mut free_bytes, mut total_bytes) = (0u64, 0u64);
    // SAFETY: `wide` termina en nulo y los punteros apuntan a u64 vivos durante la llamada.
    let ok = unsafe {
        GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut free_bytes,
            &mut total_bytes,
            std::ptr::null_mut(),
        )
    };
    if ok == 0 {
        return Err("No se pudo leer el espacio de la tarjeta".into());
    }
    Ok(DiskSpace {
        free_bytes,
        total_bytes,
    })
}

#[cfg(unix)]
fn disk_space_at(path: &Path) -> Result<DiskSpace, String> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};

    let c_path = CString::new(path.as_os_str().as_bytes())
        .map_err(|_| "Ruta de la tarjeta inválida".to_string())?;
    // SAFETY: statvfs es una estructura de datos planos válida a ceros.
    let mut stats: libc::statvfs = unsafe { std::mem::zeroed() };
    // SAFETY: `c_path` termina en nulo y `stats` vive durante la llamada.
    if unsafe { libc::statvfs(c_path.as_ptr(), &mut stats) } != 0 {
        return Err("No se pudo leer el espacio de la tarjeta".into());
    }
    Ok(DiskSpace {
        free_bytes: stats.f_bavail as u64 * stats.f_frsize as u64,
        total_bytes: stats.f_blocks as u64 * stats.f_frsize as u64,
    })
}

#[tauri::command(async)]
fn disk_space(state: State<AppState>) -> Result<DiskSpace, String> {
    disk_space_at(&require_root(&state)?)
}

#[tauri::command(async)]
fn read_notes(state: State<AppState>) -> Result<String, String> {
    let _disk = disk_read(&state)?;
    let root = require_root(&state)?;
    let path = root.join(NOTES_FILE);
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(path).map_err(|e| format!("No se pudo leer la libreta: {e}"))
}

#[tauri::command(async)]
fn write_notes(state: State<AppState>, content: String) -> Result<(), String> {
    let _disk = disk_write(&state)?;
    let root = require_root(&state)?;
    write_notes_at(&root.join(NOTES_FILE), &content)
        .map_err(|e| format!("No se pudo guardar la libreta: {e}"))
}

/// Guarda la libreta y conserva la versión anterior en `.bak`, pero solo si
/// tenía pendientes: así vaciarla dos veces no borra también la copia.
fn write_notes_at(path: &Path, content: &str) -> Result<(), String> {
    let previous = fs::read_to_string(path).unwrap_or_default();
    let had_notes = !matches!(previous.trim(), "" | "[]");
    if had_notes && previous.trim() != content.trim() {
        write_atomic_with_backup(path, content.as_bytes())
    } else {
        write_atomic(path, content.as_bytes())
    }
}

#[tauri::command(async)]
fn read_favorites(state: State<AppState>) -> Result<Vec<Favorite>, String> {
    let _disk = disk_read(&state)?;
    let path = require_root(&state)?.join(FAVORITES_FILE);
    match fs::read(&path) {
        Ok(bytes) => Ok(parse_favorites(&bytes)),
        // Otros firmwares no tienen este archivo: simplemente no hay favoritos.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(format!("No se pudieron leer los favoritos: {e}")),
    }
}

#[tauri::command(async)]
fn card_info(state: State<AppState>) -> Result<saves::CardInfo, String> {
    let _disk = disk_write(&state)?;
    saves::read_or_create_card(&require_root(&state)?)
}

#[tauri::command(async)]
fn update_card(
    state: State<AppState>,
    name: String,
    profile: String,
) -> Result<saves::CardInfo, String> {
    let _disk = disk_write(&state)?;
    saves::update_card(&require_root(&state)?, &name, &profile)
}

#[tauri::command(async)]
fn saves_summary(state: State<AppState>) -> Result<saves::SavesSummary, String> {
    let _disk = disk_read(&state)?;
    saves::summarize(&require_root(&state)?)
}

#[tauri::command(async)]
fn list_saves(state: State<AppState>) -> Result<Vec<saves::SaveEntry>, String> {
    let _disk = disk_read(&state)?;
    saves::list_saves(&require_root(&state)?)
}

#[tauri::command(async)]
fn backup_saves(
    state: State<AppState>,
    work_dir: String,
    label: String,
    files: Option<Vec<String>>,
) -> Result<saves::SavesReport, String> {
    let _disk = disk_write(&state)?;
    saves::backup(&require_root(&state)?, &work_dir, &label, files.as_deref())
}

#[tauri::command(async)]
fn clean_orphan_saves(
    state: State<AppState>,
    work_dir: String,
    label: String,
) -> Result<saves::SavesReport, String> {
    let _disk = disk_write(&state)?;
    saves::clean_orphans(&require_root(&state)?, &work_dir, &label)
}

#[tauri::command(async)]
fn list_backups(state: State<AppState>, work_dir: String) -> Result<Vec<saves::BackupInfo>, String> {
    let _disk = disk_write(&state)?;
    saves::list_backups(&require_root(&state)?, &work_dir)
}

#[tauri::command(async)]
fn restore_saves(
    state: State<AppState>,
    work_dir: String,
    folder: String,
    files: Vec<String>,
    label: String,
) -> Result<saves::SavesReport, String> {
    let _disk = disk_write(&state)?;
    saves::restore(&require_root(&state)?, &work_dir, &folder, &files, &label)
}

#[tauri::command(async)]
fn open_backups_folder(state: State<AppState>, work_dir: String) -> Result<(), String> {
    let folder = {
        let _disk = disk_write(&state)?;
        saves::backups_folder(&require_root(&state)?, &work_dir)?
    };
    tauri_plugin_opener::open_path(folder.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("No se pudo abrir la carpeta: {e}"))
}

#[tauri::command(async)]
fn console_sounds(state: State<AppState>, work_dir: String) -> Result<Vec<look::SoundSlot>, String> {
    let _disk = disk_read(&state)?;
    look::list_sounds(&require_root(&state)?, &work_dir)
}

#[tauri::command(async)]
fn read_console_sound(state: State<AppState>, slot: String) -> Result<tauri::ipc::Response, String> {
    let _disk = disk_read(&state)?;
    Ok(tauri::ipc::Response::new(look::read_sound(&require_root(&state)?, &slot)?))
}

/// Recibe el sonido ya convertido (`bytes`) o la ruta de un archivo del PC
/// (`source_path`, para la música, que puede pesar varios MB).
#[tauri::command(async)]
fn replace_console_sound(
    state: State<AppState>,
    work_dir: String,
    slot: String,
    bytes: Option<Vec<u8>>,
    source_path: Option<String>,
) -> Result<look::SoundSlot, String> {
    let bytes = match (bytes, source_path) {
        (Some(bytes), _) => bytes,
        (None, Some(path)) => fs::read(&path).map_err(|e| format!("No se pudo leer el archivo: {e}"))?,
        (None, None) => return Err("Falta el sonido nuevo".into()),
    };
    let _disk = disk_write(&state)?;
    look::replace_sound(&require_root(&state)?, &work_dir, &slot, &bytes)
}

#[tauri::command(async)]
fn restore_console_sound(state: State<AppState>, work_dir: String, slot: String) -> Result<(), String> {
    let _disk = disk_write(&state)?;
    look::restore_sound(&require_root(&state)?, &work_dir, &slot)
}

#[tauri::command(async)]
fn console_backgrounds(state: State<AppState>, work_dir: String) -> Result<Vec<backgrounds::Background>, String> {
    let _disk = disk_read(&state)?;
    backgrounds::list_backgrounds(&require_root(&state)?, &work_dir)
}

#[tauri::command(async)]
fn console_background_preview(state: State<AppState>, name: String) -> Result<tauri::ipc::Response, String> {
    let _disk = disk_read(&state)?;
    Ok(tauri::ipc::Response::new(backgrounds::background_preview(&require_root(&state)?, &name)?))
}

#[tauri::command(async)]
fn replace_console_background(
    state: State<AppState>,
    work_dir: String,
    name: String,
    source_path: String,
) -> Result<(), String> {
    let _disk = disk_write(&state)?;
    backgrounds::replace_background(&require_root(&state)?, &work_dir, &name, Path::new(&source_path))
}

#[tauri::command(async)]
fn restore_console_background(state: State<AppState>, work_dir: String, name: String) -> Result<(), String> {
    let _disk = disk_write(&state)?;
    backgrounds::restore_background(&require_root(&state)?, &work_dir, &name)
}

#[tauri::command(async)]
fn console_logos(state: State<AppState>, work_dir: String) -> Result<Vec<logos::Logo>, String> {
    let _disk = disk_read(&state)?;
    logos::list_logos(&require_root(&state)?, &work_dir)
}

#[tauri::command(async)]
fn console_logo_preview(state: State<AppState>, id: String) -> Result<tauri::ipc::Response, String> {
    let _disk = disk_read(&state)?;
    Ok(tauri::ipc::Response::new(logos::logo_preview(&require_root(&state)?, &id)?))
}

#[tauri::command(async)]
fn replace_console_logo(state: State<AppState>, work_dir: String, id: String, source_path: String) -> Result<(), String> {
    let _disk = disk_write(&state)?;
    logos::replace_logo(&require_root(&state)?, &work_dir, &id, Path::new(&source_path))
}

#[tauri::command(async)]
fn restore_console_logo(state: State<AppState>, work_dir: String, id: String) -> Result<(), String> {
    let _disk = disk_write(&state)?;
    logos::restore_logo(&require_root(&state)?, &work_dir, &id)
}

#[tauri::command(async)]
fn read_sagas(state: State<AppState>) -> Result<String, String> {
    let _disk = disk_read(&state)?;
    let path = require_root(&state)?.join(SAGAS_FILE);
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(path).map_err(|e| format!("No se pudieron leer las sagas: {e}"))
}

#[tauri::command(async)]
fn write_sagas(state: State<AppState>, content: String) -> Result<(), String> {
    let _disk = disk_write(&state)?;
    let root = require_root(&state)?;
    write_atomic(&root.join(SAGAS_FILE), content.as_bytes())
        .map_err(|e| format!("No se pudieron guardar las sagas: {e}"))
}

#[tauri::command(async)]
fn unmount_sd(state: State<AppState>) -> Result<(), String> {
    // Espera a que terminen las escrituras en curso antes de liberar la tarjeta.
    let _disk = disk_write(&state)?;
    let mut root = state
        .root
        .lock()
        .map_err(|_| "Estado interno bloqueado".to_string())?;
    // No se usa `forbid_directory`: en el scope de Tauri lo prohibido gana
    // siempre y no se puede deshacer, así que al volver a conectar la misma
    // tarjeta todas las carátulas salían rotas. Sin raíz activa los comandos
    // ya rechazan cualquier ruta, y el protocolo de assets solo da lectura.
    *root = None;
    Ok(())
}

// ---------------------------------------------------------------------------
// Caché de carátulas: archivos en el directorio de caché de la app.
// Evita el límite de ~5 MB de localStorage con índices grandes.
// ---------------------------------------------------------------------------

fn cache_file(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
    let safe_key: String = key
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if safe_key.is_empty() {
        return Err("Clave de caché inválida".into());
    }
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("No se pudo acceder a la caché: {e}"))?
        .join("artwork");
    fs::create_dir_all(&dir).map_err(|e| format!("No se pudo crear la caché: {e}"))?;
    Ok(dir.join(format!("{safe_key}.json")))
}

#[tauri::command(async)]
fn read_cache(
    app: AppHandle,
    state: State<AppState>,
    key: String,
) -> Result<Option<String>, String> {
    let _disk = disk_read(&state)?;
    let path = cache_file(&app, &key)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path)
        .map(Some)
        .map_err(|e| format!("No se pudo leer la caché: {e}"))
}

#[tauri::command(async)]
fn write_cache(
    app: AppHandle,
    state: State<AppState>,
    key: String,
    value: String,
) -> Result<(), String> {
    let _disk = disk_write(&state)?;
    write_atomic(&cache_file(&app, &key)?, value.as_bytes())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            scan_sd,
            list_games,
            add_games,
            remove_game,
            rename_game,
            reorder_games,
            save_image,
            open_folder,
            disk_space,
            read_notes,
            write_notes,
            read_favorites,
            card_info,
            update_card,
            saves_summary,
            list_saves,
            backup_saves,
            clean_orphan_saves,
            list_backups,
            restore_saves,
            open_backups_folder,
            console_sounds,
            read_console_sound,
            replace_console_sound,
            restore_console_sound,
            console_backgrounds,
            console_background_preview,
            replace_console_background,
            restore_console_background,
            console_logos,
            console_logo_preview,
            replace_console_logo,
            restore_console_logo,
            read_sagas,
            write_sagas,
            read_cache,
            write_cache,
            unmount_sd
        ])
        .run(tauri::generate_context!())
        .expect("error while running Bunko");
}

#[cfg(test)]
mod tests {
    #[test]
    fn disk_space_lee_la_unidad_de_una_carpeta() {
        let dir = std::fs::canonicalize(std::env::temp_dir()).unwrap();
        let space = super::disk_space_at(&dir).unwrap();
        assert!(space.total_bytes > 0);
        assert!(space.free_bytes <= space.total_bytes);
    }

    #[test]
    fn disk_space_falla_si_la_ruta_no_existe() {
        assert!(super::disk_space_at(std::path::Path::new("Z:\\no\\existe")).is_err());
    }

    use super::*;
    use std::process;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    struct TempDir(PathBuf);

    impl TempDir {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "r36s-test-{}-{label}-{}",
                process::id(),
                COUNTER.fetch_add(1, Ordering::Relaxed)
            ));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).expect("crear carpeta temporal");
            TempDir(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn system_dir(label: &str) -> TempDir {
        let dir = TempDir::new(label);
        fs::write(dir.path().join(FILELIST), "Juego A.gba,Alpha\n").unwrap();
        fs::write(dir.path().join("Juego A.gba"), b"rom").unwrap();
        dir
    }

    #[test]
    fn parse_rows_ignora_bom_y_titulos_vacios() {
        let dir = TempDir::new("csv");
        let csv = "\u{feff}Juego A.gba,Alpha\n\nJuego B.gba,\n";
        fs::write(dir.path().join(FILELIST), csv).unwrap();
        let rows = parse_rows(&dir.path().join(FILELIST)).unwrap();
        assert_eq!(rows[0], ("Juego A.gba".to_string(), "Alpha".to_string()));
        assert_eq!(rows[1], ("Juego B.gba".to_string(), String::new()));
        assert_eq!(rows.len(), 2);
    }

    #[test]
    fn write_atomic_no_deja_temporales() {
        let dir = TempDir::new("atomic");
        let path = dir.path().join(FILELIST);
        write_atomic(&path, b"uno\n").unwrap();
        write_atomic(&path, b"dos\n").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "dos\n");
        let leftovers = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_name().to_string_lossy().contains(".tmp"))
            .count();
        assert_eq!(leftovers, 0);
    }

    #[test]
    fn write_notes_no_pisa_la_copia_con_una_lista_vacia() {
        let dir = TempDir::new("notes");
        let path = dir.path().join(NOTES_FILE);
        let backup = dir.path().join(format!("{NOTES_FILE}.bak"));
        write_notes_at(&path, r#"[{"id":"1"}]"#).unwrap();
        write_notes_at(&path, "[]").unwrap();
        write_notes_at(&path, "[]").unwrap();
        assert_eq!(fs::read_to_string(&backup).unwrap(), r#"[{"id":"1"}]"#);
        assert_eq!(fs::read_to_string(&path).unwrap(), "[]");
    }

    #[test]
    fn write_atomic_with_backup_conserva_el_anterior() {
        let dir = TempDir::new("backup");
        let path = dir.path().join(FILELIST);
        fs::write(&path, b"original\n").unwrap();
        write_atomic_with_backup(&path, b"nuevo\n").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "nuevo\n");
        assert_eq!(
            fs::read_to_string(dir.path().join("filelist.csv.bak")).unwrap(),
            "original\n"
        );
    }

    #[test]
    fn el_indice_de_imagenes_resuelve_variantes_de_nombre() {
        let dir = TempDir::new("images");
        let images = dir.path().join("images");
        fs::create_dir_all(&images).unwrap();
        for name in [
            "Juego A.png",
            "Juego A (USA).jpg",
            "Juego A.gba.png",
            "otro.png",
        ] {
            fs::write(images.join(name), b"x").unwrap();
        }
        let index = index_images(dir.path());
        let names = rom_image_names(&index, "Juego A.gba");
        assert!(names.contains(&"Juego A.png".to_string()));
        assert!(names.contains(&"Juego A.gba.png".to_string()));
        assert!(!names.contains(&"Juego A (USA).jpg".to_string()));
        assert!(!names.contains(&"otro.png".to_string()));
    }

    #[test]
    fn el_indice_de_imagenes_acepta_puntos_en_el_nombre() {
        let dir = TempDir::new("images-dots");
        let images = dir.path().join("images");
        fs::create_dir_all(&images).unwrap();
        fs::write(images.join("Super Mario Bros. 3.png"), b"x").unwrap();
        let index = index_images(dir.path());
        assert_eq!(
            rom_image_names(&index, "Super Mario Bros. 3.nes"),
            vec!["Super Mario Bros. 3.png".to_string()]
        );
    }

    #[test]
    fn la_caratula_que_guarda_bunko_gana_a_las_variantes() {
        let dir = TempDir::new("images-prefer");
        let images = dir.path().join("images");
        fs::create_dir_all(&images).unwrap();
        for name in ["Juego A.gba.png", "Juego A.jpg", "Juego A.png"] {
            fs::write(images.join(name), b"x").unwrap();
        }
        let index = index_images(dir.path());
        let names = rom_image_names(&index, "Juego A.gba");
        assert_eq!(names[0], "Juego A.png");
        assert_eq!(names.len(), 3);
    }

    #[test]
    fn list_games_usa_el_indice_una_sola_vez() {
        let dir = system_dir("list");
        fs::create_dir_all(dir.path().join("images")).unwrap();
        fs::write(dir.path().join("images/Juego A.png"), b"x").unwrap();
        let games = list_games_at(dir.path()).unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].title, "Alpha");
        assert!(games[0].has_image);
        assert!(games[0]
            .image_path
            .as_deref()
            .unwrap()
            .ends_with("Juego A.png"));
    }

    #[test]
    fn sin_imagen_cuenta_como_faltante() {
        let dir = system_dir("missing");
        let games = list_games_at(dir.path()).unwrap();
        assert!(!games[0].has_image);
        assert!(games[0].image_path.is_none());
    }

    #[test]
    fn add_game_copia_la_rom_y_actualiza_el_csv() {
        let dir = system_dir("add");
        let sources = TempDir::new("add-sources");
        let source = sources.path().join("Nuevo Juego.gba");
        fs::write(&source, b"rom-nueva").unwrap();
        // PNG 1x1 válido en memoria.
        let png = {
            let img = image::RgbaImage::from_pixel(1, 1, image::Rgba([1, 2, 3, 255]));
            let mut out = Cursor::new(Vec::new());
            image::DynamicImage::ImageRgba8(img)
                .write_to(&mut out, ImageFormat::Png)
                .unwrap();
            out.into_inner()
        };
        let inputs = [NewGameInput {
            source_path: source.to_string_lossy().to_string(),
            title: "Nuevo Juego".to_string(),
            image_bytes: Some(png),
            extract: false,
        }];
        let games = add_games_impl(dir.path(), &inputs).unwrap();
        let game = &games[0];
        assert!(dir.path().join("Nuevo Juego.gba").is_file());
        assert!(dir.path().join("images/Nuevo Juego.png").is_file());
        assert!(game.has_image);
        let rows = parse_rows(&dir.path().join(FILELIST)).unwrap();
        assert!(rows
            .iter()
            .any(|(file, title)| file == "Nuevo Juego.gba" && title == "Nuevo Juego"));
        // La copia de seguridad del catálogo anterior existe.
        assert!(dir.path().join("filelist.csv.bak").is_file());
    }

    #[test]
    fn add_game_con_imagen_invalida_no_escribe_nada() {
        let dir = system_dir("add-bad-image");
        let sources = TempDir::new("add-bad-image-sources");
        let source = sources.path().join("Roto.gba");
        fs::write(&source, b"rom").unwrap();
        let before = fs::read_to_string(dir.path().join(FILELIST)).unwrap();
        let inputs = [NewGameInput {
            source_path: source.to_string_lossy().to_string(),
            title: "Roto".to_string(),
            image_bytes: Some(b"no es una imagen".to_vec()),
            extract: false,
        }];
        let error = add_games_impl(dir.path(), &inputs);
        assert!(error.is_err());
        assert!(!dir.path().join("Roto.gba").exists());
        assert_eq!(
            fs::read_to_string(dir.path().join(FILELIST)).unwrap(),
            before
        );
    }

    #[test]
    fn add_game_duplicado_falla_sin_tocar_el_csv() {
        let dir = system_dir("duplicate");
        let before = fs::read_to_string(dir.path().join(FILELIST)).unwrap();
        let source = dir.path().join("Juego A.gba");
        let inputs = [NewGameInput {
            source_path: source.to_string_lossy().to_string(),
            title: "Otro".to_string(),
            image_bytes: None,
            extract: false,
        }];
        let error = add_games_impl(dir.path(), &inputs);
        assert!(error.is_err());
        assert_eq!(
            fs::read_to_string(dir.path().join(FILELIST)).unwrap(),
            before
        );
    }

    #[test]
    fn add_games_copia_varios_y_escribe_el_csv_una_sola_vez() {
        let dir = system_dir("add-batch");
        let sources = TempDir::new("add-batch-sources");
        let source_b = sources.path().join("Juego B.gba");
        let source_c = sources.path().join("Juego C.gba");
        fs::write(&source_b, b"rom-b").unwrap();
        fs::write(&source_c, b"rom-c").unwrap();

        let png = {
            let img = image::RgbaImage::from_pixel(1, 1, image::Rgba([1, 2, 3, 255]));
            let mut out = Cursor::new(Vec::new());
            image::DynamicImage::ImageRgba8(img)
                .write_to(&mut out, ImageFormat::Png)
                .unwrap();
            out.into_inner()
        };

        let before = fs::read_to_string(dir.path().join(FILELIST)).unwrap();
        let inputs = [
            NewGameInput {
                source_path: source_b.to_string_lossy().to_string(),
                title: "Juego B".to_string(),
                image_bytes: Some(png),
                extract: false,
            },
            NewGameInput {
                source_path: source_c.to_string_lossy().to_string(),
                title: "Juego C".to_string(),
                image_bytes: None,
                extract: false,
            },
        ];
        let games = add_games_impl(dir.path(), &inputs).unwrap();
        assert_eq!(games.len(), 2);
        assert!(dir.path().join("Juego B.gba").is_file());
        assert!(dir.path().join("Juego C.gba").is_file());
        assert!(dir.path().join("images/Juego B.png").is_file());
        let rows = parse_rows(&dir.path().join(FILELIST)).unwrap();
        assert!(rows.iter().any(|(f, t)| f == "Juego B.gba" && t == "Juego B"));
        assert!(rows.iter().any(|(f, t)| f == "Juego C.gba" && t == "Juego C"));
        // La copia de seguridad conserva el CSV original completo.
        assert_eq!(
            fs::read_to_string(dir.path().join("filelist.csv.bak")).unwrap(),
            before
        );
    }

    #[test]
    fn add_games_con_duplicado_en_el_lote_no_escribe_nada() {
        let dir = system_dir("add-batch-dup");
        let sources = TempDir::new("add-batch-dup-sources");
        let source = sources.path().join("Nuevo.gba");
        fs::write(&source, b"rom").unwrap();
        let before = fs::read_to_string(dir.path().join(FILELIST)).unwrap();
        let inputs = [
            NewGameInput {
                source_path: source.to_string_lossy().to_string(),
                title: "Nuevo".to_string(),
                image_bytes: None,
                extract: false,
            },
            NewGameInput {
                source_path: source.to_string_lossy().to_string(),
                title: "Nuevo".to_string(),
                image_bytes: None,
                extract: false,
            },
        ];
        let error = add_games_impl(dir.path(), &inputs);
        assert!(error.is_err());
        assert!(!dir.path().join("Nuevo.gba").exists());
        assert_eq!(fs::read_to_string(dir.path().join(FILELIST)).unwrap(), before);
    }

    #[test]
    fn remove_game_conserva_la_rom() {
        let dir = system_dir("remove");
        remove_game_impl(dir.path(), "Juego A.gba").unwrap();
        assert!(!parse_rows(&dir.path().join(FILELIST))
            .unwrap()
            .iter()
            .any(|(file, _)| file == "Juego A.gba"));
        assert!(dir.path().join("Juego A.gba").is_file());
    }

    #[test]
    fn path_within_rechaza_rutas_fuera_de_la_raiz() {
        let root = TempDir::new("root");
        let outside = TempDir::new("outside");
        fs::write(outside.path().join("secreto.txt"), b"x").unwrap();
        let result = path_within(root.path(), &outside.path().join("secreto.txt"));
        assert!(result.is_err());
    }

    #[test]
    fn path_within_acepta_rutas_dentro_de_la_raiz() {
        let root = TempDir::new("root-ok");
        let inside = root.path().join("gba");
        fs::create_dir_all(&inside).unwrap();
        fs::write(inside.join("filelist.csv"), b"").unwrap();
        assert!(path_within(root.path(), &inside).is_ok());
    }

    #[test]
    fn parse_favorites_lee_sistema_y_archivo() {
        let bytes = b"GBA/Mother 3 (T-ESP).gba|Mother 3 (T-ESP)|MOTHER 3 (T-ESP)\nFC/Mario.zip|Mario\n\0";
        assert_eq!(
            parse_favorites(bytes),
            vec![
                Favorite { system: "GBA".into(), file_name: "Mother 3 (T-ESP).gba".into() },
                Favorite { system: "FC".into(), file_name: "Mario.zip".into() },
            ]
        );
        assert!(parse_favorites(b"\0").is_empty());
        assert!(parse_favorites(b"sin-sistema.zip|x\r\n").is_empty());
    }

    #[test]
    fn rename_game_cambia_solo_el_titulo() {
        let dir = system_dir("rename");
        rename_game_impl(dir.path(), "Juego A.gba", "  Nuevo nombre ").unwrap();
        let rows = parse_rows(&dir.path().join(FILELIST)).unwrap();
        assert_eq!(rows, vec![("Juego A.gba".to_string(), "Nuevo nombre".to_string())]);
        assert!(dir.path().join("Juego A.gba").is_file());
        assert!(rename_game_impl(dir.path(), "Juego A.gba", "  ").is_err());
        assert!(rename_game_impl(dir.path(), "No existe.gba", "X").is_err());
    }

    #[test]
    fn reorder_games_reescribe_el_csv_en_el_orden_pedido() {
        let dir = system_dir("reorder");
        fs::write(dir.path().join(FILELIST), "a.gba,Alpha
b.gba,Beta
c.gba,Gamma
").unwrap();
        let order: Vec<String> = ["c.gba", "a.gba", "b.gba"].map(String::from).to_vec();
        reorder_games_impl(dir.path(), &order).unwrap();
        let files: Vec<String> = parse_rows(&dir.path().join(FILELIST))
            .unwrap()
            .into_iter()
            .map(|(file, _)| file)
            .collect();
        assert_eq!(files, order);
    }

    #[test]
    fn reorder_games_rechaza_un_orden_incompleto_o_repetido() {
        let dir = system_dir("reorder-bad");
        fs::write(dir.path().join(FILELIST), "a.gba,Alpha
b.gba,Beta
").unwrap();
        let before = fs::read_to_string(dir.path().join(FILELIST)).unwrap();
        for order in [vec!["a.gba"], vec!["a.gba", "a.gba"], vec!["a.gba", "x.gba"]] {
            let order: Vec<String> = order.into_iter().map(String::from).collect();
            assert!(reorder_games_impl(dir.path(), &order).is_err());
        }
        assert_eq!(fs::read_to_string(dir.path().join(FILELIST)).unwrap(), before);
    }

    fn write_zip(path: &Path, entries: &[(&str, &[u8])]) {
        let mut writer = zip::ZipWriter::new(File::create(path).unwrap());
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        for (name, bytes) in entries {
            writer.start_file(*name, options).unwrap();
            writer.write_all(bytes).unwrap();
        }
        writer.finish().unwrap();
    }

    fn write_7z(path: &Path, name: &str, bytes: &[u8]) {
        let mut writer = sevenz_rust2::ArchiveWriter::create(path).unwrap();
        writer
            .push_archive_entry(sevenz_rust2::ArchiveEntry::new_file(name), Some(bytes))
            .unwrap();
        writer.finish().unwrap();
    }

    fn extract_input(source: &Path) -> NewGameInput {
        NewGameInput {
            source_path: source.to_string_lossy().to_string(),
            title: "Extraído".to_string(),
            image_bytes: None,
            extract: true,
        }
    }

    #[test]
    fn add_games_extrae_la_rom_de_un_zip() {
        let dir = system_dir("extract-zip");
        let sources = TempDir::new("extract-zip-sources");
        let source = sources.path().join("Paquete.zip");
        write_zip(&source, &[("carpeta/Juego Z.gba", b"rom-zip")]);
        let games = add_games_impl(dir.path(), &[extract_input(&source)]).unwrap();
        assert_eq!(games[0].file_name, "Juego Z.gba");
        assert_eq!(fs::read(dir.path().join("Juego Z.gba")).unwrap(), b"rom-zip");
        assert!(!dir.path().join("Paquete.zip").exists());
        let rows = parse_rows(&dir.path().join(FILELIST)).unwrap();
        assert!(rows.iter().any(|(f, t)| f == "Juego Z.gba" && t == "Extraído"));
    }

    #[test]
    fn add_games_extrae_la_rom_de_un_7z() {
        let dir = system_dir("extract-7z");
        let sources = TempDir::new("extract-7z-sources");
        let source = sources.path().join("Paquete.7z");
        write_7z(&source, "Juego S.nes", b"rom-7z");
        add_games_impl(dir.path(), &[extract_input(&source)]).unwrap();
        assert_eq!(fs::read(dir.path().join("Juego S.nes")).unwrap(), b"rom-7z");
    }

    #[test]
    fn add_games_sin_extraer_copia_el_comprimido() {
        let dir = system_dir("keep-zip");
        let sources = TempDir::new("keep-zip-sources");
        let source = sources.path().join("Paquete.zip");
        write_zip(&source, &[("Juego K.gba", b"rom")]);
        let mut input = extract_input(&source);
        input.extract = false;
        add_games_impl(dir.path(), &[input]).unwrap();
        assert!(dir.path().join("Paquete.zip").is_file());
        assert!(!dir.path().join("Juego K.gba").exists());
    }

    #[test]
    fn add_games_con_varios_archivos_en_el_zip_no_escribe_nada() {
        let dir = system_dir("extract-multi");
        let sources = TempDir::new("extract-multi-sources");
        let source = sources.path().join("Disco.zip");
        write_zip(&source, &[("Disco.cue", b"cue"), ("Disco.bin", b"bin")]);
        let before = fs::read_to_string(dir.path().join(FILELIST)).unwrap();
        let error = add_games_impl(dir.path(), &[extract_input(&source)])
            .err()
            .expect("debe fallar");
        assert!(error.contains("2 archivos"));
        assert_eq!(fs::read_to_string(dir.path().join(FILELIST)).unwrap(), before);
    }

    #[test]
    fn add_games_extraido_duplicado_falla() {
        let dir = system_dir("extract-dup");
        let sources = TempDir::new("extract-dup-sources");
        let source = sources.path().join("Otro nombre.zip");
        write_zip(&source, &[("Juego A.gba", b"rom")]);
        assert!(add_games_impl(dir.path(), &[extract_input(&source)]).is_err());
    }
}
