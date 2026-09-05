// 관리자 통계 대시보드. 빌드 과정 없이 Worker가 직접 서빙하는 단일 HTML 페이지다.
// 같은 origin에서 /v1/admin/stats/*를 호출하므로 CORS 문제가 없고, 별도 배포도 필요 없다.
export const ADMIN_DASHBOARD_HTML = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>라디오 통계 대시보드</title>
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
  .bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 13px; }
  .bar-label { width: 40%; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-track { flex: 1; background: var(--gridline); border-radius: 4px; height: 16px; overflow: hidden; }
  .bar-fill { background: var(--accent); height: 100%; border-radius: 4px; }
  .bar-count { min-width: 32px; text-align: right; color: var(--text-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .empty { color: var(--text-muted); font-size: 13px; padding: 8px 0; }
  .daily-chart { display: flex; align-items: flex-end; gap: 3px; height: 120px; }
  .daily-bar-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
  .daily-bar { width: 100%; background: var(--accent); border-radius: 3px 3px 0 0; min-height: 2px; }
  .daily-label { font-size: 10px; color: var(--text-muted); margin-top: 4px; white-space: nowrap; }
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

    <section class="tiles" id="tiles"></section>

    <section class="panel">
      <h2>지금 듣고 있는 채널</h2>
      <div id="liveChannels"></div>
    </section>

    <section class="panel">
      <h2>최근 30일 청취 시간 추이 (사이트 전체)</h2>
      <div id="dailyChart" class="daily-chart"></div>
    </section>

    <section class="panel">
      <h2>방송국별 누적 청취 시간</h2>
      <div id="byBroadcaster"></div>
    </section>

    <section class="panel">
      <h2>채널별 누적 청취 시간</h2>
      <div id="byChannel"></div>
    </section>

    <section class="panel">
      <h2>지역별 누적 청취 시간 (수도권 vs 지역)</h2>
      <div id="byRegion"></div>
    </section>

    <section class="panel">
      <h2>프로그램 TOP</h2>
      <div id="byProgram"></div>
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

    <section class="panel">
      <h2>방문자 (최근 방문순, 탭하면 상세)</h2>
      <div class="table-wrap">
        <table id="visitorsTable">
          <thead><tr><th>국가</th><th>브라우저</th><th>OS</th><th>방문</th><th>오늘 청취</th><th>누적 청취</th><th>최근 방문</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </section>
  </div>
</div>
<script>
(function () {
  "use strict";

  var TOKEN_KEY = "radio-stats:admin-token";
  var LIVE_THRESHOLD_FALLBACK = 90;
  var AUTO_REFRESH_MS = 15000;

  var gate = document.getElementById("gate");
  var gateForm = document.getElementById("gateForm");
  var gateError = document.getElementById("gateError");
  var tokenInput = document.getElementById("tokenInput");
  var dashboard = document.getElementById("dashboard");
  var updatedAt = document.getElementById("updatedAt");
  var refreshTimer = null;

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
        throw new Error("request failed: " + response.status);
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

  function renderTiles(summary) {
    var tiles = document.getElementById("tiles");
    clearNode(tiles);
    var items = [
      ["전체 방문자", summary.visitors_total],
      ["오늘 방문자", summary.visitors_today],
      ["현재 접속", summary.currently_online],
      ["현재 청취", summary.currently_listening],
      ["오늘 청취 시간", formatHours(summary.listen_seconds_today_total)],
      ["누적 청취 시간", formatHours(summary.listen_seconds_alltime_total)],
    ];
    items.forEach(function (item) {
      var tile = el("div", "tile");
      tile.appendChild(el("div", "tile-label", item[0]));
      tile.appendChild(el("div", "tile-value", String(item[1])));
      tiles.appendChild(tile);
    });
  }

  // rows: [{ label, value }], formatValue(value) -> 표시할 텍스트. containerId 안에 막대 목록을 그린다.
  function renderBarList(containerId, rows, emptyMessage, formatValue) {
    var container = document.getElementById(containerId);
    clearNode(container);
    if (!rows.length) {
      container.appendChild(el("div", "empty", emptyMessage));
      return;
    }
    var format = formatValue || function (value) { return String(value); };
    var max = rows.reduce(function (acc, row) { return Math.max(acc, row.value); }, 1);
    rows.forEach(function (row) {
      var wrap = el("div", "bar-row");
      wrap.appendChild(el("div", "bar-label", row.label));
      var track = el("div", "bar-track");
      var fill = el("div", "bar-fill");
      fill.style.width = Math.max(4, Math.round((row.value / max) * 100)) + "%";
      track.appendChild(fill);
      wrap.appendChild(track);
      wrap.appendChild(el("div", "bar-count", format(row.value)));
      container.appendChild(wrap);
    });
  }

  function renderDailyChart(days) {
    var container = document.getElementById("dailyChart");
    clearNode(container);
    if (!days.length) {
      container.appendChild(el("div", "empty", "데이터가 아직 없습니다."));
      return;
    }
    var max = days.reduce(function (acc, row) { return Math.max(acc, row.seconds); }, 1);
    days.forEach(function (row) {
      var wrap = el("div", "daily-bar-wrap");
      var bar = el("div", "daily-bar");
      var heightPct = Math.max(2, Math.round((row.seconds / max) * 100));
      bar.style.height = heightPct + "%";
      bar.title = row.listen_date + " · " + formatHours(row.seconds);
      wrap.appendChild(bar);
      wrap.appendChild(el("div", "daily-label", row.listen_date.slice(5)));
      container.appendChild(wrap);
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
      row.appendChild(el("td", null, session.channel_id));
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
        line.appendChild(el("span", "pill", item.channel_id));
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

  function loadAll() {
    return Promise.all([
      authFetch("/v1/admin/stats/summary"),
      authFetch("/v1/admin/stats/live"),
      authFetch("/v1/admin/stats/daily?days=30"),
      authFetch("/v1/admin/stats/visitors?limit=50"),
      authFetch("/v1/admin/stats/by-broadcaster"),
      authFetch("/v1/admin/stats/by-channel?limit=20"),
      authFetch("/v1/admin/stats/by-region"),
      authFetch("/v1/admin/stats/by-program?limit=20"),
    ]).then(function (results) {
      renderTiles(results[0]);
      renderBarList(
        "liveChannels",
        (results[1].by_channel || []).map(function (row) { return { label: row.channel_id, value: row.listeners }; }),
        "지금 듣고 있는 사람이 없습니다.",
      );
      renderLiveTable(results[1].sessions || []);
      renderDailyChart(results[2].days || []);
      renderVisitorsTable(results[3].visitors || []);
      renderBarList(
        "byBroadcaster",
        (results[4].broadcasters || []).map(function (row) { return { label: row.broadcaster, value: row.seconds }; }),
        "데이터가 아직 없습니다.",
        formatHours,
      );
      renderBarList(
        "byChannel",
        (results[5].channels || []).map(function (row) { return { label: row.channel_id, value: row.seconds }; }),
        "데이터가 아직 없습니다.",
        formatHours,
      );
      renderBarList(
        "byRegion",
        (results[6].regions || []).map(function (row) { return { label: row.region_group, value: row.seconds }; }),
        "데이터가 아직 없습니다.",
        formatHours,
      );
      renderBarList(
        "byProgram",
        (results[7].programs || []).map(function (row) {
          return { label: (row.program_title || "제목 없음") + " · " + row.channel_id, value: row.seconds };
        }),
        "데이터가 아직 없습니다.",
        formatHours,
      );
      updatedAt.textContent = "업데이트: " + new Date().toLocaleTimeString("ko-KR");
    });
  }

  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(function () {
      if (document.hidden) return;
      loadAll().catch(function () {
        // 다음 주기에 다시 시도한다.
      });
    }, AUTO_REFRESH_MS);
  }

  function enter() {
    showDashboard();
    loadAll()
      .then(startAutoRefresh)
      .catch(function (error) {
        if (String(error.message) !== "unauthorized") {
          showDashboard();
        }
      });
  }

  gateForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var value = tokenInput.value.trim();
    if (!value) return;
    setToken(value);
    tokenInput.value = "";
    enter();
  });

  document.getElementById("refreshBtn").addEventListener("click", function () {
    loadAll().catch(function () {});
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
