pub mod commands;
pub mod yahoo;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::fetch_pair_quote,
            commands::fetch_daily_series,
            commands::resolve_symbol,
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}
