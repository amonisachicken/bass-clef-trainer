//! 用户设置与学习统计的 JSON 持久化（原子写入：临时文件 + rename）。

use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// 用户设置。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// 练习音域下限（MIDI）。
    pub min_midi: u8,
    /// 练习音域上限（MIDI）。
    pub max_midi: u8,
    /// 是否包含升降号（黑键）。
    pub allow_accidentals: bool,
    /// 钢琴键上是否显示音名。
    pub show_key_labels: bool,
    /// 是否显示对照表。
    pub show_cheat_sheet: bool,
    /// 是否播放提示音。
    pub sound: bool,
    /// 答对后是否自动进入下一题。
    pub auto_next: bool,
    /// 上次使用的练习模式。
    pub mode: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            min_midi: 41, // F2
            max_midi: 59, // B3
            allow_accidentals: false,
            show_key_labels: true,
            show_cheat_sheet: false,
            sound: true,
            auto_next: true,
            mode: "staffToPiano".into(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModeStats {
    pub attempts: u64,
    pub correct: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayStats {
    pub attempts: u64,
    pub correct: u64,
}

/// 学习统计。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub total_attempts: u64,
    pub correct: u64,
    pub wrong: u64,
    pub current_streak: u64,
    pub best_streak: u64,
    pub by_mode: BTreeMap<String, ModeStats>,
    pub by_day: BTreeMap<String, DayStats>,
}

impl Stats {
    /// 记录一次作答并更新连对、分模式与分日统计。
    pub fn record(&mut self, mode: &str, correct: bool) {
        self.total_attempts += 1;
        if correct {
            self.correct += 1;
            self.current_streak += 1;
            self.best_streak = self.best_streak.max(self.current_streak);
        } else {
            self.wrong += 1;
            self.current_streak = 0;
        }
        let ms = self.by_mode.entry(mode.to_string()).or_default();
        ms.attempts += 1;
        if correct {
            ms.correct += 1;
        }
        let ds = self.by_day.entry(today_key()).or_default();
        ds.attempts += 1;
        if correct {
            ds.correct += 1;
        }
    }

    /// 累计正确率（0–100）。
    pub fn accuracy(&self) -> f64 {
        if self.total_attempts == 0 {
            0.0
        } else {
            self.correct as f64 / self.total_attempts as f64 * 100.0
        }
    }

    /// 今日统计。
    pub fn today(&self) -> DayStats {
        self.by_day.get(&today_key()).cloned().unwrap_or_default()
    }

    /// 今日正确率（0–100）。
    pub fn today_accuracy(&self) -> f64 {
        let t = self.today();
        if t.attempts == 0 {
            0.0
        } else {
            t.correct as f64 / t.attempts as f64 * 100.0
        }
    }
}

/// 以 UTC 天数作为“今天”的键（与前端 JS 的算法保持一致）。
fn today_key() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    (secs / 86_400).to_string()
}

/// 用户档案：设置 + 统计。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub settings: Settings,
    pub stats: Stats,
}

impl Default for Profile {
    fn default() -> Self {
        Self {
            settings: Settings::default(),
            stats: Stats::default(),
        }
    }
}

/// 文件存储：加载失败或文件损坏时回退到默认档案。
pub struct Store {
    path: PathBuf,
}

impl Store {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn load(&self) -> Profile {
        match fs::read_to_string(&self.path) {
            Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
            Err(_) => Profile::default(),
        }
    }

    pub fn save(&self, profile: &Profile) -> io::Result<()> {
        if let Some(dir) = self.path.parent() {
            fs::create_dir_all(dir)?;
        }
        let tmp = self.path.with_extension("json.tmp");
        let text = serde_json::to_string_pretty(profile)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        fs::write(&tmp, text)?;
        fs::rename(&tmp, &self.path)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stats_recording() {
        let mut s = Stats::default();
        s.record("staffToPiano", true);
        s.record("staffToPiano", true);
        s.record("name", false);
        assert_eq!(s.total_attempts, 3);
        assert_eq!(s.correct, 2);
        assert_eq!(s.wrong, 1);
        assert_eq!(s.current_streak, 0);
        assert_eq!(s.best_streak, 2);
        assert_eq!(s.by_mode["staffToPiano"].attempts, 2);
        assert_eq!(s.by_mode["staffToPiano"].correct, 2);
        assert_eq!(s.by_mode["name"].correct, 0);
        assert!((s.accuracy() - 66.666).abs() < 0.01);
        assert_eq!(s.today().attempts, 3);
    }

    #[test]
    fn store_roundtrip() {
        let dir = std::env::temp_dir().join(format!("bass-clef-test-{}", std::process::id()));
        let store = Store::new(dir.join("profile.json"));
        let mut p = Profile::default();
        p.settings.min_midi = 40;
        p.settings.allow_accidentals = true;
        p.stats.record("staffToPiano", true);
        store.save(&p).unwrap();

        let loaded = store.load();
        assert_eq!(loaded.settings.min_midi, 40);
        assert!(loaded.settings.allow_accidentals);
        assert_eq!(loaded.stats.total_attempts, 1);
        assert_eq!(loaded.stats.correct, 1);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_file_falls_back_to_default() {
        let dir = std::env::temp_dir().join(format!("bass-clef-missing-{}", std::process::id()));
        let store = Store::new(dir.join("nope.json"));
        let p = store.load();
        assert_eq!(p.settings.min_midi, 41);
        assert_eq!(p.settings.max_midi, 59);
        assert_eq!(p.stats.total_attempts, 0);
        let _ = fs::remove_dir_all(&dir);
    }
}
