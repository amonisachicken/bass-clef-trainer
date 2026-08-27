//! Tauri 命令：前端通过 `window.__TAURI__.core.invoke` 调用。
//!
//! 出题、答题判定、统计更新等权威逻辑全部在 `bass-clef-core` 核心库中，
//! 本文件只做参数转接与状态管理。

use serde::Serialize;
use tauri::State;

use bass_clef_core::notes::{self, Accidental};
use bass_clef_core::quiz::{self, AnswerInput, Mode, Question, QuestionGen};
use bass_clef_core::store::{Profile, Settings, Stats};

use crate::AppState;

/// 读取用户档案（设置 + 统计）。
#[tauri::command]
pub fn get_profile(state: State<'_, AppState>) -> Profile {
    state.profile.lock().unwrap().clone()
}

/// 保存设置（立即写入磁盘；设置变化会使当前题目失效）。
#[tauri::command]
pub fn save_settings(
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<(), String> {
    // 防御：保证 min ≤ max（前端已校验，这里兜底）
    let mut settings = settings;
    if settings.min_midi > settings.max_midi {
        std::mem::swap(&mut settings.min_midi, &mut settings.max_midi);
    }
    let mut profile = state.profile.lock().unwrap();
    profile.settings = settings;
    state
        .store
        .lock()
        .unwrap()
        .save(&profile)
        .map_err(|e| e.to_string())?;
    // 注意：不要在此清空 current_question——
    // 前端"切换模式"等路径会同时发出 save_settings 与 generate_question，
    // 若此处清空会与 generate_question 产生竞态，导致后续提交报"没有待回答的题目"。
    // 前端每次设置变更后都会重新生成题目覆盖旧题，旧题短暂残留无碍。
    Ok(())
}

/// 按当前设置生成一道新题，并记为“当前题目”。
#[tauri::command]
pub fn generate_question(state: State<'_, AppState>, mode: Mode) -> Result<Question, String> {
    let profile = state.profile.lock().unwrap();
    let gen = QuestionGen {
        min_midi: profile.settings.min_midi,
        max_midi: profile.settings.max_midi,
        allow_accidentals: profile.settings.allow_accidentals,
    };
    drop(profile);

    let id = {
        let mut guard = state.next_id.lock().unwrap();
        let id = *guard;
        *guard += 1;
        id
    };
    let question = gen.generate(&mut rand::thread_rng(), mode, id);
    *state.current_question.lock().unwrap() = Some(question.clone());
    Ok(question)
}

/// 提交答案，更新统计并返回结果。
#[tauri::command]
pub fn submit_answer(
    state: State<'_, AppState>,
    input: AnswerInput,
) -> Result<AnswerResult, String> {
    let question = state
        .current_question
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "当前没有待回答的题目".to_string())?;

    let correct = quiz::check_answer(&question, &input);

    let mut profile = state.profile.lock().unwrap();
    profile.stats.record(question.mode.as_str(), correct);
    // 统计写入失败不阻塞作答
    let _ = state.store.lock().unwrap().save(&profile);

    Ok(AnswerResult {
        correct,
        correct_name: question.name.clone(),
        correct_midi: question.midi,
        mode: question.mode.as_str().to_string(),
        stats: profile.stats.clone(),
    })
}

/// 重置全部统计。
#[tauri::command]
pub fn reset_stats(state: State<'_, AppState>) -> Result<(), String> {
    let mut profile = state.profile.lock().unwrap();
    profile.stats = Stats::default();
    state
        .store
        .lock()
        .unwrap()
        .save(&profile)
        .map_err(|e| e.to_string())
}

/// 查询某个音的完整信息（供前端渲染 / 调试，逻辑与核心库一致）。
#[tauri::command]
pub fn get_note_info(state: State<'_, AppState>, midi: u8) -> Result<NoteInfo, String> {
    let profile = state.profile.lock().unwrap();
    let accidental = if profile.settings.allow_accidentals {
        Accidental::Sharp
    } else {
        Accidental::None
    };
    let pos = notes::staff_position(midi);
    Ok(NoteInfo {
        midi,
        name: notes::name_of(midi, accidental),
        staff_position: pos,
        is_line: notes::is_on_line(pos),
        ledger_below: notes::ledger_lines_below(pos),
        ledger_above: notes::ledger_lines_above(pos),
        freq: notes::freq_of(midi),
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerResult {
    pub correct: bool,
    pub correct_name: String,
    pub correct_midi: u8,
    pub mode: String,
    pub stats: Stats,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteInfo {
    pub midi: u8,
    pub name: String,
    pub staff_position: i32,
    pub is_line: bool,
    pub ledger_below: u32,
    pub ledger_above: u32,
    pub freq: f64,
}
