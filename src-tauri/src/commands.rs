//! 暴露给前端的 Tauri 命令。
//!
//! 约定：所有命令返回 `Result<T, String>`，错误信息为可直接展示的中文。
//! 配对拉取做逐只失败隔离——一只代码写错不影响另一只的结果。

use chrono::Utc;
use serde::Serialize;

use crate::yahoo::{self, DailySeries, SymbolInfo, SymbolQuote};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairQuote {
    pub underlying: SymbolQuote,
    pub leveraged: SymbolQuote,
    pub fetched_at: String,
}

/// 一次拉取配对两端的报价（并发请求）
#[tauri::command]
pub async fn fetch_pair_quote(underlying: String, leveraged: String) -> Result<PairQuote, String> {
    let (a, b) = tokio::join!(
        yahoo::fetch_quote(&underlying),
        yahoo::fetch_quote(&leveraged)
    );

    Ok(PairQuote {
        underlying: a.unwrap_or_else(|e| SymbolQuote::failed(&underlying, e)),
        leveraged: b.unwrap_or_else(|e| SymbolQuote::failed(&leveraged, e)),
        fetched_at: Utc::now().to_rfc3339(),
    })
}

/// 拉一批标的的日线序列，供波动率估算与倍数回归使用
#[tauri::command]
pub async fn fetch_daily_series(
    symbols: Vec<String>,
    range: Option<String>,
) -> Result<Vec<DailySeries>, String> {
    let range = range.unwrap_or_else(|| "3mo".into());

    let mut out = Vec::with_capacity(symbols.len());
    for symbol in symbols {
        let series = yahoo::fetch_series(&symbol, &range)
            .await
            .unwrap_or_else(|e| DailySeries::failed(&symbol, e));
        out.push(series);
    }
    Ok(out)
}

/// 校验代码是否存在，回显名称/交易所/现价
#[tauri::command]
pub async fn resolve_symbol(symbol: String) -> Result<SymbolInfo, String> {
    yahoo::resolve(&symbol).await
}
