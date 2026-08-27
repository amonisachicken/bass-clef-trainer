//! 音乐理论基础：音高（MIDI）与音名、低音谱表（F 谱号）位置之间的换算。
//!
//! 低音谱表五线四间（从下往上）：
//! - 线：G2 B2 D3 F3 A3（F 线为第 4 线，即谱号两点所指）
//! - 间：A2 C3 E3 G3
//! - 下加一线 E2，上加一线 C4（中央 C）

use serde::{Deserialize, Serialize};

/// 低音谱表最下线（第一线）G2 的 MIDI 编号。
pub const MIDI_LINE1_G2: u8 = 43;
/// 中央 C。
pub const MIDI_C4: u8 = 60;

/// 变音记号的展示偏好。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Accidental {
    None,
    Sharp,
    Flat,
}

/// 返回 MIDI 音高对应的音名，如 `C4`、`F#2`、`Bb3`。
pub fn name_of(midi: u8, accidental: Accidental) -> String {
    let pc = midi % 12;
    let oct = i32::from(midi) / 12 - 1;
    let (letter, acc) = match (pc, accidental) {
        (0, _) => ('C', ""),
        (1, Accidental::Flat) => ('D', "b"),
        (1, _) => ('C', "#"),
        (2, _) => ('D', ""),
        (3, Accidental::Flat) => ('E', "b"),
        (3, _) => ('D', "#"),
        (4, _) => ('E', ""),
        (5, _) => ('F', ""),
        (6, Accidental::Flat) => ('G', "b"),
        (6, _) => ('F', "#"),
        (7, _) => ('G', ""),
        (8, Accidental::Flat) => ('A', "b"),
        (8, _) => ('G', "#"),
        (9, _) => ('A', ""),
        (10, Accidental::Flat) => ('B', "b"),
        (10, _) => ('A', "#"),
        (11, _) => ('B', ""),
        _ => unreachable!("midi % 12 取值范围为 0..=11"),
    };
    format!("{letter}{acc}{oct}")
}

/// 全音阶位置：C=0, D=1, …, B=6，每升高一个八度 +7。
/// 同一个全音阶位置对应多个音高（升/降 C 与 C 位置相同）。
pub fn diatonic_index(midi: u8) -> i32 {
    let oct = i32::from(midi) / 12;
    let step = match midi % 12 {
        0 | 1 => 0,
        2 | 3 => 1,
        4 => 2,
        5 | 6 => 3,
        7 | 8 => 4,
        9 | 10 => 5,
        11 => 6,
        _ => unreachable!(),
    };
    oct * 7 + step
}

/// G2 的全音阶位置（`diatonic_index(43)` = 25）。
pub const BASS_LINE1_DIATONIC: i32 = 25;

/// 相对低音谱表的音位：0 = 最下线 G2，1 = 第一间 A2，2 = 第二线 B2，……
/// 负数为下加线区域，≥ 10 为上加线区域。
pub fn staff_position(midi: u8) -> i32 {
    diatonic_index(midi) - BASS_LINE1_DIATONIC
}

/// 该音位是否落在线上（偶数 = 线，奇数 = 间）。
pub fn is_on_line(pos: i32) -> bool {
    pos % 2 == 0
}

/// 需要绘制的下加线数量（pos ≤ -2 的偶数位，如 E2 一条、C2 两条）。
pub fn ledger_lines_below(pos: i32) -> u32 {
    if pos <= -2 {
        ((-pos + 1) / 2) as u32
    } else {
        0
    }
}

/// 需要绘制的上加线数量（pos ≥ 10 的偶数位，如 C4 一条、D4 两条）。
pub fn ledger_lines_above(pos: i32) -> u32 {
    if pos >= 10 {
        ((pos - 10) / 2 + 1) as u32
    } else {
        0
    }
}

/// 是否白键（自然音）。
pub fn is_natural(midi: u8) -> bool {
    matches!(midi % 12, 0 | 2 | 4 | 5 | 7 | 9 | 11)
}

/// MIDI 音高 → 频率（Hz），A4 = 440Hz。
pub fn freq_of(midi: u8) -> f64 {
    440.0 * 2f64.powf((f64::from(midi) - 69.0) / 12.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_correct() {
        assert_eq!(name_of(60, Accidental::None), "C4");
        assert_eq!(name_of(36, Accidental::None), "C2");
        assert_eq!(name_of(43, Accidental::None), "G2");
        assert_eq!(name_of(52, Accidental::None), "E3");
        assert_eq!(name_of(59, Accidental::None), "B3");
        assert_eq!(name_of(21, Accidental::None), "A0");
        assert_eq!(name_of(108, Accidental::None), "C8");
        assert_eq!(name_of(61, Accidental::Sharp), "C#4");
        assert_eq!(name_of(61, Accidental::Flat), "Db4");
        assert_eq!(name_of(70, Accidental::Sharp), "A#4");
        assert_eq!(name_of(70, Accidental::Flat), "Bb4");
    }

    #[test]
    fn staff_positions_match_bass_clef() {
        // 五线：G2 B2 D3 F3 A3 / 四间：A2 C3 E3 G3
        assert_eq!(staff_position(43), 0); // 一线 G2
        assert_eq!(staff_position(45), 1); // 一间 A2
        assert_eq!(staff_position(47), 2); // 二线 B2
        assert_eq!(staff_position(48), 3); // 二间 C3
        assert_eq!(staff_position(50), 4); // 三线 D3
        assert_eq!(staff_position(52), 5); // 三间 E3
        assert_eq!(staff_position(53), 6); // 四线 F3（F 谱号所指）
        assert_eq!(staff_position(55), 7); // 四间 G3
        assert_eq!(staff_position(57), 8); // 五线 A3
        assert_eq!(staff_position(59), 9); // 五线上方间 B3
        assert_eq!(staff_position(60), 10); // 上加一线 C4（中央 C）
        assert_eq!(staff_position(36), -4); // 下加二线 C2
        assert_eq!(staff_position(40), -2); // 下加一线 E2
    }

    #[test]
    fn ledger_lines() {
        assert_eq!(ledger_lines_below(0), 0);
        assert_eq!(ledger_lines_below(-1), 0);
        assert_eq!(ledger_lines_below(-2), 1);
        assert_eq!(ledger_lines_below(-4), 2);
        assert_eq!(ledger_lines_below(-6), 3);
        assert_eq!(ledger_lines_above(9), 0);
        assert_eq!(ledger_lines_above(10), 1);
        assert_eq!(ledger_lines_above(12), 2);
        assert_eq!(ledger_lines_above(14), 3);
    }

    #[test]
    fn naturals_and_frequency() {
        assert!(is_natural(60));
        assert!(!is_natural(61));
        assert!(!is_natural(70));
        assert!((freq_of(69) - 440.0).abs() < 1e-9);
        assert!((freq_of(60) - 261.6256).abs() < 1e-2);
    }
}
