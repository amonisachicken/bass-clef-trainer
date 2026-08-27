mod commands;

use std::sync::Mutex;

use bass_clef_core::quiz::Question;
use bass_clef_core::store::{Profile, Store};
use tauri::Manager;

/// 应用全局状态：数据存储、用户档案、当前题目与自增编号。
pub struct AppState {
    store: Mutex<Store>,
    profile: Mutex<Profile>,
    current_question: Mutex<Option<Question>>,
    next_id: Mutex<u64>,
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("无法确定应用数据目录");
            // 档案路径示例：
            //   Linux:   ~/.local/share/com.basscleftrainer.desktop/profile.json
            //   macOS:   ~/Library/Application Support/com.basscleftrainer.desktop/profile.json
            //   Windows: %APPDATA%\com.basscleftrainer.desktop\profile.json
            let store = Store::new(data_dir.join("profile.json"));
            let profile = store.load();
            app.manage(AppState {
                store: Mutex::new(store),
                profile: Mutex::new(profile),
                current_question: Mutex::new(None),
                next_id: Mutex::new(1),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_profile,
            commands::save_settings,
            commands::generate_question,
            commands::submit_answer,
            commands::reset_stats,
            commands::get_note_info
        ])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用失败");
}
