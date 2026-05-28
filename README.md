# Codex Token Usage Dashboard

一个非官方、本地优先的 Codex Token 使用量仪表盘。数据来自 [`ccusage`](https://www.npmjs.com/package/ccusage)，页面只读取本机生成的 `usage-data.js`，不会上传你的使用记录。

## 功能

- 每日 Token 使用量、估算费用、活跃天数、连续使用天数
- 输入、缓存输入、输出、推理输出拆分
- 全部 / 30 天 / 7 天切换
- 模型维度统计
- 类 GitHub contribution graph 的每日热力图
- 本地无缓存服务，避免页面展示旧数据

## 快速开始

```bash
npm install
npm run update
npm run serve
```

然后打开：

```text
http://127.0.0.1:5173/codex-dashboard.html
```

如果只是想看演示数据：

```bash
cp usage-data.example.js usage-data.js
npm run serve
```

## 常用命令

```bash
npm run record
```

推荐每天自动任务使用这个命令。它会先用稳定历史合并刷新 `usage-data.js` 和 `snapshots/`，再把最近 2 天的数据追加写入 `records/daily-ledger.jsonl`，用于补记跨天后的前一天最终变化。可以用 `RECORD_DATE=2026-05-28 npm run record` 只记录指定日期。

`daily-ledger.jsonl` 是追加式账本：每次运行新增一行，不覆盖旧记录；每行都包含上一行哈希和当前行哈希，方便之后发现记录是否被改动。`records/` 默认不提交到 Git。

```bash
npm run update
```

调用 `npx ccusage@latest codex daily/session --json`，刷新本地 `usage-data.js`。默认会启用稳定历史合并：如果 `ccusage` 重新计算后让某个日期的 Token 变低，仪表盘会保留上一版较高的日数据，避免历史曲线突然回落。

如果某天的数据被手动校准过，并在本地数据中记录了原始基准，后续刷新会显示“手动校准值 + ccusage 新增量”，而不是让当天数值卡在手动值不动。

每次刷新也会在 `snapshots/` 下保存本地快照，便于之后审计差异。`snapshots/` 默认不提交到 Git。

```bash
npm run update:raw
```

完全使用 `ccusage` 原始结果覆盖 `usage-data.js`，不做防回退合并。

```bash
npm run report
```

在终端输出今日 Codex Token 日报，默认同样使用稳定历史合并。

```bash
npm run report:raw
```

在终端输出 `ccusage` 原始口径日报。

```bash
PORT=5180 npm run serve
```

用指定端口启动本地页面。

## 隐私说明

`usage-data.js` 是本机生成的真实 Token 使用记录，默认已写入 `.gitignore`，不要提交到公开仓库。

仓库里的 `usage-data.example.js` 只是演示数据，可以公开。

`snapshots/` 会保存历史刷新快照，也可能包含真实使用记录，默认已写入 `.gitignore`。

`records/daily-ledger.jsonl` 会保存追加式每日观察记录，也可能包含真实使用记录，默认已写入 `.gitignore`。

## 免责声明

这是社区工具，不是 OpenAI 官方产品，也不与 OpenAI 存在从属关系。Codex、OpenAI 等名称归其各自权利人所有。

## 时区

默认使用 `Asia/Shanghai`。需要切换时区：

```bash
CCUSAGE_TIMEZONE=America/Los_Angeles npm run update
```

## 文件结构

```text
.
├── app.js                    # 仪表盘渲染逻辑
├── codex-dashboard.html      # 主页面
├── index.html                # 兼容入口
├── styles.css                # 视觉样式
├── usage-data.example.js     # 可公开示例数据
├── usage-data.js             # 本地真实数据，默认不提交
├── records/                  # 本地追加式每日账本，默认不提交
└── scripts/
    ├── ccusage-data.mjs      # ccusage 数据采集与格式化
    ├── daily-ledger.mjs      # 追加式账本记录与哈希链
    ├── record-daily.mjs      # 刷新并追加每日记录
    ├── update-usage.mjs      # 生成 usage-data.js
    ├── report-usage.mjs      # 输出终端日报
    └── serve-no-cache.mjs    # 本地无缓存静态服务
```

## License

MIT
