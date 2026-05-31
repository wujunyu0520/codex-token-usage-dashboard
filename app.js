(function () {
  const raw = window.__CODEX_PROFILE_USAGE__;
  const state = {
    range: "all",
    view: "overview",
  };

  const elements = {
    metricGrid: document.querySelector("#metric-grid"),
    heatmap: document.querySelector("#heatmap"),
    insight: document.querySelector("#usage-insight"),
    dailyBars: document.querySelector("#daily-bars"),
    detailSummary: document.querySelector("#detail-summary"),
    detailList: document.querySelector("#detail-list"),
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
            <h1>未找到官方 profile 数据</h1>
          </div>
        </header>
        <section class="dashboard empty-state">
          <p>请先运行 <code>npm run update</code> 拉取 Codex App 个人资料页的官方统计口径。</p>
        </section>
      </main>
    `;
    return;
  }

  const timezone = raw.timezone || "Asia/Shanghai";
  const generatedAt = new Date(raw.generatedAt);
  const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    month: "2-digit",
    day: "2-digit",
  });

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

  function trim(value) {
    return Number(value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)).toString();
  }

  function formatCompact(value) {
    const number = Number(value || 0);
    if (number >= 100000000) return `${trim(number / 100000000)}亿`;
    if (number >= 10000) return `${trim(number / 10000)}万`;
    return Math.round(number).toLocaleString("zh-CN");
  }

  function formatDateLabel(dateString) {
    return dateFormatter.format(toDate(dateString));
  }

  function rangeDays() {
    const days = [...raw.daily].sort((a, b) => a.date.localeCompare(b.date));
    if (!days.length) return [];

    const byDate = new Map(days.map((day) => [day.date, day]));
    const lastDate = toDate(days[days.length - 1].date);
    const firstDate =
      state.range === "all"
        ? toDate(days[0].date)
        : addDays(lastDate, -(Number(state.range) - 1));
    const filled = [];

    for (let cursor = new Date(firstDate); cursor <= lastDate; cursor = addDays(cursor, 1)) {
      const key = dateKey(cursor);
      filled.push(
        byDate.get(key) || {
          date: key,
          weekday: "",
          totalTokens: 0,
          cumulativeTokens: null,
        },
      );
    }

    return filled;
  }

  function sumDays(days) {
    return days.reduce((total, day) => total + Number(day.totalTokens || 0), 0);
  }

  function peakDay(days) {
    return [...days].sort((a, b) => Number(b.totalTokens || 0) - Number(a.totalTokens || 0))[0];
  }

  function latestDay() {
    return raw.daily.find((day) => day.date === raw.summary.lastDate) || raw.daily.at(-1);
  }

  function heatLevel(value, max) {
    if (!value) return 0;
    const ratio = value / Math.max(max, 1);
    if (ratio > 0.75) return 4;
    if (ratio > 0.45) return 3;
    if (ratio > 0.18) return 2;
    return 1;
  }

  function renderMetrics(days) {
    const rangeTotal = sumDays(days);
    const rangePeak = peakDay(days);
    const latest = latestDay();
    const activeDays = days.filter((day) => Number(day.totalTokens || 0) > 0).length;
    const cards = [
      ["累计 Token", formatCompact(raw.summary.lifetimeTokens)],
      ["区间 Token", formatCompact(rangeTotal)],
      ["最新日 Token", formatCompact(latest?.totalTokens || 0)],
      ["峰值 Token", formatCompact(raw.summary.peakDailyTokens)],
      ["活跃天数", activeDays.toString()],
      ["当前连续", `${raw.summary.currentStreakDays ?? 0}天`],
      ["最长任务", raw.summary.longestTaskText || "无"],
      ["最长连续", `${raw.summary.longestStreakDays ?? 0}天`],
    ];

    elements.metricGrid.innerHTML = cards
      .map(([label, value]) => `
        <article class="metric-card">
          <div class="metric-label">${label}</div>
          <div class="metric-value">${value}</div>
        </article>
      `)
      .join("");

    const average = activeDays ? rangeTotal / activeDays : 0;
    const peakText = rangePeak ? `${rangePeak.date} 达到 ${formatCompact(rangePeak.totalTokens)}` : "暂无峰值日";
    elements.insight.textContent = `官方 profile 口径：区间日均 ${formatCompact(average)} tokens。区间峰值日 ${peakText}，当前连续 ${raw.summary.currentStreakDays ?? 0} 天。`;
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
    const max = Math.max(...days.map((day) => Number(day.totalTokens || 0)), 1);

    elements.dailyBars.innerHTML = days
      .map((day) => {
        const total = Number(day.totalTokens || 0);
        const width = `${Math.max((total / max) * 100, total ? 2 : 0).toFixed(2)}%`;
        return `
          <div class="day-row">
            <div class="day-date">${formatDateLabel(day.date)}</div>
            <div class="bar-track"><div class="bar-fill" style="--bar-width: ${width}"></div></div>
            <div class="day-total">${formatCompact(total)}</div>
          </div>
        `;
      })
      .join("");
  }

  function renderDetails(days) {
    const rangeTotal = sumDays(days);
    const topDays = [...raw.daily]
      .sort((a, b) => Number(b.totalTokens || 0) - Number(a.totalTokens || 0))
      .slice(0, 8);

    elements.detailSummary.innerHTML = [
      ["官方累计", formatCompact(raw.summary.lifetimeTokens)],
      ["官方记录日", raw.daily.length.toString()],
      ["区间合计", formatCompact(rangeTotal)],
    ]
      .map(([label, value]) => `
        <article class="metric-card">
          <div class="metric-label">${label}</div>
          <div class="metric-value">${value}</div>
        </article>
      `)
      .join("");

    const monthCards = [...raw.monthly]
      .sort((a, b) => b.month.localeCompare(a.month))
      .map((month) => `
        <article class="model-card">
          <div class="model-head">
            <div class="model-name">${month.month}</div>
            <div class="model-cost">${month.activeDays} 天</div>
          </div>
          <div class="model-meter"><span style="--share: ${Math.min((month.totalTokens / Math.max(raw.summary.lifetimeTokens, 1)) * 100, 100).toFixed(2)}%"></span></div>
          <div class="model-meta">
            <span>${formatCompact(month.totalTokens)} tokens</span>
            <span>${((month.totalTokens / Math.max(raw.summary.lifetimeTokens, 1)) * 100).toFixed(1)}%</span>
          </div>
        </article>
      `);

    const topCards = topDays.map((day, index) => `
      <article class="model-card">
        <div class="model-head">
          <div class="model-name">Top ${index + 1} · ${day.date}</div>
          <div class="model-cost">${day.weekday}</div>
        </div>
        <div class="model-meter"><span style="--share: ${Math.min((day.totalTokens / Math.max(raw.summary.peakDailyTokens, 1)) * 100, 100).toFixed(2)}%"></span></div>
        <div class="model-meta">
          <span>${formatCompact(day.totalTokens)} tokens</span>
          <span>累计 ${formatCompact(day.cumulativeTokens || 0)}</span>
        </div>
      </article>
    `);

    elements.detailList.innerHTML = [...topCards, ...monthCards].join("");
  }

  function render() {
    const days = rangeDays();
    renderMetrics(days);
    renderHeatmap(days);
    renderDailyBars(days);
    renderDetails(days);

    elements.dataSource.textContent = `来源：Codex App 个人资料 · ${raw.source.endpoint.replace("https://chatgpt.com", "")} · 更新：${generatedAt.toLocaleString("zh-CN", {
      timeZone: timezone,
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
