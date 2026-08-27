//! 练习题的生成与答案判定。

use rand::Rng;
use serde::{Deserialize, Serialize};

use crate::notes::{self, Accidental};

/// 练习模式。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Mode {
    /// 看谱弹键：谱表显示音符，用户在钢琴上点对应琴键。
    StaffToPiano,
    /// 看键认谱：高亮琴键，用户在谱表上点对应音位。
    PianoToStaff,
}

impl Mode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Mode::StaffToPiano => "staffToPiano",
            Mode::PianoToStaff => "pianoToStaff",
        }
    }
}

/// 一道练习题。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Question {
    pub id: u64,
    pub mode: Mode,
    /// 题目的音高（MIDI）。
    pub midi: u8,
    /// 正确答案的音名。
    pub name: String,
}

/// 出题参数（取自用户设置）。
#[derive(Debug, Clone)]
pub struct QuestionGen {
    pub min_midi: u8,
    pub max_midi: u8,
    pub allow_accidentals: bool,
}

impl QuestionGen {
    /// 在音域内随机取一个音；不允许升降号时只取自然音（白键）。
    fn pick_midi<R: Rng>(&self, rng: &mut R) -> u8 {
        debug_assert!(self.min_midi <= self.max_midi);
        if self.min_midi > self.max_midi {
            return self.min_midi; // 防御：非法范围退化为固定值
        }
        loop {
            let m = rng.gen_range(self.min_midi..=self.max_midi);
            if self.allow_accidentals || notes::is_natural(m) {
                return m;
            }
        }
    }

    pub fn generate<R: Rng>(&self, rng: &mut R, mode: Mode, id: u64) -> Question {
        let midi = self.pick_midi(rng);
        let accidental = if self.allow_accidentals {
            Accidental::Sharp
        } else {
            Accidental::None
        };
        let name = notes::name_of(midi, accidental);
        Question { id, mode, midi, name }
    }
}

/// 用户提交的答案：钢琴键 / 谱表音位（MIDI 音高）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AnswerInput {
    Midi(u8),
}

/// 判断答案是否正确。
pub fn check_answer(q: &Question, input: &AnswerInput) -> bool {
    match input {
        AnswerInput::Midi(m) => *m == q.midi,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gen(allow: bool) -> QuestionGen {
        QuestionGen {
            min_midi: 36,
            max_midi: 60,
            allow_accidentals: allow,
        }
    }

    #[test]
    fn generated_midi_stays_in_range_and_natural() {
        let g = gen(false);
        for _ in 0..300 {
            let q = g.generate(&mut rand::thread_rng(), Mode::StaffToPiano, 1);
            assert!((36..=60).contains(&q.midi), "超出音域: {}", q.midi);
            assert!(notes::is_natural(q.midi), "不允许升降号时不应出现黑键: {}", q.midi);
        }
        let g2 = gen(true);
        for _ in 0..300 {
            let q = g2.generate(&mut rand::thread_rng(), Mode::StaffToPiano, 1);
            assert!((36..=60).contains(&q.midi));
        }
    }

    #[test]
    fn answer_checking() {
        let q = Question {
            id: 1,
            mode: Mode::StaffToPiano,
            midi: 45,
            name: "B2".into(),
        };
        assert!(check_answer(&q, &AnswerInput::Midi(45)));
        assert!(!check_answer(&q, &AnswerInput::Midi(60)));
    }

    #[test]
    fn custom_range_respected() {
        let g = QuestionGen {
            min_midi: 43,
            max_midi: 43,
            allow_accidentals: true,
        };
        let q = g.generate(&mut rand::thread_rng(), Mode::PianoToStaff, 3);
        assert_eq!(q.midi, 43);
        assert_eq!(q.name, "G2");
    }
}
