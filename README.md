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
npm run update
```

调用 `npx ccusage@latest codex daily/session --json`，刷新本地 `usage-data.js`。

```bash
npm run report
```

在终端输出今日 Codex Token 日报。

```bash
PORT=5180 npm run serve
```

用指定端口启动本地页面。

## 隐私说明

`usage-data.js` 是本机生成的真实 Token 使用记录，默认已写入 `.gitignore`，不要提交到公开仓库。

仓库里的 `usage-data.example.js` 只是演示数据，可以公开。

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
└── scripts/
    ├── ccusage-data.mjs      # ccusage 数据采集与格式化
    ├── update-usage.mjs      # 生成 usage-data.js
    ├── report-usage.mjs      # 输出终端日报
    └── serve-no-cache.mjs    # 本地无缓存静态服务
```

## License

MIT
