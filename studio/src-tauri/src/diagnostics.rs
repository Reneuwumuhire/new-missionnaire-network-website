//! Persistent Studio diagnostics. A dated file keeps earlier sessions available
//! after an app restart, and each line records its local timestamp and offset.

use chrono::{DateTime, FixedOffset, Local};
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct Logs {
	dir: PathBuf,
	write_lock: Mutex<()>,
}

impl Logs {
	pub fn new(dir: PathBuf) -> Self {
		Self { dir, write_lock: Mutex::new(()) }
	}

	pub fn directory(&self) -> &Path {
		&self.dir
	}

	pub fn append(&self, source: &str, message: &str) -> io::Result<()> {
		self.append_at(source, message, Local::now().fixed_offset())
	}

	fn append_at(&self, source: &str, message: &str, at: DateTime<FixedOffset>) -> io::Result<()> {
		let _guard = self.write_lock.lock().map_err(|error| io::Error::other(error.to_string()))?;
		fs::create_dir_all(&self.dir)?;
		let path = self.dir.join(format!("studio-{}.log", at.format("%Y-%m-%d")));
		let mut file = OpenOptions::new().create(true).append(true).open(path)?;
		let stamp = at.format("%Y-%m-%d %H:%M:%S%.3f %:z");
		for line in message.lines() {
			writeln!(file, "[{stamp}] [{source}] {}", line.trim_end_matches('\r'))?;
		}
		Ok(())
	}
}

/** ffmpeg errors sometimes repeat full RTMP URLs. Logs must never retain stream keys. */
pub fn redact_stream_urls(message: &str) -> String {
	let mut output = String::with_capacity(message.len());
	let mut remaining = message;
	while let Some(start) = ["rtmp://", "rtmps://"].iter().filter_map(|scheme| remaining.find(scheme)).min() {
		output.push_str(&remaining[..start]);
		remaining = &remaining[start..];
		let end = remaining.find(|c: char| c.is_whitespace() || "|\"'<>),;".contains(c))
			.unwrap_or(remaining.len());
		let address = &remaining[..end];
		if let Some((head, key)) = address.rsplit_once('/') {
			if !key.is_empty() && head.contains("://") {
				output.push_str(head);
				output.push_str("/***");
			} else {
				output.push_str(address);
			}
		} else {
			output.push_str(address);
		}
		remaining = &remaining[end..];
	}
	output.push_str(remaining);
	output
}

#[cfg(test)]
mod tests {
	use super::*;
	use chrono::{TimeZone, Utc};

	#[test]
	fn keeps_sessions_in_daily_files_with_timestamped_lines() {
		let dir = std::env::temp_dir().join(format!("studio-logs-test-{}", std::process::id()));
		let _ = fs::remove_dir_all(&dir);
		let logs = Logs::new(dir.clone());
		let first = Utc.with_ymd_and_hms(2026, 10, 14, 21, 30, 0).unwrap().fixed_offset();
		let next = Utc.with_ymd_and_hms(2026, 10, 15, 0, 0, 0).unwrap().fixed_offset();
		logs.append_at("studio", "Started\nSource restored", first).unwrap();
		logs.append_at("ffmpeg", "encoder warning", first).unwrap();
		logs.append_at("studio", "Started", next).unwrap();
		let day_one = fs::read_to_string(dir.join("studio-2026-10-14.log")).unwrap();
		assert!(day_one.contains("[2026-10-14 21:30:00.000 +00:00] [studio] Source restored"));
		assert!(day_one.contains("[ffmpeg] encoder warning"));
		assert_eq!(day_one.lines().count(), 3);
		assert_eq!(fs::read_to_string(dir.join("studio-2026-10-15.log")).unwrap().lines().count(), 1);
		fs::remove_dir_all(dir).unwrap();
	}

	#[test]
	fn removes_every_stream_key_from_a_diagnostic_line() {
		let line = "failed rtmp://one/live/secret1 | rtmps://two/live/secret2: rejected";
		let safe = redact_stream_urls(line);
		assert!(!safe.contains("secret1"));
		assert!(!safe.contains("secret2"));
		assert!(safe.contains("rtmp://one/live/***"));
		assert!(safe.contains("rtmps://two/live/***"));
	}
}
