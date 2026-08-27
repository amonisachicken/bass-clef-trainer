//! 低音谱号训练器核心库（纯 Rust，不依赖 GUI / Tauri，可独立测试）。
//!
//! - [`notes`]：音高 ↔ 音名 / 低音谱表位置换算
//! - [`quiz`]：练习题生成与答案判定
//! - [`store`]：设置与统计数据的 JSON 持久化

pub mod notes;
pub mod quiz;
pub mod store;
