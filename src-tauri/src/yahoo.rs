//! Yahoo Finance chart 接口封装。
//!
//! 放在 Rust 侧而不是前端，是因为 WebView 里 fetch Yahoo 会被 CORS 拦截；
//! Rust 侧直接走 HTTP 没有这个限制，也不需要 API key。

use chrono::{TimeZone, Utc};
use serde::{Deserialize, Serialize};

const BASE: &str = "https://query1.finance.yahoo.com/v8/finance/chart";

/// Yahoo 会拒绝 reqwest 的默认 User-Agent，必须伪装成浏览器
const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Yahoo 响应结构（只声明我们要用的字段）
// ---------------------------------------------------------------------------

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct ChartResponse {
    chart: Chart,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Chart {
    result: Option<Vec<ChartResult>>,
    error: Option<ChartError>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct ChartError {
    code: Option<String>,
    description: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct ChartResult {
    meta: Meta,
    timestamp: Option<Vec<i64>>,
    indicators: Indicators,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Meta {
    symbol: Option<String>,
    currency: Option<String>,
    short_name: Option<String>,
    long_name: Option<String>,
    full_exchange_name: Option<String>,
    exchange_name: Option<String>,
    regular_market_price: Option<f64>,
    previous_close: Option<f64>,
    chart_previous_close: Option<f64>,
    regular_market_time: Option<i64>,
    current_trading_period: Option<TradingPeriods>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct TradingPeriods {
    pre: Option<Period>,
    regular: Option<Period>,
    post: Option<Period>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Period {
    start: Option<i64>,
    end: Option<i64>,
}

impl Period {
    fn contains(&self, ts: i64) -> bool {
        match (self.start, self.end) {
            (Some(s), Some(e)) => ts >= s && ts < e,
            _ => false,
        }
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Indicators {
    quote: Option<Vec<QuoteBlock>>,
    adjclose: Option<Vec<AdjCloseBlock>>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct QuoteBlock {
    close: Option<Vec<Option<f64>>>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct AdjCloseBlock {
    adjclose: Option<Vec<Option<f64>>>,
}

// ---------------------------------------------------------------------------
// 对前端暴露的结构
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SymbolQuote {
    pub symbol: String,
    pub name: Option<String>,
    /// 常规时段最新价
    pub regular_price: Option<f64>,
    /// 含盘前/盘后的最新价
    pub latest_price: Option<f64>,
    pub previous_close: Option<f64>,
    pub currency: Option<String>,
    /// pre / regular / post / closed
    pub session: String,
    pub as_of: Option<String>,
    pub error: Option<String>,
}

impl SymbolQuote {
    pub fn failed(symbol: &str, message: String) -> Self {
        Self {
            symbol: symbol.trim().to_uppercase(),
            name: None,
            regular_price: None,
            latest_price: None,
            previous_close: None,
            currency: None,
            session: "closed".into(),
            as_of: None,
            error: Some(message),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailySeries {
    pub symbol: String,
    pub dates: Vec<String>,
    pub closes: Vec<f64>,
    pub error: Option<String>,
}

impl DailySeries {
    pub fn failed(symbol: &str, message: String) -> Self {
        Self {
            symbol: symbol.trim().to_uppercase(),
            dates: Vec::new(),
            closes: Vec::new(),
            error: Some(message),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SymbolInfo {
    pub symbol: String,
    pub name: Option<String>,
    pub currency: Option<String>,
    pub exchange: Option<String>,
    pub price: Option<f64>,
}

// ---------------------------------------------------------------------------
// 请求
// ---------------------------------------------------------------------------

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(UA)
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败：{e}"))
}

fn normalize(symbol: &str) -> String {
    symbol.trim().to_uppercase()
}

fn to_iso(ts: i64) -> Option<String> {
    Utc.timestamp_opt(ts, 0).single().map(|dt| dt.to_rfc3339())
}

fn to_date(ts: i64) -> Option<String> {
    Utc.timestamp_opt(ts, 0)
        .single()
        .map(|dt| dt.format("%Y-%m-%d").to_string())
}

async fn fetch_chart(symbol: &str, query: &[(&str, &str)]) -> Result<ChartResult, String> {
    let sym = normalize(symbol);
    if sym.is_empty() {
        return Err("代码不能为空".into());
    }

    let url = format!("{BASE}/{sym}");
    let resp = client()?
        .get(&url)
        .query(query)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                format!("请求 {sym} 超时，检查网络后重试")
            } else if e.is_connect() {
                format!("无法连接 Yahoo Finance（{sym}），检查网络或代理")
            } else {
                format!("请求 {sym} 失败：{e}")
            }
        })?;

    let status = resp.status();
    let body = resp
        .text()
        .await
        .map_err(|e| format!("读取 {sym} 响应失败：{e}"))?;

    if status == reqwest::StatusCode::NOT_FOUND {
        return Err(format!("找不到代码 {sym}"));
    }
    if !status.is_success() && body.is_empty() {
        return Err(format!("Yahoo 返回 {status}（{sym}）"));
    }

    let parsed: ChartResponse =
        serde_json::from_str(&body).map_err(|e| format!("解析 {sym} 响应失败：{e}"))?;

    if let Some(err) = parsed.chart.error {
        let desc = err
            .description
            .or(err.code)
            .unwrap_or_else(|| "未知错误".into());
        return Err(format!("{sym}：{desc}"));
    }

    parsed
        .chart
        .result
        .and_then(|mut r| if r.is_empty() { None } else { Some(r.remove(0)) })
        .ok_or_else(|| format!("找不到代码 {sym} 的行情数据"))
}

/// 从分钟序列里取最后一个非空收盘价及其时间戳
fn last_valid_point(result: &ChartResult) -> Option<(i64, f64)> {
    let timestamps = result.timestamp.as_ref()?;
    let closes = result.indicators.quote.as_ref()?.first()?.close.as_ref()?;

    let len = timestamps.len().min(closes.len());
    for i in (0..len).rev() {
        if let Some(price) = closes[i] {
            if price.is_finite() && price > 0.0 {
                return Some((timestamps[i], price));
            }
        }
    }
    None
}

/// 按时间戳落在哪个交易时段来判定 session
fn classify_session(meta: &Meta, ts: Option<i64>) -> String {
    let Some(ts) = ts else {
        return "closed".into();
    };
    let Some(periods) = meta.current_trading_period.as_ref() else {
        return "closed".into();
    };

    if periods.regular.as_ref().is_some_and(|p| p.contains(ts)) {
        return "regular".into();
    }
    if periods.pre.as_ref().is_some_and(|p| p.contains(ts)) {
        return "pre".into();
    }
    if periods.post.as_ref().is_some_and(|p| p.contains(ts)) {
        return "post".into();
    }
    "closed".into()
}

/// 拉单只标的的最新报价（含盘前/盘后）
pub async fn fetch_quote(symbol: &str) -> Result<SymbolQuote, String> {
    let result = fetch_chart(
        symbol,
        &[
            ("interval", "1m"),
            ("range", "1d"),
            ("includePrePost", "true"),
        ],
    )
    .await?;

    let meta = &result.meta;
    let (ts, latest) = match last_valid_point(&result) {
        Some((t, p)) => (Some(t), Some(p)),
        None => (meta.regular_market_time, meta.regular_market_price),
    };

    Ok(SymbolQuote {
        symbol: meta.symbol.clone().unwrap_or_else(|| normalize(symbol)),
        name: meta.long_name.clone().or_else(|| meta.short_name.clone()),
        regular_price: meta.regular_market_price,
        latest_price: latest.or(meta.regular_market_price),
        previous_close: meta.chart_previous_close.or(meta.previous_close),
        currency: meta.currency.clone(),
        session: classify_session(meta, ts),
        as_of: ts.and_then(to_iso),
        error: None,
    })
}

/// 拉单只标的的日线序列，用于波动率估算与倍数回归
pub async fn fetch_series(symbol: &str, range: &str) -> Result<DailySeries, String> {
    let result = fetch_chart(symbol, &[("interval", "1d"), ("range", range)]).await?;

    let timestamps = result.timestamp.clone().unwrap_or_default();
    // 优先用复权价，缺失时回退原始收盘价
    let raw: Vec<Option<f64>> = result
        .indicators
        .adjclose
        .as_ref()
        .and_then(|blocks| blocks.first())
        .and_then(|b| b.adjclose.clone())
        .or_else(|| {
            result
                .indicators
                .quote
                .as_ref()
                .and_then(|blocks| blocks.first())
                .and_then(|b| b.close.clone())
        })
        .unwrap_or_default();

    let mut dates = Vec::new();
    let mut closes = Vec::new();
    for i in 0..timestamps.len().min(raw.len()) {
        if let Some(price) = raw[i] {
            if price.is_finite() && price > 0.0 {
                if let Some(date) = to_date(timestamps[i]) {
                    dates.push(date);
                    closes.push(price);
                }
            }
        }
    }

    Ok(DailySeries {
        symbol: result.meta.symbol.clone().unwrap_or_else(|| normalize(symbol)),
        dates,
        closes,
        error: None,
    })
}

/// 校验代码是否存在并回显基本信息
pub async fn resolve(symbol: &str) -> Result<SymbolInfo, String> {
    let result = fetch_chart(symbol, &[("interval", "1d"), ("range", "1d")]).await?;
    let meta = &result.meta;

    Ok(SymbolInfo {
        symbol: meta.symbol.clone().unwrap_or_else(|| normalize(symbol)),
        name: meta.long_name.clone().or_else(|| meta.short_name.clone()),
        currency: meta.currency.clone(),
        exchange: meta
            .full_exchange_name
            .clone()
            .or_else(|| meta.exchange_name.clone()),
        price: meta.regular_market_price,
    })
}
