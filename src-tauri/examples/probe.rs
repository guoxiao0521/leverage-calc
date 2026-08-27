//! 手工探针：cargo run --example probe -- NBIS NEBX
//! 用于验证 Yahoo 接口连通性与字段解析，不参与应用打包。

use leverage_calc_lib::yahoo;

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let symbols = if args.is_empty() {
        vec!["NBIS".to_string(), "NEBX".to_string()]
    } else {
        args
    };

    for symbol in &symbols {
        match yahoo::fetch_quote(symbol).await {
            Ok(q) => println!(
                "{:<6} name={:?} latest={:?} regular={:?} prevClose={:?} session={} asOf={:?}",
                q.symbol, q.name, q.latest_price, q.regular_price, q.previous_close, q.session, q.as_of
            ),
            Err(e) => println!("{symbol:<6} ERROR: {e}"),
        }
    }

    for symbol in &symbols {
        match yahoo::fetch_series(symbol, "6mo").await {
            Ok(s) => println!(
                "{:<6} series n={} first={:?}/{:?} last={:?}/{:?}",
                s.symbol,
                s.closes.len(),
                s.dates.first(),
                s.closes.first(),
                s.dates.last(),
                s.closes.last()
            ),
            Err(e) => println!("{symbol:<6} SERIES ERROR: {e}"),
        }
    }

    match yahoo::resolve("ZZZZNOTREAL").await {
        Ok(i) => println!("resolve bogus -> {i:?}"),
        Err(e) => println!("resolve bogus -> ERROR: {e}"),
    }
}
