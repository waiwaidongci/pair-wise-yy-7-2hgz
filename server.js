import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { upsertStandard, deleteStandard, listStandards, standardKey } from "./standards.js";
import { evaluate, assertReady, recompute, recomputeAll } from "./completeness.js";
import { renderPage } from "./page.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "data", "model-rigging-calibration.json");
const port = Number(process.env.PORT || 3038);

const seedStandards = [
  {
    key: standardKey("福船", 3),
    shipType: "福船",
    mastCount: 3,
    version: 1,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    positions: [
      { name: "前桅侧支索", required: 2 },
      { name: "前桅升帆索", required: 1 },
      { name: "主桅侧支索", required: 2 },
      { name: "主桅升帆索", required: 1 },
      { name: "后桅侧支索", required: 2 },
      { name: "后桅升帆索", required: 1 },
    ],
  },
];

async function loadDb() {
  if (!existsSync(dbPath)) {
    await mkdir(dirname(dbPath), { recursive: true });
    const db = { standards: seedStandards, items: [] };
    await writeFile(dbPath, JSON.stringify(db, null, 2));
    return db;
  }
  const db = JSON.parse(await readFile(dbPath, "utf8"));
  // 兼容旧数据文件（只有 items）。
  if (!Array.isArray(db.standards)) db.standards = seedStandards;
  for (const item of db.items || []) {
    item.id ||= "MR-" + Math.random().toString(36).slice(2, 8);
    item.tasks ||= [];
    item.logs ||= [];
  }
  return db;
}
async function saveDb(db) {
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}
async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}
function html(res, text) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(text);
}
function newId() {
  return "MR-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function findItem(db, idOrCode) {
  return (
    db.items.find((x) => x.id === idOrCode || x.code === idOrCode) || null
  );
}
function pushLog(item, step, note) {
  item.logs ||= [];
  item.logs.push({ at: new Date().toISOString(), step, note });
}
// 列表/详情都带上实时判定结论（标准改版后自然重算）。
function summarize(db, item) {
  const verdict = evaluate(db, item);
  const logCount =
    (item.logs || []).length +
    (item.tasks || []).reduce((n, t) => n + (t.logs || []).length, 0);
  return { ...item, logCount, verdict };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const db = await loadDb();

    if (req.method === "GET" && url.pathname === "/")
      return html(res, renderPage());

    // ---------- 标准资料 ----------
    if (req.method === "GET" && url.pathname === "/api/standards")
      return send(res, 200, listStandards(db));

    if (req.method === "POST" && url.pathname === "/api/standards") {
      const input = await body(req);
      const result = upsertStandard(db, input);
      if (result.error) return send(res, 400, { error: result.error });
      // 标准改过后，已有模型的结论全部重算，原先通过的不算数。
      const affected = result.changed ? recomputeAll(db) : [];
      await saveDb(db);
      return send(res, result.created ? 201 : 200, {
        ...result,
        affected,
      });
    }

    const stdDel = url.pathname.match(/^\/api\/standards\/([^/]+)\/(\d+)$/);
    if (stdDel && req.method === "DELETE") {
      const shipType = decodeURIComponent(stdDel[1]);
      const mastCount = Number(stdDel[2]);
      const ok = deleteStandard(db, shipType, mastCount);
      if (!ok) return send(res, 404, { error: "standard_not_found" });
      const affected = recomputeAll(db);
      await saveDb(db);
      return send(res, 200, { ok: true, affected });
    }

    // ---------- 模型建档 ----------
    if (req.method === "GET" && url.pathname === "/api/items")
      return send(res, 200, db.items.map((it) => summarize(db, it)));

    if (req.method === "POST" && url.pathname === "/api/items") {
      const input = await body(req);
      const code = String(input.code || "").trim();
      if (!code) return send(res, 400, { error: "code_required" });

      let shipType = String(input.shipType || "").trim();
      let mastCount = Number(input.mastCount);
      // 建档选择标准后自动带出船型与桅杆数量。
      if (input.standardKey) {
        const std = (db.standards || []).find(
          (s) => s.key === input.standardKey
        );
        if (!std) return send(res, 400, { error: "standard_not_found" });
        shipType = std.shipType;
        mastCount = std.mastCount;
      }
      if (!shipType || !Number.isInteger(mastCount) || mastCount <= 0)
        return send(res, 400, { error: "shipType_or_mastCount_required" });
      if (db.items.some((x) => x.code === code))
        return send(res, 409, { error: "code_duplicated" });

      const item = {
        id: newId(),
        code,
        shipType,
        mastCount,
        scale: input.scale || "",
        riggingMaterial: input.riggingMaterial || "",
        owner: input.owner || "",
        dueDate: input.dueDate || "",
        status: "待检查",
        tasks: [],
        logs: [{ at: new Date().toISOString(), step: "建档", note: `创建模型，带出标准 ${shipType} · ${mastCount} 桅` }],
      };
      recompute(db, item);
      db.items.unshift(item);
      await saveDb(db);
      return send(res, 201, summarize(db, item));
    }

    const itemPatch = url.pathname.match(/^\/api\/items\/([^/]+)$/);
    if (itemPatch && req.method === "PATCH") {
      const item = findItem(db, decodeURIComponent(itemPatch[1]));
      if (!item) return send(res, 404, { error: "item_not_found" });
      const input = await body(req);
      if (input.status) {
        // 状态闸门：缺装/重样没补齐，进不了校准中及之后阶段。
        const guard = assertReady(db, item, input.status);
        if (!guard.ok) return send(res, 409, guard);
        if (input.status !== item.status) {
          item.status = input.status;
          pushLog(item, "状态", "更新为 " + input.status);
        }
      }
      await saveDb(db);
      return send(res, 200, summarize(db, item));
    }

    // ---------- 实际安装登记 ----------
    const install = url.pathname.match(
      /^\/api\/items\/([^/]+)\/installations$/
    );
    if (install && req.method === "POST") {
      const item = findItem(db, decodeURIComponent(install[1]));
      if (!item) return send(res, 404, { error: "item_not_found" });
      const input = await body(req);
      const position = String(input.position || "").trim();
      if (!position) return send(res, 400, { error: "position_required" });

      item.tasks ||= [];
      item.tasks.push({
        id: "T-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        position,
        status: "已登记",
        note: input.note || "",
        logs: [
          {
            at: new Date().toISOString(),
            note: input.note || "登记实际安装",
          },
        ],
      });
      pushLog(item, "安装", `登记索位 ${position}`);
      const verdict = recompute(db, item);
      if (!verdict.complete)
        pushLog(item, "核对", `仍未齐套：${verdict.result}，停在待检查`);
      await saveDb(db);
      return send(res, 201, summarize(db, item));
    }

    const uninstall = url.pathname.match(
      /^\/api\/items\/([^/]+)\/installations\/([^/]+)$/
    );
    if (uninstall && req.method === "DELETE") {
      const item = findItem(db, decodeURIComponent(uninstall[1]));
      if (!item) return send(res, 404, { error: "item_not_found" });
      const taskId = decodeURIComponent(uninstall[2]);
      const index = (item.tasks || []).findIndex(
        (t) => t.id === taskId
      );
      if (index < 0) return send(res, 404, { error: "installation_not_found" });
      const [removed] = item.tasks.splice(index, 1);
      pushLog(item, "撤装", `撤除索位 ${removed.position}`);
      recompute(db, item);
      await saveDb(db);
      return send(res, 200, summarize(db, item));
    }

    // 兼容旧接口：追加备注。
    const logAdd = url.pathname.match(/^\/api\/items\/([^/]+)\/logs$/);
    if (logAdd && req.method === "POST") {
      const item = findItem(db, decodeURIComponent(logAdd[1]));
      if (!item) return send(res, 404, { error: "item_not_found" });
      const input = await body(req);
      pushLog(item, input.step || "备注", input.note || "");
      await saveDb(db);
      return send(res, 201, summarize(db, item));
    }

    send(res, 404, { error: "not_found" });
  } catch (error) {
    send(res, 500, { error: error.message });
  }
});

// 启动时按当前标准复核一遍存量模型：旧数据或改版后仍缺装的，一律退回待检查。
const boot = await loadDb();
recomputeAll(boot);
await saveDb(boot);

server.listen(port, () =>
  console.log("古船模型索具齐套核对台 listening on http://localhost:" + port)
);
