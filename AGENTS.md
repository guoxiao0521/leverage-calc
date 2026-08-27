# AGENTS.md

给在这个仓库里干活的 AI 助手看的约定。

## 这是什么

Tauri v2 桌面应用，做美股正股 ↔ 杠杆 ETP 的价位换算。技术栈：Vue 3.5 + TypeScript + Vite + Tailwind v4，Rust 侧只负责行情抓取。

## 架构约定

- **计算全部放在 `src/lib/` 的纯函数里**，组件只负责展示和收集输入。新增计算逻辑先想能不能放进 `leverage.ts` / `stats.ts` / `levels.ts`，并补单测。
- **编排放在 `src/composables/useCalculator.ts`**，它把「配对 + 行情 + 参数 + 持仓」组装成表格数据。组件通过 props 接收结果，不自己算。
- **联网只能在 Rust 侧**（`src-tauri/src/yahoo.rs`）。前端直接 fetch 外部接口会被 CORS 拦掉，不要尝试。新增数据源在 `yahoo.rs` 加函数、`commands.rs` 加命令。
- **Tauri 命令一律返回 `Result<T, String>`**，错误信息写成可以直接弹给用户看的中文。多标的请求要做逐只失败隔离。
- **持久化走 `src/composables/useStore.ts`**，它在非 Tauri 环境自动回退 localStorage，所以 `pnpm dev` 也能调。不要直接调 `@tauri-apps/plugin-store`。

## 复用优先

改动前先看这几个文件里有没有现成的：

- `src/lib/format.ts` —— 价格/百分比/金额/涨跌色的格式化，自 `../stock-panel` 移植，不要另写一套
- `src/lib/leverage.ts` —— 正算、反推、衰减因子、持仓盈亏
- `src/lib/stats.ts` —— 日收益率、波动率、过原点 OLS、按日期对齐
- `src/components/ui/` —— Button / Card / Badge / NumberField，够用就别引 UI 库

## 数值口径

- 倍数 `k` 带符号，反向产品为负数
- 波动率和费率内部存小数（0.042），只在 UI 层显示成百分数
- 价位统一归一到 4 位小数（`Math.round(p * 10000) / 10000`），避免浮点误差导致同一价位重复
- 线性外推可能算出负价，UI 要显示成「≈0 理论清零」而不是负数

## 别写错的一件事

**不要在文案里写「杠杆 ETF 多日持有一定比线性估算低」**。这只在震荡行情下成立；大幅单边行情里复利凸性会反过来占主导，多日估值高于线性。`tests/leverage.test.ts` 里有两个方向的用例锁着这个行为，README 有推导。

## 验证

```bash
pnpm test        # 改了 lib/ 必跑
pnpm typecheck   # 改了 .vue 或类型必跑
pnpm build
```

Rust 侧改了接口解析，用探针实测一把：

```bash
cd src-tauri && cargo run --example probe -- NBIS NEBX
```
