//! 练习题的生成与答案判定。

use rand::seq::SliceRandom;
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
    /// 音名问答：谱表显示音符，用户从选项中选出音名。
    Name,
}

impl Mode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Mode::StaffToPiano => "staffToPiano",
            Mode::PianoToStaff => "pianoToStaff",
            Mode::Name => "name",
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
    /// 命名模式的多选题选项；其他模式为空数组。
    pub options: Vec<String>,
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
        let options = if mode == Mode::Name {
            self.distractors(rng, midi, accidental)
        } else {
            Vec::new()
        };
        Question {
            id,
            mode,
            midi,
            name,
            options,
        }
    }

    /// 为命名题生成 3 个干扰项（与正确答案合计 4 个选项，随机打乱）。
    fn distractors<R: Rng>(&self, rng: &mut R, midi: u8, accidental: Accidental) -> Vec<String> {
        let correct = notes::name_of(midi, accidental);
        let mut pool: Vec<String> = (0..24u16)
            .filter_map(|d| {
                let off = d as i16 - 12;
                let m = i16::from(midi) + off;
                if !(21..=108).contains(&m) {
                    return None;
                }
                if !self.allow_accidentals && !notes::is_natural(m as u8) {
                    return None;
                }
                let n = notes::name_of(m as u8, accidental);
                (n != correct).then_some(n)
            })
            .collect();
        pool.sort();
        pool.dedup();

        let mut chosen = Vec::new();
        while chosen.len() < 3 && !pool.is_empty() {
            let i = rng.gen_range(0..pool.len());
            chosen.push(pool.swap_remove(i));
        }

        let mut options = vec![correct];
        options.extend(chosen);
        options.shuffle(rng);
        options
    }
}

/// 用户提交的答案。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AnswerInput {
    /// 钢琴键 / 谱表音位：直接提交 MIDI 音高。
    Midi(u8),
    /// 音名文本。
    Name(String),
}

/// 判断答案是否正确（音名比较忽略大小写与全角变体）。
pub fn check_answer(q: &Question, input: &AnswerInput) -> bool {
    match input {
        AnswerInput::Midi(m) => *m == q.midi,
        AnswerInput::Name(n) => normalize_name(n) == q.name.to_lowercase(),
    }
}

fn normalize_name(s: &str) -> String {
    // 全角字符（U+FF01..=U+FF5E）先转半角，如 Ｂ２ → B2
    let half: String = s
        .trim()
        .chars()
        .map(|c| {
            let u = c as u32;
            if (0xFF01..=0xFF5E).contains(&u) {
                char::from_u32(u - 0xFEE0).unwrap_or(c)
            } else {
                c
            }
        })
        .collect();
    half.replace('♯', "#")
        .replace('♭', "b")
        .to_lowercase()
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
    fn name_question_has_four_options_including_answer() {
        let g = gen(true);
        for _ in 0..50 {
            let q = g.generate(&mut rand::thread_rng(), Mode::Name, 7);
            assert_eq!(q.options.len(), 4, "选项应为 4 个: {:?}", q.options);
            assert!(q.options.contains(&q.name), "选项应包含正确答案");
            assert_eq!(q.mode, Mode::Name);
        }
    }

    #[test]
    fn answer_checking() {
        let q = Question {
            id: 1,
            mode: Mode::StaffToPiano,
            midi: 45,
            name: "B2".into(),
            options: vec![],
        };
        assert!(check_answer(&q, &AnswerInput::Midi(45)));
        assert!(!check_answer(&q, &AnswerInput::Midi(60)));

        let qn = Question {
            id: 2,
            mode: Mode::Name,
            midi: 45,
            name: "B2".into(),
            options: vec![],
        };
        assert!(check_answer(&qn, &AnswerInput::Name(" b2 ".into())));
        assert!(check_answer(&qn, &AnswerInput::Name("Ｂ２".into())));
        assert!(!check_answer(&qn, &AnswerInput::Name("C2".into())));
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
