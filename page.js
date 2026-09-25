// 索具齐套核对台 —— 页面（业务代码之三）
// 职责：标准资料维护、模型建档带出标准、登记实装索位、列出缺装与重样、
// 齐套通过后才放行校准中。页面只负责展示与交互，判定口径全部来自服务端。

export function renderPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>古船模型索具齐套核对台</title>
  <style>
    :root { --bg:#f1f3ef; --panel:#fff; --ink:#20241f; --muted:#687066; --line:#d4ddd0; --accent:#526f43; --warn:#9b4937; --hold:#8a6d1f; --ok:#3f7a4d; }
    * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }
    h1 { margin:0; font-size:26px; } h2 { margin:0 0 12px; font-size:18px; } h3 { margin:0; font-size:16px; }
    main { display:grid; grid-template-columns:400px 1fr; gap:22px; padding:22px 28px; align-items:start; }
    form,.panel,.card,.stat { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }
    .leftcol { display:grid; gap:14px; }
    label { display:block; margin:10px 0 5px; color:var(--muted); font-size:13px; } input,select,textarea { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px; font:inherit; background:#fff; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:9px 12px; font-weight:700; cursor:pointer; } button.secondary { background:#69736a; } button.danger { background:var(--warn); } button:disabled { opacity:.45; cursor:not-allowed; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:10px; margin-bottom:14px; } .stat strong { display:block; font-size:22px; }
    .toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; } .toolbar select,.toolbar input { width:auto; min-width:150px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(330px,1fr)); gap:12px; }
    .card { display:grid; gap:8px; }
    .meta { color:var(--muted); font-size:13px; }
    .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:3px 9px; font-size:12px; }
    .badge { display:inline-block; border-radius:999px; padding:4px 10px; font-size:12px; font-weight:700; justify-self:start; }
    .badge.passed { background:#e4f0e4; color:var(--ok); border:1px solid #b6d4b6; }
    .badge.incomplete { background:#f7e3de; color:var(--warn); border:1px solid #e0b6ac; }
    .badge.stale { background:#f6ecd2; color:var(--hold); border:1px solid #dcc78e; }
    .badge.no_standard { background:#e9ece7; color:var(--muted); border:1px solid var(--line); }
    table.kv { width:100%; border-collapse:collapse; font-size:13px; } table.kv th,table.kv td { border-bottom:1px solid var(--line); padding:4px 6px; text-align:left; }
    table.kv td.num { text-align:right; font-variant-numeric:tabular-nums; }
    tr.miss td { color:var(--warn); font-weight:700; } tr.dup td { color:var(--hold); font-weight:700; } tr.ok td { color:var(--ok); }
    .chips { display:flex; flex-wrap:wrap; gap:6px; }
    .chip { border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:12px; background:#fafcf9; }
    .chip button { border:0; background:none; color:var(--warn); font-weight:700; cursor:pointer; padding:0 0 0 4px; font-size:12px; }
    .chip.dup { border-color:#dcc78e; background:#fbf5e4; } .chip.unknown { border-color:#e0b6ac; background:#fdf2ef; }
    .rowline { display:flex; gap:8px; align-items:center; } .rowline select { flex:1; }
    .logs { border-top:1px solid var(--line); padding-top:8px; max-height:86px; overflow:auto; }
    .hint { font-size:12px; color:var(--muted); } .warn { color:var(--warn); font-weight:700; }
    .stdrow { border:1px solid var(--line); border-radius:6px; padding:8px 10px; margin-bottom:8px; display:flex; justify-content:space-between; gap:8px; align-items:center; }
    .stdrow .btns { display:flex; gap:6px; }
    #stdEditor { border-top:1px dashed var(--line); margin-top:12px; padding-top:12px; display:none; }
    .posline { display:grid; grid-template-columns:1fr 92px 30px; gap:6px; margin-bottom:6px; } .posline button { padding:0; }
    @media (max-width:900px){ header{display:block;padding:18px 16px;} main{grid-template-columns:1fr;padding:16px;} }
  </style>
</head>
<body>
  <header>
    <div><h1>古船模型索具齐套核对台</h1><div class="meta">按船型与桅杆数量维护标准索位，登记实装即列出缺装与重样；齐套通过才放行校准中</div></div>
    <button id="reload">刷新</button>
  </header>
  <main>
    <div class="leftcol">
      <form id="standardForm" class="panel">
        <h2>标准资料</h2>
        <div id="standardList"></div>
        <button type="button" id="newStandardBtn" class="secondary">新建标准</button>
        <div id="stdEditor">
          <input type="hidden" name="id">
          <label>船型</label><input name="shipType" required placeholder="如：福船">
          <label>桅杆数量</label><input name="mastCount" type="number" min="1" step="1" required>
          <label>索位（名称 + 应有数量）</label>
          <div id="stdPosLines"></div>
          <button type="button" id="addPosLine" class="secondary">加一行索位</button>
          <label>备注</label><input name="note" placeholder="选配说明（可选）">
          <div class="rowline" style="margin-top:12px"><button type="submit">保存标准</button><button type="button" id="cancelStdBtn" class="secondary">取消</button></div>
          <div class="hint">修订标准会升版本号，已建档模型的原齐套结论立即作废并重算。</div>
        </div>
      </form>

      <form id="createForm" class="panel">
        <h2>模型建档</h2>
        <div id="fields"></div>
        <div class="hint" id="standardHint"></div>
        <div style="margin-top:12px"><button>建档</button></div>
      </form>

      <form id="installForm" class="panel">
        <h2>登记实装索位</h2>
        <label>选择模型</label><select name="id" id="itemSelect"></select>
        <label>实装索位</label>
        <div class="rowline"><select name="position" id="positionSelect"></select></div>
        <label>备注（可选）</label><input name="note" placeholder="如：已穿三眼扣">
        <div style="margin-top:12px"><button>提交登记</button></div>
      </form>
    </div>

    <section>
      <div class="stats" id="stats"></div>
      <div class="toolbar">
        <select id="statusFilter"><option value="">全部状态</option></select>
        <select id="kitFilter">
          <option value="">全部核对结论</option>
          <option value="passed">齐套通过</option>
          <option value="incomplete">有缺装/重样</option>
          <option value="stale">标准改版待重核</option>
          <option value="no_standard">缺少标准</option>
        </select>
        <input id="search" placeholder="搜索编号 / 船型 / 索位">
      </div>
      <div class="panel">
        <h2>齐套核对清单</h2>
        <div class="grid" id="cards"></div>
      </div>
    </section>
  </main>

  <script>
  (function () {
    const fields = [["code","模型编号","text"],["shipType","船型","text"],["scale","比例","text"],["mastCount","桅杆数量","number"],["riggingMaterial","帆索材料","text"],["owner","负责人","text"],["dueDate","交付日期","date"]];
    const stages = ["待检查","校准中","待复核","已交付"];
    const stateLabels = { passed:"齐套通过", incomplete:"有缺装/重样", stale:"标准改版待重核", no_standard:"缺少标准" };

    const $ = function (sel) { return document.querySelector(sel); };
    let items = [];
    let standards = [];

    async function api(path, options) {
      const res = await fetch(path, options && options.body ? Object.assign({}, options, { headers: { "Content-Type": "application/json" } }) : options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "请求失败");
      return data;
    }
    function esc(v) {
      return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
        return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
      });
    }

    // ---------- 标准资料维护 ----------
    function renderStandardList() {
      $("#standardList").innerHTML = standards.length ? standards.map(function (s) {
        return '<div class="stdrow"><div><b>' + esc(s.shipType) + " · " + s.mastCount + '桅</b>'
          + ' <span class="pill">v' + s.version + "</span>"
          + ' <span class="meta">' + s.positions.length + ' 个索位 · 应装 '
          + s.positions.reduce(function (n, p) { return n + Number(p.quantity); }, 0) + " 根</span></div>"
          + '<div class="btns"><button type="button" class="secondary" data-edit="' + s.id + '">修订</button>'
          + '<button type="button" class="danger" data-del="' + s.id + '">删除</button></div></div>';
      }).join("") : '<div class="meta" style="margin-bottom:10px">还没有标准，先建一条。</div>';

      document.querySelectorAll("[data-edit]").forEach(function (btn) {
        btn.onclick = function () { openStdEditor(standards.find(function (s) { return s.id === btn.dataset.edit; })); };
      });
      document.querySelectorAll("[data-del]").forEach(function (btn) {
        btn.onclick = async function () {
          if (!confirm("删除后依赖该标准的模型结论全部作废并退回待检查，确认？")) return;
          await safe(function () { return api("/api/standards/" + btn.dataset.del, { method: "DELETE" }); });
          await load();
        };
      });
    }

    function positionLines(positions) {
      $("#stdPosLines").innerHTML = (positions && positions.length ? positions : [{ name: "", quantity: 1 }]).map(function (p) {
        return '<div class="posline"><input data-posname value="' + esc(p.name) + '" placeholder="索位名称"><input data-posqty type="number" min="1" step="1" value="' + (p.quantity || 1) + '"><button type="button" class="secondary" data-rmpos>×</button></div>';
      }).join("");
      $("#stdPosLines").querySelectorAll("[data-rmpos]").forEach(function (b) {
        b.onclick = function () { b.closest(".posline").remove(); };
      });
    }
    function openStdEditor(standard) {
      const form = $("#standardForm");
      $("#stdEditor").style.display = "block";
      form.elements.id.value = standard ? standard.id : "";
      form.elements.shipType.value = standard ? standard.shipType : "";
      form.elements.mastCount.value = standard ? standard.mastCount : "";
      form.elements.note.value = standard ? (standard.note || "") : "";
      positionLines(standard ? standard.positions : null);
    }
    function closeStdEditor() { $("#stdEditor").style.display = "none"; }

    $("#newStandardBtn").onclick = function () { openStdEditor(null); };
    $("#cancelStdBtn").onclick = closeStdEditor;
    $("#addPosLine").onclick = function () {
      const div = document.createElement("div");
      div.className = "posline";
      div.innerHTML = '<input data-posname placeholder="索位名称"><input data-posqty type="number" min="1" step="1" value="1"><button type="button" class="secondary" data-rmpos>×</button>';
      div.querySelector("[data-rmpos]").onclick = function () { div.remove(); };
      $("#stdPosLines").appendChild(div);
    };
    $("#standardForm").onsubmit = async function (event) {
      event.preventDefault();
      const form = event.currentTarget;
      const positions = [];
      $("#stdPosLines").querySelectorAll(".posline").forEach(function (line) {
        positions.push({ name: line.querySelector("[data-posname]").value.trim(), quantity: Number(line.querySelector("[data-posqty]").value) });
      });
      const payload = {
        shipType: form.elements.shipType.value.trim(),
        mastCount: Number(form.elements.mastCount.value),
        note: form.elements.note.value.trim(),
        positions: positions
      };
      const id = form.elements.id.value;
      await safe(async function () {
        await api(id ? "/api/standards/" + id : "/api/standards", id
          ? { method: "PUT", body: JSON.stringify(payload) }
          : { method: "POST", body: JSON.stringify(payload) });
        closeStdEditor();
        await load();
      });
    };

    // ---------- 模型建档（带出对应标准） ----------
    function renderCreateForm() {
      $("#fields").innerHTML = fields.map(function (f) {
        return "<label>" + f[1] + '</label><input name="' + f[0] + '" type="' + f[2] + '"' + (f[0] === "code" ? " required" : "") + (f[0] === "mastCount" ? ' min="1" step="1"' : "") + ">";
      }).join("");
      updateStandardHint();
      $("#createForm").elements.shipType.addEventListener("input", updateStandardHint);
      $("#createForm").elements.mastCount.addEventListener("input", updateStandardHint);
    }
    function updateStandardHint() {
      const shipType = $("#createForm").elements.shipType.value.trim();
      const mastCount = Number($("#createForm").elements.mastCount.value);
      const hit = standards.find(function (s) { return s.shipType === shipType && s.mastCount === mastCount; });
      $("#standardHint").innerHTML = shipType && mastCount
        ? hit
          ? '将带出标准：<b>' + esc(hit.shipType) + " · " + hit.mastCount + '桅 v' + hit.version + "</b>，共 " + hit.positions.length + " 个索位、应装 " + hit.positions.reduce(function (n, p) { return n + p.quantity; }, 0) + " 根"
          : '<span class="warn">该船型与桅杆数量还没有标准，请先到上方建立标准资料</span>'
        : "填写船型和桅杆数量后自动匹配标准索位。";
    }
    $("#createForm").onsubmit = async function (event) {
      event.preventDefault();
      const form = event.currentTarget;
      const data = Object.fromEntries(new FormData(form).entries());
      data.mastCount = Number(data.mastCount);
      await safe(async function () {
        await api("/api/items", { method: "POST", body: JSON.stringify(data) });
        form.reset();
        updateStandardHint();
        await load();
      });
    };

    // ---------- 登记实装索位 ----------
    function renderInstallForm() {
      $("#itemSelect").innerHTML = items.map(function (item) {
        return '<option value="' + esc(item.id) + '">' + esc(item.code) + " · " + esc(item.shipType) + " · " + item.mastCount + "桅</option>";
      }).join("");
      rebuildPositionOptions();
    }
    function rebuildPositionOptions() {
      const item = items.find(function (x) { return x.id === $("#itemSelect").value; }) || items[0];
      if (item && $("#itemSelect").value !== item.id) $("#itemSelect").value = item.id;
      const standard = item ? (item.kit || {}).standardName : null;
      const positions = item && item.kit ? item.kit.rows.map(function (r) { return r.position; }) : [];
      const installed = item ? item.installations.map(function (i) { return i.position; }) : [];
      $("#positionSelect").innerHTML = positions.map(function (p) {
        return '<option value="' + esc(p) + '">' + esc(p) + (installed.filter(function (q) { return q === p; }).length ? "（已登记）" : "") + "</option>";
      }).join("");
      const note = item && item.kit && item.kit.standardId ? "" : "（当前没有匹配标准，索位下拉为空）";
      if (note) $("#positionSelect").innerHTML = "";
    }
    $("#itemSelect").onchange = rebuildPositionOptions;
    $("#installForm").onsubmit = async function (event) {
      event.preventDefault();
      const form = event.currentTarget;
      const data = Object.fromEntries(new FormData(form).entries());
      if (!data.position) return alert("请选择索位");
      await safe(async function () {
        await api("/api/items/" + encodeURIComponent(data.id) + "/installations", { method: "POST", body: JSON.stringify({ position: data.position, note: data.note }) });
        form.reset();
        await load();
      });
    };

    // ---------- 齐套核对卡片 ----------
    function statusOptions(item) {
      const blocked = item.status === "待检查" && item.kit.state !== "passed";
      return stages.map(function (s, i) {
        const disabled = blocked && i > stages.indexOf("待检查");
        return '<option value="' + s + '"' + (s === item.status ? " selected" : "") + (disabled ? " disabled" : "") + ">" + s + (disabled ? "（齐套未过）" : "") + "</option>";
      }).join("");
    }

    function cardHtml(item) {
      const kit = item.kit || {};
      const rows = (kit.rows || []).map(function (r) {
        const cls = r.actual < r.required ? "miss" : (r.actual > r.required ? "dup" : "ok");
        const flag = r.actual < r.required ? "缺装 ×" + r.gap : (r.actual > r.required ? "重样 +" + r.extra : "齐");
        return '<tr class="' + cls + '"><td>' + esc(r.position) + '</td><td class="num">应 ' + r.required + '</td><td class="num">实 ' + r.actual + '</td><td class="num">' + flag + "</td></tr>";
      }).join("");

      const chips = (item.installations || []).map(function (ins, idx) {
        const dup = kit.duplicates.some(function (d) { return d.position === ins.position; });
        const unknown = (kit.unrecognized || []).some(function (d) { return d.position === ins.position; });
        const cls = dup ? "chip dup" : (unknown ? "chip unknown" : "chip");
        return '<span class="' + cls + '">' + esc(ins.position) + (ins.note ? "：" + esc(ins.note) : "") + '<button title="撤销该条登记" data-uninstall="' + idx + '">×</button></span>';
      }).join("");

      const main = fields.slice(0, 4).map(function (f) {
        return "<div><b>" + f[1] + "</b> " + esc(item[f[0]]) + "</div>";
      }).join("");

      const tasks = (item.tasks || []).slice(-3).map(function (t) {
        return '<div class="meta">校准任务 ' + esc(t.position) + " · " + esc(t.tension) + " · " + esc(t.status) + "</div>";
      }).join("");

      const logs = (item.logs || []).slice(-4).map(function (l) {
        return "<div>" + esc(l.step) + "：" + esc(l.note) + "</div>";
      }).join("");

      const canCheck = kit.state === "incomplete" || kit.state === "stale";
      const checkBtn = item.status === "待检查"
        ? '<button data-check="' + esc(item.id) + '"' + (canCheck ? "" : " disabled") + ">" + (kit.state === "stale" ? "标准改版，重新核对" : "提交齐套核对") + "</button>"
        : "";
      const blocked = item.status === "待检查" && kit.state !== "passed"
        ? '<div class="warn">⛔ ' + esc(kit.reason) + "，模型停在待检查，进不了校准中</div>" : "";
      const passedLine = kit.state === "passed"
        ? '<div class="meta">✔ ' + esc(kit.reason) + (kit.checkAt ? "（" + esc(new Date(kit.checkAt).toLocaleString("zh-CN")) + "）" : "") + "</div>" : "";

      const taskBtn = kit.state === "passed"
        ? '<div class="rowline"><select data-taskpos>' + (kit.rows || []).map(function (r) { return '<option>' + esc(r.position) + "</option>"; }).join("") + '</select><input data-tasktension placeholder="松紧状态"><button class="secondary" data-addtask>加校准任务</button></div>'
        : '<div class="hint">齐套核对通过后才能添加校准任务、进入校准中。</div>';

      return '<article class="card">'
        + "<h3>" + esc(item.code) + ' <span class="pill">' + esc(item.status) + "</span></h3>"
        + '<span class="badge ' + kit.state + '">' + esc(stateLabels[kit.state] || kit.state) + "</span>"
        + main
        + '<div class="meta">' + esc(kit.standardName || "未匹配标准") + " · 应装 " + (kit.requiredTotal || 0) + " 根 / 实装 " + (kit.installedTotal || 0) + " 根</div>"
        + (rows.length ? '<table class="kv"><tbody>' + rows + "</tbody></table>" : "")
        + ((kit.unrecognized || []).length ? '<div class="warn">未登记索位：' + kit.unrecognized.map(function (u) { return esc(u.position) + "（" + u.actual + ' 条）'; }).join("、") + "</div>" : "")
        + '<div class="chips">' + (chips || '<span class="meta">尚无实装登记</span>') + "</div>"
        + blocked + passedLine
        + '<label>流转状态</label><select data-status="' + esc(item.id) + '">' + statusOptions(item) + "</select>"
        + '<div class="rowline">' + checkBtn + '<button class="secondary" data-note="' + esc(item.id) + '">追加备注</button></div>'
        + taskBtn
        + (tasks ? '<div>' + tasks + "</div>" : "")
        + '<div class="logs meta">' + (logs || "暂无记录") + "</div>"
        + "</article>";
    }

    function render() {
      renderStandardList();
      renderInstallForm();
      const status = $("#statusFilter").value;
      if ($("#statusFilter").options.length === 1) $("#statusFilter").innerHTML = '<option value="">全部状态</option>' + stages.map(function (s) { return "<option>" + s + "</option>"; }).join("");
      $("#statusFilter").value = status;

      const stats = {};
      stages.forEach(function (s) { stats[s] = 0; });
      items.forEach(function (i) { if (stats[i.status] !== undefined) stats[i.status] += 1; });
      const passedCount = items.filter(function (i) { return (i.kit || {}).state === "passed"; }).length;
      $("#stats").innerHTML = stages.map(function (s) {
        return '<div class="stat"><span>' + s + "</span><strong>" + stats[s] + "</strong></div>";
      }).join("") + '<div class="stat"><span>齐套通过</span><strong>' + passedCount + "</strong></div>";

      const kitState = $("#kitFilter").value;
      const q = $("#search").value.trim();
      const visible = items.filter(function (item) {
        return (!status || item.status === status)
          && (!kitState || (item.kit || {}).state === kitState)
          && (!q || JSON.stringify(item).includes(q));
      });
      $("#cards").innerHTML = visible.map(cardHtml).join("") || '<div class="meta">没有符合条件的模型。</div>';
      bindCardEvents();
    }

    function bindCardEvents() {
      document.querySelectorAll("[data-status]").forEach(function (sel) {
        sel.onchange = async function () {
          await safe(async function () {
            await api("/api/items/" + encodeURIComponent(sel.dataset.status), { method: "PATCH", body: JSON.stringify({ status: sel.value }) });
            await load();
          }, function () { render(); });
        };
      });
      document.querySelectorAll("[data-check]").forEach(function (btn) {
        btn.onclick = async function () {
          await safe(async function () {
            await api("/api/items/" + encodeURIComponent(btn.dataset.check) + "/check", { method: "POST" });
            await load();
          });
        };
      });
      document.querySelectorAll("[data-uninstall]").forEach(function (b) {
        b.onclick = async function () {
          await safe(async function () {
            const modelId = findCardItemId(b);
            const idx = Number(b.dataset.uninstall);
            await api("/api/items/" + encodeURIComponent(modelId) + "/installations/" + idx, { method: "DELETE" });
            await load();
          });
        };
      });
      document.querySelectorAll("[data-note]").forEach(function (btn) {
        btn.onclick = async function () {
          const note = prompt("记录备注");
          if (!note) return;
          await safe(async function () {
            await api("/api/items/" + encodeURIComponent(btn.dataset.note) + "/logs", { method: "POST", body: JSON.stringify({ step: "备注", note: note }) });
            await load();
          });
        };
      });
      document.querySelectorAll("[data-addtask]").forEach(function (btn) {
        btn.onclick = async function () {
          const line = btn.closest(".rowline");
          const card = btn.closest(".card");
          const modelId = findCardItemId(btn);
          const position = line.querySelector("[data-taskpos]").value;
          const tension = line.querySelector("[data-tasktension]").value || "未评";
          await safe(async function () {
            await api("/api/items/" + encodeURIComponent(modelId) + "/action", { method: "POST", body: JSON.stringify({ position: position, tension: tension, note: "齐套通过后新增校准任务" }) });
            await load();
          });
        };
      });
    }

    // 从卡片上的按钮反查模型 id
    function findCardItemId(el) {
      const card = el.closest(".card");
      const checkBtn = card.querySelector("[data-check]");
      if (checkBtn) return checkBtn.dataset.check;
      const noteBtn = card.querySelector("[data-note]");
      if (noteBtn) return noteBtn.dataset.note;
      const statusSel = card.querySelector("[data-status]");
      return statusSel ? statusSel.dataset.status : null;
    }

    async function load() {
      [items, standards] = await Promise.all([api("/api/items"), api("/api/standards")]);
      render();
    }
    async function safe(fn, onFail) {
      try { await fn(); } catch (e) { alert(e.message); if (onFail) onFail(); }
    }

    $("#statusFilter").onchange = render;
    $("#kitFilter").onchange = render;
    $("#search").oninput = render;
    $("#reload").onclick = load;

    renderCreateForm();
    load();
  })();
  </script>
</body>
</html>`;
}
