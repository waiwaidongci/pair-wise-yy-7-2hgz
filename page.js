// 页面：索具齐套核对台。
// 页签一维护标准资料；页签二建档模型、登记实际索位，
// 实时列出缺装与重样，缺装/重样未补齐时状态锁在“待检查”。

const stages = ["待检查", "校准中", "待复核", "已交付"];

export function renderPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>古船模型索具齐套核对台</title>
  <style>
    :root { --bg:#f1f3ef; --panel:#fff; --ink:#20241f; --muted:#687066; --line:#d4ddd0; --accent:#526f43; --warn:#9b4937; --ok:#3e6b45; }
    * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }
    h1 { margin:0; font-size:26px; } h2 { margin:0 0 12px; font-size:18px; } h3 { margin:0; }
    main { padding:22px 28px; }
    form,.panel,.card,.stat { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }
    label { display:block; margin:10px 0 5px; color:var(--muted); font-size:13px; } input,select,textarea { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px; font:inherit; background:#fff; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:10px 13px; font-weight:700; cursor:pointer; } button.secondary { background:#69736a; } button.danger { background:var(--warn); } button.mini { padding:4px 9px; font-size:12px; }
    .tabs { display:flex; gap:8px; margin-bottom:16px; } .tabs button { background:#e3e8df; color:var(--ink); } .tabs button.active { background:var(--accent); color:#fff; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; margin-bottom:14px; } .stat strong { display:block; font-size:24px; }
    .toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; } .toolbar select,.toolbar input { width:auto; min-width:160px; }
    .layout { display:grid; grid-template-columns:380px 1fr; gap:22px; align-items:start; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(330px,1fr)); gap:12px; }
    .card { display:grid; gap:8px; } .meta { color:var(--muted); font-size:13px; }
    .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:12px; }
    .pill.locked { border-color:var(--warn); color:var(--warn); } .pill.ok { border-color:var(--ok); color:var(--ok); }
    table { width:100%; border-collapse:collapse; font-size:13px; } th,td { text-align:left; padding:5px 6px; border-bottom:1px solid var(--line); } th { color:var(--muted); font-weight:400; }
    tr.miss td { color:var(--warn); font-weight:700; } tr.dup td { color:#a06a1f; font-weight:700; }
    .banner { border-radius:6px; padding:8px 10px; font-size:13px; } .banner.bad { background:#f6e5e0; color:var(--warn); } .banner.good { background:#e5efe4; color:var(--ok); } .banner.warn { background:#f6efdf; color:#8a6420; }
    .rowline { display:flex; gap:8px; align-items:center; } .rowline input { flex:1; } .rowline input.qty { max-width:90px; }
    .installs { max-height:110px; overflow:auto; border-top:1px solid var(--line); padding-top:8px; }
    .hidden { display:none; }
    @media (max-width:900px){ header{display:block;padding:18px 16px;} main{padding:16px;} .layout{grid-template-columns:1fr;} }
  </style>
</head>
<body>
  <header>
    <div><h1>古船模型索具齐套核对台</h1><div class="meta">按船型与桅杆数量维护标准索位，登记实装、核对缺装与重样</div></div>
    <button id="reload">刷新</button>
  </header>
  <main>
    <div class="tabs">
      <button id="tabCheck" class="active">齐套核对</button>
      <button id="tabStd">标准资料</button>
    </div>

    <section id="paneCheck">
      <div class="stats" id="stats"></div>
      <div class="layout">
        <div>
          <form id="createForm">
            <h2>模型建档（带出标准）</h2>
            <label>选择标准（船型 · 桅杆数）</label>
            <select name="standardKey" id="standardKey" required></select>
            <label>模型编号</label><input name="code" required>
            <label>比例</label><input name="scale" placeholder="如 1:48">
            <label>帆索材料</label><input name="riggingMaterial" placeholder="如 蜡线">
            <label>负责人</label><input name="owner">
            <label>交付日期</label><input name="dueDate" type="date">
            <div style="margin-top:12px"><button>建档并带出标准</button></div>
          </form>
          <form id="installForm" style="margin-top:14px">
            <h2>登记实际安装索位</h2>
            <label>选择模型</label>
            <select name="id" id="itemSelect"></select>
            <label>索位名称</label>
            <select name="position" id="positionSelect"></select>
            <input name="customPosition" id="customPosition" class="hidden" placeholder="输入标准外索位名称">
            <label>备注（可选）</label><input name="note">
            <div style="margin-top:12px"><button>登记一次安装</button></div>
          </form>
        </div>
        <div class="panel">
          <div class="toolbar">
            <select id="statusFilter"><option value="">全部状态</option>${stages.map((s) => `<option>${s}</option>`).join("")}</select>
            <select id="kitFilter"><option value="">全部齐套情况</option><option value="pass">齐套</option><option value="bad">缺装/重样</option><option value="noStandard">未配标准</option></select>
            <input id="search" placeholder="搜索编号 / 船型 / 索位">
          </div>
          <div class="grid" id="cards"></div>
        </div>
      </div>
    </section>

    <section id="paneStd" class="hidden">
      <div class="layout">
        <form id="standardForm" class="panel">
          <h2>维护标准索位</h2>
          <label>船型</label><input name="shipType" id="stdShipType" list="shipTypes" required placeholder="如 福船">
          <datalist id="shipTypes"></datalist>
          <label>桅杆数量</label><input name="mastCount" id="stdMastCount" type="number" min="1" required>
          <label>索位与应有数量</label>
          <div id="positionRows"></div>
          <button type="button" class="secondary mini" id="addPositionRow" style="margin-top:8px">＋ 增加索位</button>
          <div class="meta" style="margin-top:8px">船型 + 桅杆数相同即修订原标准，版本号加 1，已有模型结论自动重算。</div>
          <div style="margin-top:12px"><button>保存标准</button></div>
        </form>
        <div class="panel">
          <h2>标准清单</h2>
          <div id="standardCards" class="grid"></div>
        </div>
      </div>
    </section>
  </main>

  <script>
    const stages = ${JSON.stringify(stages)};
    let standards = [], items = [];

    async function api(path, options) {
      const res = await fetch(path, options && options.body ? { ...options, headers: { 'Content-Type': 'application/json' } } : options);
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data.error || '请求失败'), { data });
      return data;
    }
    const $ = (sel) => document.querySelector(sel);
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const itemId = (i) => i.id || i.code;

    // ---------- 标准资料 ----------
    function stdTitle(s) { return s.shipType + ' · ' + s.mastCount + ' 桅'; }
    function renderPositionRows() {
      const box = $('#positionRows');
      if (!box.children.length) addPositionRow('', 1);
    }
    function addPositionRow(name, qty) {
      const div = document.createElement('div');
      div.className = 'rowline';
      div.style.marginBottom = '6px';
      div.innerHTML = '<input name="posName" placeholder="索位名称，如 前桅侧支索" value="' + esc(name) + '">' +
        '<input class="qty" name="posQty" type="number" min="1" value="' + (qty ?? 1) + '">' +
        '<button type="button" class="danger mini">删</button>';
      div.querySelector('button').onclick = () => div.remove();
      $('#positionRows').appendChild(div);
    }
    function fillStandardForm(s) {
      $('#stdShipType').value = s.shipType;
      $('#stdMastCount').value = s.mastCount;
      $('#positionRows').innerHTML = '';
      s.positions.forEach(p => addPositionRow(p.name, p.required));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    function renderStandards() {
      $('#shipTypes').innerHTML = [...new Set(standards.map(s => s.shipType))].map(t => '<option value="' + esc(t) + '">').join('');
      $('#standardCards').innerHTML = standards.map(s =>
        '<article class="card"><h3>' + esc(stdTitle(s)) + '</h3>' +
        '<div class="meta">版本 v' + s.version + ' · 更新于 ' + esc((s.updatedAt || '').slice(0, 10)) + '</div>' +
        '<table><thead><tr><th>索位名称</th><th>应有数量</th></tr></thead><tbody>' +
        s.positions.map(p => '<tr><td>' + esc(p.name) + '</td><td>' + p.required + '</td></tr>').join('') +
        '</tbody></table>' +
        '<div class="rowline"><button class="secondary mini" data-edit="' + esc(s.key) + '">修订</button>' +
        '<button class="danger mini" data-del="' + esc(s.key) + '">删除</button></div></article>'
      ).join('') || '<div class="meta">尚未维护标准，先在左侧录入。</div>';
      document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => fillStandardForm(standards.find(s => s.key === b.dataset.edit)));
      document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
        const s = standards.find(x => x.key === b.dataset.del);
        if (!confirm('删除「' + stdTitle(s) + '」？使用它的模型将变为未配标准、无法进入校准。')) return;
        await api('/api/standards/' + encodeURIComponent(s.shipType) + '/' + s.mastCount, { method: 'DELETE' });
        await loadAll();
      });
    }

    $('#addPositionRow').onclick = () => addPositionRow('', 1);
    $('#standardForm').onsubmit = async (e) => {
      e.preventDefault();
      const rows = [...document.querySelectorAll('#positionRows .rowline')];
      const positions = rows.map(r => ({
        name: r.querySelector('[name=posName]').value.trim(),
        required: Number(r.querySelector('[name=posQty]').value),
      })).filter(p => p.name);
      try {
        const ret = await api('/api/standards', { method: 'POST', body: JSON.stringify({
          shipType: $('#stdShipType').value.trim(),
          mastCount: Number($('#stdMastCount').value),
          positions,
        }) });
        alert(ret.changed
          ? '标准已保存（v' + ret.standard.version + '），' + ret.affected.length + ' 个模型结论已重算，其中 ' + ret.affected.filter(a => a.forcedBack).length + ' 个退回待检查。'
          : '标准无变化。');
        $('#standardForm').reset(); $('#positionRows').innerHTML = ''; renderPositionRows();
        await loadAll();
      } catch (err) { alert('保存失败：' + err.message); }
    };

    // ---------- 模型建档 / 安装登记 ----------
    function renderStandardKeyOptions() {
      $('#standardKey').innerHTML = '<option value="">请选择标准…</option>' +
        standards.map(s => '<option value="' + esc(s.key) + '">' + esc(stdTitle(s)) + '（' + s.positions.length + ' 个索位）</option>').join('');
    }
    function currentItem() { return items.find(i => itemId(i) === $('#itemSelect').value); }
    function renderPositionOptions() {
      const item = currentItem();
      const sel = $('#positionSelect');
      if (!item || !item.verdict || item.verdict.result === 'noStandard') {
        sel.innerHTML = '<option value="">该模型无对应标准</option>';
        $('#customPosition').classList.add('hidden');
        return;
      }
      sel.innerHTML = '<option value="__custom__">其他索位（标准外，手输名称）</option>' +
        item.verdict.rows.map(r => '<option value="' + esc(r.name) + '">' + esc(r.name) + '（应 ' + r.required + ' / 已 ' + r.actual + '）</option>').join('');
      $('#customPosition').classList.add('hidden');
    }
    $('#positionSelect')?.addEventListener('change', () => {
      $('#customPosition').classList.toggle('hidden', $('#positionSelect').value !== '__custom__');
    });
    $('#itemSelect')?.addEventListener('change', renderPositionOptions);

    $('#createForm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData($('#createForm'));
      try {
        await api('/api/items', { method: 'POST', body: JSON.stringify(Object.fromEntries(fd.entries())) });
        $('#createForm').reset();
        await loadAll();
      } catch (err) { alert('建档失败：' + err.message); }
    };
    $('#installForm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData($('#installForm'));
      const data = Object.fromEntries(fd.entries());
      if (data.position === '__custom__') {
        data.position = (data.customPosition || '').trim();
        if (!data.position) return alert('请输入标准外索位名称');
      }
      delete data.customPosition;
      try {
        await api('/api/items/' + encodeURIComponent(data.id) + '/installations', { method: 'POST', body: JSON.stringify(data) });
        $('#installForm').reset(); renderPositionOptions(); await loadAll();
      } catch (err) { alert('登记失败：' + err.message); }
    };

    // ---------- 核对台 ----------
    function kitLabel(v) {
      return { pass: '齐套', incomplete: '缺装', duplicate: '重样', both: '缺装+重样', noStandard: '未配标准' }[v.result] || '-';
    }
    function renderStats() {
      const stats = Object.fromEntries(stages.map(s => [s, 0]));
      let pass = 0, bad = 0;
      items.forEach(i => { stats[i.status] = (stats[i.status] || 0) + 1; if (i.verdict?.complete) pass++; else bad++; });
      $('#stats').innerHTML = Object.entries(stats).map(([k, v]) => '<div class="stat"><span>' + k + '</span><strong>' + v + '</strong></div>').join('')
        + '<div class="stat"><span>齐套</span><strong style="color:var(--ok)">' + pass + '</strong></div>'
        + '<div class="stat"><span>缺装/重样/无标准</span><strong style="color:var(--warn)">' + bad + '</strong></div>';
    }
    function cardHtml(item) {
      const v = item.verdict || { result: 'noStandard', rows: [], missing: [], duplicates: [] };
      const locked = !v.complete;
      const rows = v.result === 'noStandard'
        ? '<div class="banner warn">未找到「' + esc(item.shipType) + ' · ' + esc(item.mastCount) + ' 桅」标准，无法核对，也不能进入校准。</div>'
        : '<table><thead><tr><th>索位</th><th>应有</th><th>已装</th><th>判定</th></tr></thead><tbody>' +
          v.rows.map(r => '<tr class="' + (r.short ? 'miss' : r.extra ? 'dup' : '') + '"><td>' + esc(r.name) + '</td><td>' + r.required + '</td><td>' + r.actual + '</td><td>' +
            (r.short ? '缺 ' + r.short : r.extra ? '重 ' + r.extra : '✓') + '</td></tr>').join('') +
          '</tbody></table>';
      const banner = v.result === 'pass'
        ? '<div class="banner good">齐套通过（标准 v' + v.standardVersion + '），可进入校准中。</div>'
        : v.result === 'noStandard' ? ''
        : '<div class="banner bad">未齐套：' + esc(kitLabel(v)) +
          (v.missingCount ? '，缺装 ' + v.missingCount + ' 处' : '') + (v.duplicateCount ? '，重样 ' + v.duplicateCount + ' 处' : '') +
          '。模型停在待检查，进不了校准中。</div>';
      const stale = v.stale && v.result !== 'pass'
        ? '<div class="banner warn">标准已改版，原有通过结论作废，需按新标准补齐。</div>'
        : (v.stale ? '<div class="banner warn">标准已改版，结论已按新标准重算。</div>' : '');
      const installs = (item.tasks || []).map((t, idx) =>
        '<div class="rowline meta"><span style="flex:1">' + esc(t.position) + (t.note ? '（' + esc(t.note) + '）' : '') + '</span>' +
        '<button class="danger mini" data-delinst="' + itemId(item) + '" data-task="' + esc(t.id) + '">撤装</button></div>'
      ).join('') || '<div class="meta">尚未登记安装</div>';
      return '<article class="card">' +
        '<div class="rowline" style="justify-content:space-between"><h3>' + esc(item.code) + '</h3>' +
        '<span class="pill ' + (locked ? 'locked' : 'ok') + '">' + esc(kitLabel(v)) + '</span></div>' +
        '<div class="meta">' + esc(item.shipType) + ' · ' + esc(item.mastCount) + ' 桅 · 负责人 ' + esc(item.owner || '—') + '</div>' +
        '<span class="pill ' + (locked ? 'locked' : '') + '">' + esc(item.status) + (locked && item.status === '待检查' ? '（锁定）' : '') + '</span>' +
        stale + banner + rows +
        '<label>模型状态</label><select data-status="' + esc(itemId(item)) + '"' + (locked ? ' data-locked="1"' : '') + '>' +
        stages.map(s => '<option ' + (s === item.status ? 'selected' : '') + (locked && s !== '待检查' ? ' disabled' : '') + '>' + s + '</option>').join('') + '</select>' +
        '<div class="installs">' + installs + '</div>' +
        '</article>';
    }
    function renderCards() {
      $('#itemSelect').innerHTML = items.map(i => '<option value="' + esc(itemId(i)) + '">' + esc(i.code) + ' · ' + esc(i.shipType) + ' ' + esc(i.mastCount) + '桅</option>').join('');
      renderPositionOptions();
      renderStats();
      const status = $('#statusFilter').value, kit = $('#kitFilter').value, q = $('#search').value.trim();
      const visible = items.filter(i => {
        if (status && i.status !== status) return false;
        if (kit === 'pass' && !i.verdict?.complete) return false;
        if (kit === 'bad' && (!i.verdict || i.verdict.result === 'pass' || i.verdict.result === 'noStandard')) return false;
        if (kit === 'noStandard' && i.verdict?.result !== 'noStandard') return false;
        if (q && !JSON.stringify(i).includes(q)) return false;
        return true;
      });
      $('#cards').innerHTML = visible.map(cardHtml).join('') || '<div class="meta">没有符合条件的模型。</div>';
      document.querySelectorAll('[data-status]').forEach(sel => sel.onchange = async () => {
        try {
          await api('/api/items/' + encodeURIComponent(sel.dataset.status), { method: 'PATCH', body: JSON.stringify({ status: sel.value }) });
        } catch (err) {
          const d = err.data || {};
          let msg = '进不了「' + sel.value + '」：';
          msg += d.reason ? d.reason : err.message;
          if (d.missing?.length) msg += '；缺装：' + d.missing.map(m => m.name + '×' + m.short).join('、');
          if (d.duplicates?.length) msg += '；重样：' + d.duplicates.map(m => m.name + '多' + m.extra).join('、');
          alert(msg);
        }
        await loadAll();
      });
      document.querySelectorAll('[data-delinst]').forEach(btn => btn.onclick = async () => {
        await api('/api/items/' + encodeURIComponent(btn.dataset.delinst) + '/installations/' + encodeURIComponent(btn.dataset.task), { method: 'DELETE' });
        await loadAll();
      });
    }

    async function loadAll() {
      [standards, items] = await Promise.all([api('/api/standards'), api('/api/items')]);
      renderStandardKeyOptions();
      renderStandards();
      renderCards();
    }
    $('#tabCheck').onclick = () => { $('#paneCheck').classList.remove('hidden'); $('#paneStd').classList.add('hidden'); $('#tabCheck').classList.add('active'); $('#tabStd').classList.remove('active'); };
    $('#tabStd').onclick = () => { $('#paneStd').classList.remove('hidden'); $('#paneCheck').classList.add('hidden'); $('#tabStd').classList.add('active'); $('#tabCheck').classList.remove('active'); };
    $('#statusFilter').onchange = renderCards;
    $('#kitFilter').onchange = renderCards;
    $('#search').oninput = renderCards;
    $('#reload').onclick = loadAll;
    renderPositionRows();
    loadAll();
  </script>
</body>
</html>`;
}
