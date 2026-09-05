// 관리자 통계 대시보드. 빌드 과정 없이 Worker가 직접 서빙하는 단일 HTML 페이지다.
// 같은 origin에서 /v1/admin/stats/*를 호출하므로 CORS 문제가 없고, 별도 배포도 필요 없다.
export const ADMIN_DASHBOARD_HTML = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>라디오 통계 대시보드</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js"></script>
<style>
  :root {
    color-scheme: light;
    --surface-1: #fcfcfb;
    --page: #f9f9f7;
    --text-primary: #0b0b0b;
    --text-secondary: #52514e;
    --text-muted: #898781;
    --gridline: #e1e0d9;
    --baseline: #c3c2b7;
    --border: rgba(11, 11, 11, 0.10);
    --accent: #2a78d6;
    --accent-soft: #cde2fb;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --surface-1: #1a1a19;
      --page: #0d0d0d;
      --text-primary: #ffffff;
      --text-secondary: #c3c2b7;
      --text-muted: #898781;
      --gridline: #2c2c2a;
      --baseline: #383835;
      --border: rgba(255, 255, 255, 0.10);
      --accent: #3987e5;
      --accent-soft: #184f95;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--page);
    color: var(--text-primary);
    font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  #app { max-width: 960px; margin: 0 auto; padding: 16px 16px 48px; }
  #gate {
    max-width: 320px;
    margin: 20vh auto 0;
    padding: 24px;
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 12px;
  }
  #gate h1 { font-size: 16px; margin: 0 0 16px; }
  #gate label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; }
  #gate input {
    width: 100%;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--page);
    color: var(--text-primary);
    font-size: 14px;
    margin-bottom: 12px;
  }
  #gate button, header button {
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--accent);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  header button.secondary { background: transparent; color: var(--text-secondary); }
  #gateError { color: #d03b3b; font-size: 12px; min-height: 16px; margin: 0; }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
  }
  header h1 { font-size: 18px; margin: 0; }
  .controls { display: flex; align-items: center; gap: 8px; }
  #updatedAt { font-size: 12px; color: var(--text-muted); }
  .tab-nav {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    margin-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }
  .tab-btn {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 600;
    padding: 10px 12px;
    cursor: pointer;
    white-space: nowrap;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
  }
  .tab-btn.is-active { color: var(--accent); border-bottom-color: var(--accent); }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
    margin-bottom: 20px;
  }
  .tile {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 14px;
  }
  .tile-label { font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
  .tile-value { font-size: 22px; font-weight: 700; font-variant-numeric: proportional-nums; }
  .panel {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px;
    margin-bottom: 16px;
  }
  .panel h2 { font-size: 13px; color: var(--text-secondary); margin: 0 0 12px; font-weight: 600; }
  .tiles-heading { font-size: 12px; color: var(--text-muted); margin: 0 0 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.02em; }
  .chart-wrap { position: relative; width: 100%; height: 220px; }
  .empty { color: var(--text-muted); font-size: 13px; padding: 8px 0; }
  .error-banner {
    background: rgba(208, 59, 59, 0.12);
    border: 1px solid #d03b3b;
    color: #d03b3b;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 13px;
    margin-bottom: 16px;
  }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; white-space: nowrap; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--gridline); }
  th { color: var(--text-muted); font-weight: 600; font-size: 11px; text-transform: uppercase; }
  tbody tr { cursor: pointer; }
  tbody tr:hover { background: var(--page); }
  .detail-row td { cursor: default; background: var(--page); white-space: normal; }
  .detail-row:hover { background: var(--page); }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--text-primary); font-size: 11px; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<div id="app">
  <div id="gate">
    <h1>관리자 토큰을 입력하세요</h1>
    <form id="gateForm">
      <label for="tokenInput">ADMIN_TOKEN</label>
      <input id="tokenInput" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" />
      <button type="submit">입장</button>
    </form>
    <p id="gateError"></p>
  </div>

  <div id="dashboard" hidden>
    <header>
      <h1>라디오 통계</h1>
      <div class="controls">
        <span id="updatedAt"></span>
        <button id="refreshBtn" class="secondary" type="button">새로고침</button>
        <button id="logoutBtn" class="secondary" type="button">토큰 지우기</button>
      </div>
    </header>

    <nav id="tabNav" class="tab-nav">
      <button class="tab-btn" data-tab="home" type="button">홈</button>
      <button class="tab-btn" data-tab="live" type="button">실시간</button>
      <button class="tab-btn" data-tab="channels" type="button">채널 분석</button>
      <button class="tab-btn" data-tab="visitors" type="button">방문자</button>
      <button class="tab-btn" data-tab="demographics" type="button">방문자 속성</button>
    </nav>

    <p id="dashboardError" class="error-banner" hidden></p>

    <section class="page" id="page-home">
      <h3 class="tiles-heading">지금 / 오늘</h3>
      <section class="tiles" id="tilesToday"></section>

      <h3 class="tiles-heading">누적</h3>
      <section class="tiles" id="tilesTotal"></section>

      <section class="panel">
        <h2>지금 듣고 있는 채널 (상위 5)</h2>
        <div class="chart-wrap"><canvas id="liveChannelsChartHome"></canvas></div>
      </section>

      <section class="panel">
        <h2>일별 청취 시간 추이 (최근 30일, 사이트 전체)</h2>
        <div class="chart-wrap"><canvas id="dailyHoursChart"></canvas></div>
      </section>

      <section class="panel">
        <h2>일별 순수 청취자 수 추이 (최근 30일)</h2>
        <div class="chart-wrap"><canvas id="dailyListenersChart"></canvas></div>
      </section>
    </section>

    <section class="page" id="page-live" hidden>
      <section class="panel">
        <h2>채널별 실시간 청취자</h2>
        <div class="chart-wrap"><canvas id="liveChannelsChart"></canvas></div>
      </section>

      <section class="panel">
        <h2>실시간 접속 세션</h2>
        <div class="table-wrap">
          <table id="liveTable">
            <thead><tr><th>채널</th><th>프로그램</th><th>국가</th><th>브라우저</th><th>OS</th><th>기기</th><th>경과</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </section>
    </section>

    <section class="page" id="page-channels" hidden>
      <section class="panel">
        <h2>방송국별 누적 청취 시간</h2>
        <div class="chart-wrap"><canvas id="byBroadcasterChart"></canvas></div>
      </section>

      <section class="panel">
        <h2>채널별 누적 청취 시간</h2>
        <div class="chart-wrap"><canvas id="byChannelChart"></canvas></div>
      </section>

      <section class="panel">
        <h2>지역별 누적 청취 시간 (수도권 vs 지역)</h2>
        <div class="chart-wrap"><canvas id="byRegionChart"></canvas></div>
      </section>

      <section class="panel">
        <h2>프로그램 TOP</h2>
        <div class="chart-wrap"><canvas id="byProgramChart"></canvas></div>
      </section>
    </section>

    <section class="page" id="page-visitors" hidden>
      <section class="panel">
        <h2>방문자 (최근 방문순, 탭하면 상세)</h2>
        <div class="table-wrap">
          <table id="visitorsTable">
            <thead><tr><th>국가</th><th>브라우저</th><th>OS</th><th>방문</th><th>오늘 청취</th><th>누적 청취</th><th>최근 방문</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </section>
    </section>

    <section class="page" id="page-demographics" hidden>
      <section class="panel">
        <h2>국가별 방문자</h2>
        <div class="chart-wrap"><canvas id="countriesChart"></canvas></div>
      </section>

      <section class="panel">
        <h2>브라우저별 방문자</h2>
        <div class="chart-wrap"><canvas id="browsersChart"></canvas></div>
      </section>

      <section class="panel">
        <h2>OS별 방문자</h2>
        <div class="chart-wrap"><canvas id="osChart"></canvas></div>
      </section>

      <section class="panel">
        <h2>기기별 방문자</h2>
        <div class="chart-wrap"><canvas id="devicesChart"></canvas></div>
      </section>

      <section class="panel">
        <h2>유입 경로</h2>
        <div class="chart-wrap"><canvas id="referrersChart"></canvas></div>
      </section>
    </section>
  </div>
</div>
<script>
(function () {
  "use strict";

  var TOKEN_KEY = "radio-stats:admin-token";
  var AUTO_REFRESH_MS = 15000;

  var gate = document.getElementById("gate");
  var gateForm = document.getElementById("gateForm");
  var gateError = document.getElementById("gateError");
  var tokenInput = document.getElementById("tokenInput");
  var dashboard = document.getElementById("dashboard");
  var updatedAt = document.getElementById("updatedAt");
  var dashboardError = document.getElementById("dashboardError");
  var refreshTimer = null;

  function showDashboardError(message) {
    dashboardError.textContent = message;
    dashboardError.hidden = false;
  }

  function clearDashboardError() {
    dashboardError.hidden = true;
    dashboardError.textContent = "";
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch (error) {
      return "";
    }
  }

  function setToken(value) {
    try {
      localStorage.setItem(TOKEN_KEY, value);
    } catch (error) {
      // 사생활 보호 모드 등에서는 토큰을 저장하지 못할 수 있고, 그 경우 매번 다시 입력한다.
    }
  }

  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (error) {
      // ignore
    }
  }

  function showGate(message) {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    dashboard.hidden = true;
    gate.hidden = false;
    gateError.textContent = message || "";
    tokenInput.focus();
  }

  function showDashboard() {
    gate.hidden = true;
    dashboard.hidden = false;
  }

  function authFetch(path) {
    var token = getToken();
    return fetch(path, { headers: { Authorization: "Bearer " + token } }).then(function (response) {
      if (response.status === 401) {
        clearToken();
        showGate("토큰이 올바르지 않습니다. 다시 입력해 주세요.");
        throw new Error("unauthorized");
      }
      if (!response.ok) {
        return response
          .text()
          .catch(function () { return ""; })
          .then(function (body) {
            throw new Error(path + " -> " + response.status + (body ? " " + body.slice(0, 200) : ""));
          });
      }
      return response.json();
    });
  }

  function formatHours(seconds) {
    var total = Math.round(seconds || 0);
    var hours = Math.floor(total / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    if (hours === 0 && minutes === 0) return "0분";
    if (hours === 0) return minutes + "분";
    return hours + "시간 " + minutes + "분";
  }

  function formatElapsed(startedAtIso) {
    var startedMs = new Date(startedAtIso).getTime();
    if (!isFinite(startedMs)) return "-";
    return formatHours((Date.now() - startedMs) / 1000);
  }

  function formatDateTime(iso) {
    if (!iso) return "-";
    var date = new Date(iso);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  // channel_id는 "seoul-011-sbs-lovefm-main" 같은 내부 식별자라 화면에는 channel_name을
  // 우선 보여주고, 옛날 데이터처럼 channel_name이 없으면 channel_id로 대체한다.
  function channelLabel(row) {
    return row.channel_name || row.channel_id;
  }

  function renderTileGroup(containerId, items) {
    var tiles = document.getElementById(containerId);
    clearNode(tiles);
    items.forEach(function (item) {
      var tile = el("div", "tile");
      tile.appendChild(el("div", "tile-label", item[0]));
      tile.appendChild(el("div", "tile-value", String(item[1])));
      tiles.appendChild(tile);
    });
  }

  // 자주 확인할 것(지금/오늘)과 어쩌다 볼 것(누적)을 나눠서, 홈 화면엔 꼭 필요한 것만 둔다.
  function renderHomeTiles(summary) {
    renderTileGroup("tilesToday", [
      ["현재 접속", summary.currently_online],
      ["현재 청취", summary.currently_listening],
      ["오늘 방문자", summary.visitors_today],
      ["오늘 청취자", summary.listeners_today],
      ["오늘 청취 시간", formatHours(summary.listen_seconds_today_total)],
    ]);
    renderTileGroup("tilesTotal", [
      ["전체 방문자", summary.visitors_total],
      ["누적 청취자", summary.listeners_all_time],
      ["누적 청취 시간", formatHours(summary.listen_seconds_alltime_total)],
    ]);
  }

  // 다크/라이트 모드에 맞춰 차트 색을 고른다. references/palette.md의 blue 슬롯과 동일하다.
  function chartTheme() {
    var dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    return {
      accent: dark ? "#3987e5" : "#2a78d6",
      accentFill: dark ? "rgba(57, 135, 229, 0.25)" : "rgba(42, 120, 214, 0.18)",
      grid: dark ? "#2c2c2a" : "#e1e0d9",
      text: dark ? "#c3c2b7" : "#52514e",
    };
  }

  var charts = {};

  function destroyChart(canvasId) {
    if (charts[canvasId]) {
      charts[canvasId].destroy();
      delete charts[canvasId];
    }
  }

  function renderLineChart(canvasId, labels, values, formatValue) {
    var theme = chartTheme();
    destroyChart(canvasId);
    charts[canvasId] = new Chart(document.getElementById(canvasId).getContext("2d"), {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          data: values,
          borderColor: theme.accent,
          backgroundColor: theme.accentFill,
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // 15초마다 자동 새로고침되므로 매번 애니메이션이 다시 도는 게 오히려 산만하고,
        // 특히 막대 차트는 생성 직후 리사이즈와 애니메이션이 겹치면 최종 크기가 어긋난다.
        animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (ctx) { return formatValue(ctx.parsed.y); } } },
        },
        scales: {
          x: { grid: { color: theme.grid }, ticks: { color: theme.text, maxRotation: 0, autoSkip: true } },
          y: { grid: { color: theme.grid }, ticks: { color: theme.text }, beginAtZero: true },
        },
      },
    });
  }

  // rows: [{ label, value }]. 세로 막대 목록 대신 Chart.js 가로 막대 차트로 그린다.
  function renderBarChart(canvasId, rows, formatValue) {
    var theme = chartTheme();
    destroyChart(canvasId);
    var canvas = document.getElementById(canvasId);
    canvas.parentElement.style.height = Math.max(160, Math.min(560, rows.length * 28 + 40)) + "px";
    // 높이를 바꾼 직후 바로 차트를 만들면 Chart.js가 리사이즈 반영 전 크기로 그려서
    // 막대 길이가 실제 값보다 짧게 나온다. 레이아웃을 강제로 한 번 플러시해서 막는다.
    void canvas.parentElement.offsetHeight;
    charts[canvasId] = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: rows.map(function (row) { return row.label; }),
        datasets: [{
          data: rows.map(function (row) { return row.value; }),
          backgroundColor: theme.accent,
          borderRadius: 4,
          maxBarThickness: 22,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (ctx) { return formatValue(ctx.parsed.x); } } },
        },
        scales: {
          x: { grid: { color: theme.grid }, ticks: { color: theme.text }, beginAtZero: true },
          y: { grid: { display: false }, ticks: { color: theme.text } },
        },
      },
    });
  }

  function renderLiveTable(sessions) {
    var tbody = document.querySelector("#liveTable tbody");
    clearNode(tbody);
    if (!sessions.length) {
      var emptyRow = el("tr");
      var emptyCell = el("td", "empty", "실시간 접속이 없습니다.");
      emptyCell.colSpan = 7;
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
      return;
    }
    sessions.forEach(function (session) {
      var row = el("tr");
      row.appendChild(el("td", null, channelLabel(session)));
      row.appendChild(el("td", null, session.program_title || "-"));
      row.appendChild(el("td", null, session.country || "-"));
      row.appendChild(el("td", null, session.browser || "-"));
      row.appendChild(el("td", null, session.os || "-"));
      row.appendChild(el("td", null, session.device_type || "-"));
      row.appendChild(el("td", null, formatElapsed(session.started_at)));
      tbody.appendChild(row);
    });
  }

  function renderVisitorDetail(visitorId, detail) {
    var row = el("tr", "detail-row");
    var cell = el("td");
    cell.colSpan = 7;

    var channelWrap = el("div");
    channelWrap.appendChild(el("strong", null, "채널별 누적 청취"));
    if (detail.channel_totals.length) {
      detail.channel_totals.forEach(function (item) {
        var line = el("div");
        line.appendChild(el("span", "pill", channelLabel(item)));
        line.appendChild(document.createTextNode(" " + formatHours(item.seconds)));
        channelWrap.appendChild(line);
      });
    } else {
      channelWrap.appendChild(el("div", "empty", "청취 기록이 없습니다."));
    }

    var dailyWrap = el("div");
    dailyWrap.style.marginTop = "10px";
    dailyWrap.appendChild(el("strong", null, "최근 날짜별 청취"));
    if (detail.daily_totals.length) {
      detail.daily_totals.slice(0, 14).forEach(function (item) {
        var line = el("div");
        line.textContent = item.listen_date + " — " + formatHours(item.seconds);
        dailyWrap.appendChild(line);
      });
    } else {
      dailyWrap.appendChild(el("div", "empty", "청취 기록이 없습니다."));
    }

    cell.appendChild(channelWrap);
    cell.appendChild(dailyWrap);
    row.appendChild(cell);
    return row;
  }

  function renderVisitorsTable(visitors) {
    var tbody = document.querySelector("#visitorsTable tbody");
    clearNode(tbody);
    if (!visitors.length) {
      var emptyRow = el("tr");
      var emptyCell = el("td", "empty", "방문자가 없습니다.");
      emptyCell.colSpan = 7;
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
      return;
    }
    visitors.forEach(function (visitor) {
      var row = el("tr");
      row.appendChild(el("td", null, visitor.country || "-"));
      row.appendChild(el("td", null, visitor.browser || "-"));
      row.appendChild(el("td", null, visitor.os || "-"));
      row.appendChild(el("td", null, String(visitor.visit_count)));
      row.appendChild(el("td", null, formatHours(visitor.listen_seconds_today)));
      row.appendChild(el("td", null, formatHours(visitor.total_listen_seconds)));
      row.appendChild(el("td", null, formatDateTime(visitor.last_seen_at)));

      var expanded = false;
      var detailRow = null;
      row.addEventListener("click", function () {
        if (expanded) {
          if (detailRow) detailRow.remove();
          expanded = false;
          return;
        }
        expanded = true;
        authFetch("/v1/admin/stats/visitors/" + encodeURIComponent(visitor.id))
          .then(function (detail) {
            detailRow = renderVisitorDetail(visitor.id, detail);
            row.parentNode.insertBefore(detailRow, row.nextSibling);
          })
          .catch(function () {
            expanded = false;
          });
      });

      tbody.appendChild(row);
    });
  }

  function hoursValue(seconds) { return seconds / 3600; }
  function formatHoursValue(value) { return formatHours(value * 3600); }
  function countLabel(unit) { return function (value) { return value + unit; }; }

  // 요청 하나가 실패해도(예: 엔드포인트 하나만 오류) 그 탭의 나머지는 정상적으로
  // 그려지도록 Promise.all 대신 allSettled를 쓴다 — 전부-아니면-전무로 묶여 있으면
  // 실패 이유를 알 방법 없이 화면 전체가 조용히 비어버린다.
  function fetchAndRender(requests, render) {
    return Promise.allSettled(requests.map(function (r) { return authFetch(r.path); })).then(function (settled) {
      var data = {};
      var errors = [];
      settled.forEach(function (result, index) {
        if (result.status === "fulfilled") {
          data[requests[index].key] = result.value;
        } else {
          errors.push(result.reason && result.reason.message ? result.reason.message : String(result.reason));
        }
      });

      render(data);
      updatedAt.textContent = "업데이트: " + new Date().toLocaleTimeString("ko-KR");
      if (errors.length) {
        showDashboardError("일부 통계를 불러오지 못했습니다 — " + errors.join(" | "));
      } else {
        clearDashboardError();
      }
    });
  }

  function renderChannelBarChart(canvasId, rows) {
    renderBarChart(canvasId, rows.map(function (row) { return { label: channelLabel(row), value: hoursValue(row.seconds) }; }), formatHoursValue);
  }

  function loadHome() {
    return fetchAndRender(
      [
        { key: "summary", path: "/v1/admin/stats/summary" },
        { key: "live", path: "/v1/admin/stats/live" },
        { key: "daily", path: "/v1/admin/stats/daily?days=30" },
      ],
      function (data) {
        if (data.summary) renderHomeTiles(data.summary);
        if (data.live) {
          var top5 = (data.live.by_channel || []).slice(0, 5).map(function (row) {
            return { label: channelLabel(row), value: row.listeners };
          });
          renderBarChart("liveChannelsChartHome", top5, countLabel("명"));
        }
        if (data.daily) {
          var days = data.daily.days || [];
          var dayLabels = days.map(function (row) { return row.listen_date.slice(5); });
          renderLineChart("dailyHoursChart", dayLabels, days.map(function (row) { return hoursValue(row.seconds); }), formatHoursValue);
          renderLineChart("dailyListenersChart", dayLabels, days.map(function (row) { return row.listeners; }), countLabel("명"));
        }
      },
    );
  }

  function loadLive() {
    return fetchAndRender([{ key: "live", path: "/v1/admin/stats/live" }], function (data) {
      if (!data.live) return;
      var rows = (data.live.by_channel || []).map(function (row) { return { label: channelLabel(row), value: row.listeners }; });
      renderBarChart("liveChannelsChart", rows, countLabel("명"));
      renderLiveTable(data.live.sessions || []);
    });
  }

  function loadChannels() {
    return fetchAndRender(
      [
        { key: "byBroadcaster", path: "/v1/admin/stats/by-broadcaster" },
        { key: "byChannel", path: "/v1/admin/stats/by-channel?limit=20" },
        { key: "byRegion", path: "/v1/admin/stats/by-region" },
        { key: "byProgram", path: "/v1/admin/stats/by-program?limit=20" },
      ],
      function (data) {
        if (data.byBroadcaster) {
          renderBarChart(
            "byBroadcasterChart",
            (data.byBroadcaster.broadcasters || []).map(function (row) { return { label: row.broadcaster, value: hoursValue(row.seconds) }; }),
            formatHoursValue,
          );
        }
        if (data.byChannel) renderChannelBarChart("byChannelChart", data.byChannel.channels || []);
        if (data.byRegion) {
          renderBarChart(
            "byRegionChart",
            (data.byRegion.regions || []).map(function (row) { return { label: row.region_group, value: hoursValue(row.seconds) }; }),
            formatHoursValue,
          );
        }
        if (data.byProgram) {
          renderBarChart(
            "byProgramChart",
            (data.byProgram.programs || []).map(function (row) {
              return { label: (row.program_title || "제목 없음") + " · " + channelLabel(row), value: hoursValue(row.seconds) };
            }),
            formatHoursValue,
          );
        }
      },
    );
  }

  function loadVisitors() {
    return fetchAndRender([{ key: "visitors", path: "/v1/admin/stats/visitors?limit=50" }], function (data) {
      if (data.visitors) renderVisitorsTable(data.visitors.visitors || []);
    });
  }

  function loadDemographics() {
    return fetchAndRender([{ key: "demo", path: "/v1/admin/stats/demographics" }], function (data) {
      if (!data.demo) return;
      function toRows(list) {
        return (list || []).map(function (row) { return { label: row.label, value: row.count }; });
      }
      renderBarChart("countriesChart", toRows(data.demo.countries), countLabel("명"));
      renderBarChart("browsersChart", toRows(data.demo.browsers), countLabel("명"));
      renderBarChart("osChart", toRows(data.demo.os), countLabel("명"));
      renderBarChart("devicesChart", toRows(data.demo.devices), countLabel("명"));
      renderBarChart("referrersChart", toRows(data.demo.referrers), countLabel("회"));
    });
  }

  var loaders = { home: loadHome, live: loadLive, channels: loadChannels, visitors: loadVisitors, demographics: loadDemographics };
  var tabButtons = document.querySelectorAll(".tab-btn");
  var currentTab = "home";

  function setActiveTab(tab) {
    if (!loaders[tab]) tab = "home";
    currentTab = tab;
    Object.keys(loaders).forEach(function (key) {
      document.getElementById("page-" + key).hidden = key !== tab;
    });
    tabButtons.forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-tab") === tab);
    });
    if (location.hash.slice(1) !== tab) location.hash = tab;
    loaders[tab]();
    startAutoRefresh();
  }

  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(function () {
      if (document.hidden) return;
      loaders[currentTab]();
    }, AUTO_REFRESH_MS);
  }

  function enter() {
    showDashboard();
    setActiveTab(location.hash ? location.hash.slice(1) : "home");
  }

  gateForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var value = tokenInput.value.trim();
    if (!value) return;
    setToken(value);
    tokenInput.value = "";
    enter();
  });

  tabButtons.forEach(function (btn) {
    btn.addEventListener("click", function () { setActiveTab(btn.getAttribute("data-tab")); });
  });
  window.addEventListener("hashchange", function () { setActiveTab(location.hash.slice(1)); });

  document.getElementById("refreshBtn").addEventListener("click", function () {
    loaders[currentTab]();
  });

  document.getElementById("logoutBtn").addEventListener("click", function () {
    clearToken();
    showGate("");
  });

  if (getToken()) {
    enter();
  } else {
    showGate("");
  }
})();
</script>
</body>
</html>
`;
