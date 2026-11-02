use image::ImageFormat;
use serde::Serialize;
use std::{fs, io::Cursor, path::{Path, PathBuf}};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Game { id: String, file_name: String, title: String, image_name: Option<String>, image_path: Option<String>, has_image: bool }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct System { id: String, name: String, path: String, game_count: usize, missing_images: usize }

fn validate_path(path: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(path);
    if !p.exists() || !p.is_dir() { return Err("La ruta indicada no existe o no es una carpeta".into()); }
    Ok(p)
}

fn parse_rows(path: &Path) -> Result<Vec<(String, String)>, String> {
    if !path.exists() { return Ok(Vec::new()); }
    let data = fs::read(path).map_err(|e| e.to_string())?;
    let mut reader = csv::ReaderBuilder::new().has_headers(false).flexible(true).from_reader(data.as_slice());
    let mut rows = Vec::new();
    for row in reader.records() {
        let row = row.map_err(|e| format!("CSV inválido: {e}"))?;
        let file = row.get(0).unwrap_or("").trim().trim_start_matches('\u{feff}').to_string();
        if file.is_empty() { continue; }
        let title = row.get(1).unwrap_or("").trim().to_string();
        rows.push((file, if title.is_empty() { String::new() } else { title }));
    }
    Ok(rows)
}

fn system_name(path: &Path) -> String { path.file_name().and_then(|n| n.to_str()).unwrap_or("Emulador").replace('_', " ").replace('-', " ") }

fn list_games_at(path: &Path) -> Result<Vec<Game>, String> {
    let rows = parse_rows(&path.join("filelist.csv"))?;
    let mut games = Vec::new();
    for (file_name, listed_title) in rows {
        let stem = Path::new(&file_name).file_stem().and_then(|s| s.to_str()).unwrap_or(&file_name).to_string();
        let title = if listed_title.is_empty() { stem.clone() } else { listed_title };
        let candidates = rom_image_paths(path, &file_name)?;
        let found = candidates.first().cloned();
        let image_path = found.as_ref().map(|p| p.to_string_lossy().to_string());
        let image_name = found.as_ref().and_then(|p| p.file_name()).and_then(|n| n.to_str()).map(str::to_string);
        let has_image = found.is_some();
        games.push(Game { id: file_name.clone(), file_name, title, image_name, image_path, has_image });
    }
    Ok(games)
}

#[tauri::command]
fn scan_sd(root: String) -> Result<Vec<System>, String> {
    let root = validate_path(&root)?;
    let mut systems = Vec::new();
    for entry in fs::read_dir(&root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_dir() { continue; }
        let path = entry.path();
        if !path.join("filelist.csv").is_file() { continue; }
        let games = list_games_at(&path)?;
        let missing_images = games.iter().filter(|g| rom_image_paths(&path, &g.file_name).map(|paths| paths.is_empty()).unwrap_or(true)).count();
        systems.push(System { id: path.to_string_lossy().to_string(), name: system_name(&path), path: path.to_string_lossy().to_string(), game_count: games.len(), missing_images });
    }
    systems.sort_by(|a,b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(systems)
}

#[tauri::command]
fn list_games(system_path: String) -> Result<Vec<Game>, String> { list_games_at(&validate_path(&system_path)?) }

fn rom_image_paths(dir: &Path, file_name: &str) -> Result<Vec<PathBuf>, String> {
    let stem = Path::new(file_name).file_stem().and_then(|s| s.to_str()).ok_or("Nombre inválido")?;
    let extensions = ["png", "jpg", "jpeg", "webp"];
    let mut names = extensions.iter().flat_map(|ext| [format!("{file_name}.{ext}"), format!("{stem}.{ext}")]).collect::<Vec<_>>();
    if let Ok(entries) = fs::read_dir(dir.join("images")) {
        for entry in entries.flatten() {
            if !entry.file_type().map(|kind| kind.is_file()).unwrap_or(false) { continue; }
            let candidate = entry.file_name().to_string_lossy().to_string();
            if candidate.to_lowercase().starts_with(&format!("{stem}.")) { names.push(candidate); }
        }
    }
    let mut paths = names.into_iter()
        .map(|name| dir.join("images").join(name)).filter(|path| path.is_file())
        .collect::<Vec<_>>();
    paths.sort();
    paths.dedup();
    Ok(paths)
}

#[tauri::command]
fn add_game(system_path: String, source_path: String, title: String, image_bytes: Option<Vec<u8>>) -> Result<Game, String> {
    let dir = validate_path(&system_path)?;
    let source = PathBuf::from(source_path);
    if !source.is_file() { return Err("Selecciona un archivo de juego válido".into()); }
    let file_name = source.file_name().and_then(|n| n.to_str()).ok_or("Nombre de archivo inválido")?.to_string();
    let destination = dir.join(&file_name);
    if destination.exists() { return Err("Ese juego ya existe en la carpeta del emulador".into()); }
    fs::copy(&source, &destination).map_err(|e| format!("No se pudo copiar el juego: {e}"))?;
    let mut image_name = None;
    let has_image = image_bytes.is_some();
    let mut image_to_save = None;
    if let Some(bytes) = image_bytes {
        let images = dir.join("images");
        fs::create_dir_all(&images).map_err(|e| e.to_string())?;
        let name = format!("{}.png", Path::new(&file_name).file_stem().and_then(|s| s.to_str()).unwrap_or("game"));
        image_to_save = Some((name.clone(), images.join(&name), bytes));
        image_name = Some(name);
    }
    let csv_path = dir.join("filelist.csv");
    let mut rows = parse_rows(&csv_path)?;
    rows.push((file_name.clone(), title.trim().to_string()));
    let mut writer = csv::WriterBuilder::new().has_headers(false).from_writer(Vec::new());
    for (file, game_title) in rows { writer.write_record([file, game_title]).map_err(|e| e.to_string())?; }
    let output = writer.into_inner().map_err(|e| e.to_string())?;
    fs::write(csv_path, output).map_err(|e| e.to_string())?;
    if let Some((_name, image_path, bytes)) = image_to_save {
        let decoded = image::load_from_memory(&bytes).map_err(|e| format!("El juego se copió y el catálogo se actualizó, pero la imagen no se pudo leer: {e}"))?;
        let mut output = Cursor::new(Vec::new());
        decoded.resize_exact(512, 512, image::imageops::FilterType::Lanczos3).write_to(&mut output, ImageFormat::Png).map_err(|e| e.to_string())?;
        fs::write(image_path, output.into_inner()).map_err(|e| e.to_string())?;
    }
    let stem = Path::new(&file_name).file_stem().and_then(|s| s.to_str()).unwrap_or(&file_name).to_string();
    Ok(Game { id: file_name.clone(), title: if title.trim().is_empty() { stem } else { title.trim().into() }, file_name, image_path: image_name.as_ref().map(|n| dir.join("images").join(n).to_string_lossy().to_string()), image_name, has_image })
}

#[tauri::command]
fn remove_game(system_path: String, file_name: String) -> Result<(), String> {
    let dir = validate_path(&system_path)?;
    let safe_name = Path::new(&file_name).file_name().and_then(|n| n.to_str()).ok_or("Nombre inválido")?;
    let mut rows = parse_rows(&dir.join("filelist.csv"))?;
    let original_len = rows.len();
    rows.retain(|(file, _)| file != safe_name);
    if rows.len() == original_len { return Err("No se encontró el juego en filelist.csv".into()); }
    let mut writer = csv::WriterBuilder::new().has_headers(false).from_writer(Vec::new());
    for (file, title) in rows { writer.write_record([file, title]).map_err(|e| e.to_string())?; }
    let output = writer.into_inner().map_err(|e| e.to_string())?;
    fs::write(dir.join("filelist.csv"), output).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn rom_candidates(system_path: String, file_name: String) -> Result<Vec<String>, String> {
    let dir = validate_path(&system_path)?;
    Ok(rom_image_paths(&dir, &file_name)?.iter().map(|p| p.to_string_lossy().to_string()).collect())
}

#[tauri::command]
fn save_image(system_path: String, file_name: String, image_bytes: Vec<u8>) -> Result<String, String> {
    let dir = validate_path(&system_path)?;
    let stem = Path::new(&file_name).file_stem().and_then(|s| s.to_str()).ok_or("Nombre inválido")?;
    if !parse_rows(&dir.join("filelist.csv"))?.iter().any(|(f, _)| f == &file_name) { return Err("El juego no existe en filelist.csv".into()); }
    let images = dir.join("images");
    fs::create_dir_all(&images).map_err(|e| e.to_string())?;
    let decoded = image::load_from_memory(&image_bytes).map_err(|e| format!("La imagen no se pudo leer: {e}"))?;
    let mut output = Cursor::new(Vec::new());
    decoded.resize_exact(512, 512, image::imageops::FilterType::Lanczos3).write_to(&mut output, ImageFormat::Png).map_err(|e| e.to_string())?;
    let destination = images.join(format!("{stem}.png"));
    fs::write(&destination, output.into_inner()).map_err(|e| e.to_string())?;
    Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
fn read_image(path: String) -> Result<Vec<u8>, String> { fs::read(path).map_err(|e| e.to_string()) }

#[tauri::command]
fn read_notes(path: String) -> Result<String, String> { let p = PathBuf::from(path); if !p.exists() { return Ok(String::new()); } fs::read_to_string(p).map_err(|e| e.to_string()) }

#[tauri::command]
fn write_notes(path: String, content: String) -> Result<(), String> { fs::write(PathBuf::from(path), content).map_err(|e| e.to_string()) }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![scan_sd, list_games, add_game, remove_game, rom_candidates, save_image, read_image, read_notes, write_notes])
        .run(tauri::generate_context!())
        .expect("error while running R36S Manager");
}
