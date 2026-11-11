//! Edición mínima de ZIP con entradas comprimidas (como `cubegm/resource.cpd`).
//!
//! Para no cambiar nada que el firmware pueda notar, el archivo se reconstruye
//! copiando byte a byte las cabeceras originales (versión, banderas, fechas,
//! campos extra) y solo se reescriben los datos, el CRC, los tamaños y los
//! desplazamientos de la entrada cambiada.

use flate2::{read::DeflateDecoder, write::DeflateEncoder, Compression};
use std::io::{Read, Write};

#[derive(Clone, Debug)]
pub struct ZipEntry {
    pub name: String,
    /// Registro completo en el directorio central.
    central: std::ops::Range<usize>,
    /// Cabecera local (30 bytes + nombre + extra).
    local: std::ops::Range<usize>,
    /// Datos tal como están guardados (comprimidos o no).
    stored: std::ops::Range<usize>,
    method: u16,
    /// Tamaño sin comprimir.
    pub size: usize,
}

fn u16_at(bytes: &[u8], pos: usize) -> u16 {
    u16::from_le_bytes([bytes[pos], bytes[pos + 1]])
}

fn u32_at(bytes: &[u8], pos: usize) -> u32 {
    u32::from_le_bytes(bytes[pos..pos + 4].try_into().unwrap())
}

fn eocd(bytes: &[u8]) -> Option<usize> {
    let last = bytes.len().checked_sub(22)?;
    (0..=last).rev().find(|&i| bytes[i..].starts_with(b"PK\x05\x06"))
}

/// Lee el directorio central. Acepta entradas guardadas o con deflate, sin
/// cifrado ni descriptor de datos; si no, se niega a editar el archivo.
pub fn read_entries(bytes: &[u8], label: &str) -> Result<Vec<ZipEntry>, String> {
    let invalid = || format!("{label} tiene un formato que Bunko no sabe editar");
    let end = eocd(bytes).ok_or_else(invalid)?;
    let count = u16_at(bytes, end + 10) as usize;
    let mut pos = u32_at(bytes, end + 16) as usize;
    let mut entries = Vec::with_capacity(count);
    for _ in 0..count {
        if pos + 46 > bytes.len() || !bytes[pos..].starts_with(b"PK\x01\x02") {
            return Err(invalid());
        }
        let flags = u16_at(bytes, pos + 8);
        let method = u16_at(bytes, pos + 10);
        let packed = u32_at(bytes, pos + 20) as usize;
        let size = u32_at(bytes, pos + 24) as usize;
        let name_len = u16_at(bytes, pos + 28) as usize;
        let record_len = 46 + name_len + u16_at(bytes, pos + 30) as usize + u16_at(bytes, pos + 32) as usize;
        let local = u32_at(bytes, pos + 42) as usize;
        if flags & 0x0009 != 0 || !(method == 0 || method == 8) || pos + record_len > bytes.len() {
            return Err(invalid());
        }
        if local + 30 > bytes.len() || !bytes[local..].starts_with(b"PK\x03\x04") {
            return Err(invalid());
        }
        let local_end = local + 30 + u16_at(bytes, local + 26) as usize + u16_at(bytes, local + 28) as usize;
        if local_end + packed > bytes.len() {
            return Err(invalid());
        }
        entries.push(ZipEntry {
            name: String::from_utf8_lossy(&bytes[pos + 46..pos + 46 + name_len]).to_string(),
            central: pos..pos + record_len,
            local: local..local_end,
            stored: local_end..local_end + packed,
            method,
            size,
        });
        pos += record_len;
    }
    Ok(entries)
}

/// Contenido descomprimido de una entrada.
pub fn read_data(bytes: &[u8], entry: &ZipEntry) -> Result<Vec<u8>, String> {
    let stored = &bytes[entry.stored.clone()];
    let data = if entry.method == 0 {
        stored.to_vec()
    } else {
        let mut out = Vec::with_capacity(entry.size);
        DeflateDecoder::new(stored)
            .read_to_end(&mut out)
            .map_err(|e| format!("No se pudo leer {}: {e}", entry.name))?;
        out
    };
    if data.len() != entry.size {
        return Err(format!("{} está dañado", entry.name));
    }
    Ok(data)
}

/// Reconstruye el ZIP cambiando los datos de la entrada `name`.
pub fn replace(bytes: &[u8], entries: &[ZipEntry], name: &str, data: &[u8]) -> Result<Vec<u8>, String> {
    let target = entries
        .iter()
        .find(|entry| entry.name == name)
        .ok_or_else(|| format!("No se encontró {name}"))?;
    let packed = if target.method == 0 {
        data.to_vec()
    } else {
        let mut encoder = DeflateEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(data).map_err(|e| e.to_string())?;
        encoder.finish().map_err(|e| e.to_string())?
    };
    let crc = crc32fast::hash(data);

    let mut out = Vec::with_capacity(bytes.len() + packed.len());
    let mut central = Vec::new();
    for entry in entries {
        let offset = out.len() as u32;
        let mut local = bytes[entry.local.clone()].to_vec();
        let mut record = bytes[entry.central.clone()].to_vec();
        let stored: &[u8] = if entry.name == name {
            local[14..18].copy_from_slice(&crc.to_le_bytes());
            local[18..22].copy_from_slice(&(packed.len() as u32).to_le_bytes());
            local[22..26].copy_from_slice(&(data.len() as u32).to_le_bytes());
            record[16..20].copy_from_slice(&crc.to_le_bytes());
            record[20..24].copy_from_slice(&(packed.len() as u32).to_le_bytes());
            record[24..28].copy_from_slice(&(data.len() as u32).to_le_bytes());
            &packed
        } else {
            &bytes[entry.stored.clone()]
        };
        record[42..46].copy_from_slice(&offset.to_le_bytes());
        out.extend(&local);
        out.extend(stored);
        central.extend(&record);
    }
    let end = eocd(bytes).ok_or("Archivo dañado")?;
    let mut tail = bytes[end..].to_vec();
    let central_offset = out.len() as u32;
    tail[12..16].copy_from_slice(&(central.len() as u32).to_le_bytes());
    tail[16..20].copy_from_slice(&central_offset.to_le_bytes());
    out.extend(&central);
    out.extend(&tail);

    // Comprobación de seguridad antes de devolverlo: misma lista de entradas y
    // la cambiada se lee igual que lo que se quería escribir.
    let check = read_entries(&out, name)?;
    if check.len() != entries.len() {
        return Err("No se pudo reconstruir el archivo".into());
    }
    let written = check.iter().find(|entry| entry.name == name).ok_or("No se pudo reconstruir el archivo")?;
    if read_data(&out, written)? != data {
        return Err("No se pudo reconstruir el archivo".into());
    }
    Ok(out)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// ZIP con entradas deflate y campos extra en el directorio central, como
    /// los que genera la herramienta del firmware.
    pub(crate) fn sample(files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut out = Vec::new();
        let mut central = Vec::new();
        for (name, data) in files {
            let mut encoder = DeflateEncoder::new(Vec::new(), Compression::default());
            encoder.write_all(data).unwrap();
            let packed = encoder.finish().unwrap();
            let crc = crc32fast::hash(data);
            let offset = out.len() as u32;
            let fields = |buf: &mut Vec<u8>| {
                buf.extend(0u16.to_le_bytes());
                buf.extend(8u16.to_le_bytes());
                buf.extend(0x5d61_0c32u32.to_le_bytes());
                buf.extend(crc.to_le_bytes());
                buf.extend((packed.len() as u32).to_le_bytes());
                buf.extend((data.len() as u32).to_le_bytes());
                buf.extend((name.len() as u16).to_le_bytes());
            };
            out.extend(b"PK\x03\x04");
            out.extend(20u16.to_le_bytes());
            fields(&mut out);
            out.extend(0u16.to_le_bytes());
            out.extend(name.as_bytes());
            out.extend(&packed);
            central.extend(b"PK\x01\x02");
            central.extend(31u16.to_le_bytes());
            central.extend(20u16.to_le_bytes());
            fields(&mut central);
            central.extend(4u16.to_le_bytes()); // extra
            central.extend([0u8; 6]); // comentario, disco, atributos internos
            central.extend(0x20u32.to_le_bytes());
            central.extend(offset.to_le_bytes());
            central.extend(name.as_bytes());
            central.extend([0xAA, 0xBB, 0xCC, 0xDD]);
        }
        let offset = out.len() as u32;
        out.extend(&central);
        out.extend(b"PK\x05\x06");
        out.extend([0u8; 4]);
        out.extend((files.len() as u16).to_le_bytes());
        out.extend((files.len() as u16).to_le_bytes());
        out.extend((central.len() as u32).to_le_bytes());
        out.extend(offset.to_le_bytes());
        out.extend(0u16.to_le_bytes());
        out
    }

    #[test]
    fn cambia_una_entrada_y_conserva_las_demas_byte_a_byte() {
        let zip = sample(&[("a.raw", &[1u8; 5000]), ("b.raw", &[2u8; 300]), ("ui.cfg", b"hola")]);
        let entries = read_entries(&zip, "test").unwrap();
        assert_eq!(read_data(&zip, &entries[1]).unwrap(), vec![2u8; 300]);

        let out = replace(&zip, &entries, "b.raw", &[9u8; 400]).unwrap();
        let after = read_entries(&out, "test").unwrap();
        assert_eq!(after.iter().map(|e| e.name.as_str()).collect::<Vec<_>>(), ["a.raw", "b.raw", "ui.cfg"]);
        assert_eq!(read_data(&out, &after[0]).unwrap(), vec![1u8; 5000]);
        assert_eq!(read_data(&out, &after[1]).unwrap(), vec![9u8; 400]);
        assert_eq!(read_data(&out, &after[2]).unwrap(), b"hola");
        // Los campos extra del directorio central se conservan.
        assert!(out.windows(4).any(|w| w == [0xAA, 0xBB, 0xCC, 0xDD]));
        // Volver a poner los datos originales deja el archivo idéntico.
        let back = replace(&out, &after, "b.raw", &[2u8; 300]).unwrap();
        assert_eq!(back, zip);
    }

    #[test]
    fn rechaza_archivos_que_no_son_zip() {
        assert!(read_entries(b"no es un zip, solo texto suelto de prueba", "x").is_err());
    }
}
