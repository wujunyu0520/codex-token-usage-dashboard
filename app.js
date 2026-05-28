(function () {
  const raw = window.__CCUSAGE_DATA__;
  const state = {
    range: "all",
    view: "overview",
  };

  const elements = {
    metricGrid: document.querySelector("#metric-grid"),
    heatmap: document.querySelector("#heatmap"),
    insight: document.querySelector("#usage-insight"),
    dailyBars: document.querySelector("#daily-bars"),
    modelSummary: document.querySelector("#model-summary"),
    modelList: document.querySelector("#model-list"),
    dataSource: document.querySelector("#data-source"),
    views: document.querySelectorAll(".view-panel"),
    tabs: document.querySelectorAll(".tab-button"),
    ranges: document.querySelectorAll(".range-button"),
  };

  if (!raw) {
    document.body.innerHTML = `
      <main class="page-shell">
        <header class="hero">
          <img class="hero-logo" src="./assets/codex-logo.png" alt="" aria-hidden="true" />
          <div class="hero-copy">
            <p class="eyebrow">Codex Usage</p>
            <h1>未找到 usage-data.js</h1>
          </div>
        </header>
        <section class="dashboard empty-state">
          <p>请先运行 <code>npm run update</code> 生成本机数据。</p>
          <p>如果只想查看演示效果，可以执行 <code>cp usage-data.example.js usage-data.js</code>。</p>
        </section>
      </main>
    `;
    return;
  }

  const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: raw.timezone || "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
  });
  const generatedAt = new Date(raw.generatedAt);

  function toDate(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  function dateKey(date) {
    return date.toISOString().slice(0, 10);
  }

  function weekdayIndex(date) {
    return (date.getUTCDay() + 6) % 7;
  }

  function formatCompact(value) {
    const number = Number(value || 0);
    if (number >= 1_000_000_000) return `${trim(number / 1_000_000_000)}B`;
    if (number >= 1_000_000) return `${trim(number / 1_000_000)}M`;
    if (number >= 1_000) return `${trim(number / 1_000)}K`;
    return Math.round(number).toLocaleString("en-US");
  }

  function trim(value) {
    return Number(value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)).toString();
  }

  function formatCurrency(value) {
    return `$${Number(value || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function formatDateLabel(dateString) {
    return dateFormatter.format(toDate(dateString));
  }

  function rangeDays() {
    const days = [...raw.daily].sort((a, b) => a.date.localeCompare(b.date));
    if (!days.length) return [];

    const byDate = new Map(days.map((day) => [day.date, day]));
    const firstDate = state.range === "all"
      ? toDate(days[0].date)
      : addDays(toDate(days[days.length - 1].date), -(Number(state.range) - 1));
    const lastDate = toDate(days[days.length - 1].date);
    const filled = [];

    for (let cursor = new Date(firstDate); cursor <= lastDate; cursor = addDays(cursor, 1)) {
      const key = dateKey(cursor);
      filled.push(byDate.get(key) || {
        date: key,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 0,
        costUSD: 0,
        models: {},
      });
    }

    return filled;
  }

  function sessionDate(session) {
    if (session.directory) return session.directory.replaceAll("/", "-");
    if (session.lastActivity) return dateKey(new Date(session.lastActivity));
    return "";
  }

  function rangeSessions(days) {
    const keys = new Set(days.map((day) => day.date));
    return raw.sessions.filter((session) => keys.has(sessionDate(session)));
  }

  function sumDays(days) {
    return days.reduce(
      (total, day) => {
        total.inputTokens += Number(day.inputTokens || 0);
        total.cachedInputTokens += Number(day.cachedInputTokens || 0);
        total.outputTokens += Number(day.outputTokens || 0);
        total.reasoningOutputTokens += Number(day.reasoningOutputTokens || 0);
        total.totalTokens += Number(day.totalTokens || 0);
        total.costUSD += Number(day.costUSD || 0);
        return total;
      },
      {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 0,
        costUSD: 0,
      },
    );
  }

  function modelStats(days) {
    const stats = new Map();
    for (const day of days) {
      for (const [name, value] of Object.entries(day.models || {})) {
        const current = stats.get(name) || {
          name,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          reasoningOutputTokens: 0,
          totalTokens: 0,
          costUSD: 0,
        };
        current.inputTokens += Number(value.inputTokens || 0);
        current.cachedInputTokens += Number(value.cachedInputTokens || 0);
        current.outputTokens += Number(value.outputTokens || 0);
        current.reasoningOutputTokens += Number(value.reasoningOutputTokens || 0);
        current.totalTokens += Number(value.totalTokens || 0);
        current.costUSD += Number(day.costUSD || 0) * (Number(value.totalTokens || 0) / Math.max(Number(day.totalTokens || 0), 1));
        stats.set(name, current);
      }
    }
    return [...stats.values()].sort((a, b) => b.totalTokens - a.totalTokens);
  }

  function streakStats() {
    const allDays = [...raw.daily].sort((a, b) => a.date.localeCompare(b.date));
    if (!allDays.length) return { current: 0, longest: 0 };

    const active = new Set(allDays.filter((day) => day.totalTokens > 0).map((day) => day.date));
    const firstDate = toDate(allDays[0].date);
    const lastDate = toDate(allDays[allDays.length - 1].date);
    let longest = 0;
    let running = 0;

    for (let cursor = new Date(firstDate); cursor <= lastDate; cursor = addDays(cursor, 1)) {
      if (active.has(dateKey(cursor))) {
        running += 1;
        longest = Math.max(longest, running);
      } else {
        running = 0;
      }
    }

    let current = 0;
    for (let cursor = new Date(lastDate); active.has(dateKey(cursor)); cursor = addDays(cursor, -1)) {
      current += 1;
    }

    return { current, longest };
  }

  function peakHour(sessions) {
    const buckets = new Map();
    for (const session of sessions) {
      if (!session.lastActivity) continue;
      const hour = new Intl.DateTimeFormat("en-US", {
        timeZone: raw.timezone || "Asia/Shanghai",
        hour: "numeric",
        hour12: true,
      }).format(new Date(session.lastActivity));
      buckets.set(hour, (buckets.get(hour) || 0) + Number(session.totalTokens || 0));
    }
    return [...buckets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "无";
  }

  function heatLevel(value, max) {
    if (!value) return 0;
    const ratio = value / Math.max(max, 1);
    if (ratio > 0.75) return 4;
    if (ratio > 0.45) return 3;
    if (ratio > 0.18) return 2;
    return 1;
  }

  function renderMetrics(days, sessions) {
    const totals = sumDays(days);
    const models = modelStats(days);
    const peakDay = [...days].sort((a, b) => Number(b.totalTokens || 0) - Number(a.totalTokens || 0))[0];
    const streak = streakStats();
    const todayKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: raw.timezone || "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const today = raw.daily.find((day) => day.date === todayKey);

    const cards = [
      ["会话", sessions.length.toLocaleString("en-US")],
      ["区间 Token", formatCompact(totals.totalTokens)],
      ["今日 Token", formatCompact(today?.totalTokens || 0)],
      ["估算费用", formatCurrency(totals.costUSD)],
      ["活跃天数", days.filter((day) => Number(day.totalTokens || 0) > 0).length.toString()],
      ["当前连续", `${streak.current}天`],
      ["峰值时段", peakHour(sessions)],
      ["常用模型", models[0]?.name || "无"],
    ];

    elements.metricGrid.innerHTML = cards
      .map(([label, value]) => `
        <article class="metric-card">
          <div class="metric-label">${label}</div>
          <div class="metric-value">${value}</div>
        </article>
      `)
      .join("");

    const activeDays = days.filter((day) => Number(day.totalTokens || 0) > 0).length;
    const average = activeDays ? totals.totalTokens / activeDays : 0;
    const peakText = peakDay ? `${peakDay.date} 达到 ${formatCompact(peakDay.totalTokens)}` : "暂无峰值日";
    elements.insight.textContent = `日均 ${formatCompact(average)} tokens。峰值日 ${peakText}，最长连续使用 ${streak.longest} 天。`;
  }

  function renderHeatmap(days) {
    const byDate = new Map(days.map((day) => [day.date, day]));
    const max = Math.max(...days.map((day) => Number(day.totalTokens || 0)), 1);
    if (!days.length) {
      elements.heatmap.innerHTML = "";
      return;
    }

    const start = toDate(days[0].date);
    const end = toDate(days[days.length - 1].date);
    const first = addDays(start, -weekdayIndex(start));
    const cells = [];

    for (let cursor = new Date(first); cursor <= end; cursor = addDays(cursor, 1)) {
      const key = dateKey(cursor);
      const day = byDate.get(key);
      if (cursor < start) {
        cells.push('<span class="heat-cell empty" aria-hidden="true"></span>');
      } else {
        const total = Number(day?.totalTokens || 0);
        cells.push(`<span class="heat-cell" data-level="${heatLevel(total, max)}" title="${key} · ${formatCompact(total)} tokens"></span>`);
      }
    }

    elements.heatmap.innerHTML = cells.join("");
  }

  function renderDailyBars(days) {
    const visible = days;
    const max = Math.max(...visible.map((day) => Number(day.totalTokens || 0)), 1);

    elements.dailyBars.innerHTML = visible
      .map((day) => {
        const width = `${Math.max((Number(day.totalTokens || 0) / max) * 100, day.totalTokens ? 2 : 0).toFixed(2)}%`;
        return `
          <div class="day-row">
            <div class="day-date">${formatDateLabel(day.date)}</div>
            <div class="bar-track"><div class="bar-fill" style="--bar-width: ${width}"></div></div>
            <div class="day-total">${formatCompact(day.totalTokens)}</div>
          </div>
        `;
      })
      .join("");
  }

  function renderModels(days) {
    const totals = sumDays(days);
    const stats = modelStats(days);

    elements.modelSummary.innerHTML = [
      ["模型数", stats.length.toString()],
      ["输入占比", `${((totals.inputTokens / Math.max(totals.totalTokens, 1)) * 100).toFixed(1)}%`],
      ["缓存输入", formatCompact(totals.cachedInputTokens)],
    ]
      .map(([label, value]) => `
        <article class="metric-card">
          <div class="metric-label">${label}</div>
          <div class="metric-value">${value}</div>
        </article>
      `)
      .join("");

    elements.modelList.innerHTML = stats
      .map((model) => {
        const share = `${((model.totalTokens / Math.max(totals.totalTokens, 1)) * 100).toFixed(2)}%`;
        return `
          <article class="model-card">
            <div class="model-head">
              <div class="model-name">${model.name}</div>
              <div class="model-cost">${formatCurrency(model.costUSD)}</div>
            </div>
            <div class="model-meter"><span style="--share: ${share}"></span></div>
            <div class="model-meta">
              <span>${formatCompact(model.totalTokens)} tokens</span>
              <span>${share}</span>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function render() {
    const days = rangeDays();
    const sessions = rangeSessions(days);

    renderMetrics(days, sessions);
    renderHeatmap(days);
    renderDailyBars(days);
    renderModels(days);

    elements.dataSource.textContent = `来源：ccusage · 时区：${raw.timezone || "Asia/Shanghai"} · 更新：${generatedAt.toLocaleString("zh-CN", {
      timeZone: raw.timezone || "Asia/Shanghai",
      hour12: false,
    })}`;
  }

  elements.tabs.forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      elements.tabs.forEach((item) => {
        item.classList.toggle("active", item === button);
        item.setAttribute("aria-selected", item === button ? "true" : "false");
      });
      elements.views.forEach((view) => view.classList.toggle("active", view.id === `${state.view}-view`));
    });
  });

  elements.ranges.forEach((button) => {
    button.addEventListener("click", () => {
      state.range = button.dataset.range;
      elements.ranges.forEach((item) => item.classList.toggle("active", item === button));
      render();
    });
  });

  render();
})();
