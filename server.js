import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderPage } from "./page.js";
import {
  seedStandards, listStandards, createStandard, updateStandard, deleteStandard
} from "./standards.js";
import {
  BizError, findStandard, evaluateKit, buildConclusion, gateReason, recomputeAll
} from "./kitCheck.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "data", "model-rigging-calibration.json");
const port = Number(process.env.PORT || 3038);

// 演示模型：福船 3 桅，故意留下缺装（多项未登记）和重样（后桅升帆索登记 2 次）
const seed = {
  standards: seedStandards,
  items: [
    {
      code: "MR-001",
      shipType: "福船",
      scale: "1:48",
      mastCount: 3,
      riggingMaterial: "蜡线",
      owner: "周宁",
      dueDate: "2026-06-28",
      status: "待检查",
      checkStandardId: null,
      checkVersion: null,
      checkAt: null,
      installations: [
        { id: "I-1", position: "前桅侧支索", note: "", at: "2026-06-10T00:00:00.000Z" },
        { id: "I-2", position: "主桅侧支索", note: "", at: "2026-06-10T00:00:00.000Z" },
        { id: "I-3", position: "后桅升帆索", note: "第一次穿索", at: "2026-06-11T00:00:00.000Z" },
        { id: "I-4", position: "后桅升帆索", note: "重复登记", at: "2026-06-12T00:00:00.000Z" }
      ],
      tasks: [
        {
          id: "T-1",
          position: "前桅侧支索",
          tension: "偏松",
          status: "调整中",
          logs: [{ at: "2026-06-12", note: "已缩短2mm" }]
        }
      ],
      logs: [{ at: "2026-06-01T00:00:00.000Z", step: "建档", note: "创建模型" }]
    }
  ]
};

const fields = [["code", "模型编号", "text"], ["shipType", "船型", "text"], ["scale", "比例", "text"], ["mastCount", "桅杆数量", "number"], ["riggingMaterial", "帆索材料", "text"], ["owner", "负责人", "text"], ["dueDate", "交付日期", "date"]];
const stages = ["待检查", "校准中", "待复核", "已交付"];
const statLabels = ["待检查", "校准中", "待复核", "已交付"];
const editableFields = fields.map(f => f[0]);
const stageIndex = Object.fromEntries(stages.map((s, i) => [s, i]));

async function loadDb() {
  if (!existsSync(dbPath)) {
    await mkdir(dirname(dbPath), { recursive: true });
    await writeFile(dbPath, JSON.stringify(seed, null, 2));
    return structuredClone(seed);
  }
  const db = JSON.parse(await readFile(dbPath, "utf8"));
  db.standards ||= seedStandards;
  // 旧库迁移：补齐齐套核对字段并按现行标准重算一次
  let migrated = false;
  for (const item of db.items || []) {
    if (!Array.isArray(item.installations)) {
      item.installations = [];
      migrated = true;
    }
    if (!("checkStandardId" in item)) {
      item.checkStandardId = null;
      item.checkVersion = null;
      item.checkAt = null;
      migrated = true;
    }
  }
  if (migrated) {
    recomputeAll(db, [], "补齐齐套核对字段，按现行标准重算");
    await writeFile(dbPath, JSON.stringify(db, null, 2));
  }
  return db;
}
async function saveDb(db) { await writeFile(dbPath, JSON.stringify(db, null, 2)); }

async function readBody(req) {
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
function newId(prefix) { return prefix + "-" + Date.now().toString(36).toUpperCase(); }

function findItem(db, key) {
  return db.items.find(x => x.id === key || x.code === key) || null;
}
function summarize(db, item) {
  const logCount = (item.logs || []).length + (item.tasks || []).reduce((n, t) => n + (t.logs || []).length, 0);
  return { ...item, logCount, kit: buildConclusion(db, item) };
}
function computeStats(items) {
  const stats = Object.fromEntries(statLabels.map(label => [label, 0]));
  for (const item of items) {
    if (stats[item.status] !== undefined) stats[item.status] += 1;
  }
  return stats;
}
function nowNote(step, note) {
  return { at: new Date().toISOString(), step, note };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const db = await loadDb();

    // ---------- 页面 ----------
    if (req.method === "GET" && url.pathname === "/") return html(res, renderPage());

    // ---------- 标准资料 ----------
    if (req.method === "GET" && url.pathname === "/api/standards") {
      return send(res, 200, listStandards(db));
    }
    if (req.method === "POST" && url.pathname === "/api/standards") {
      const standard = createStandard(db, await readBody(req));
      await saveDb(db);
      return send(res, 201, standard);
    }
    const standardRoute = url.pathname.match(/^\/api\/standards\/([^/]+)$/);
    if (standardRoute && req.method === "PUT") {
      const standard = updateStandard(db, standardRoute[1], await readBody(req));
      await saveDb(db);
      return send(res, 200, standard);
    }
    if (standardRoute && req.method === "DELETE") {
      const result = deleteStandard(db, standardRoute[1]);
      await saveDb(db);
      return send(res, 200, result);
    }

    // ---------- 模型 ----------
    if (req.method === "GET" && url.pathname === "/api/items") {
      return send(res, 200, db.items.map(item => summarize(db, item)));
    }
    if (req.method === "POST" && url.pathname === "/api/items") {
      const input = await readBody(req);
      const code = String(input.code || "").trim();
      if (!code) throw new BizError("模型编号不能为空");
      const mastCount = Number(input.mastCount);
      if (!Number.isInteger(mastCount) || mastCount <= 0) throw new BizError("桅杆数量必须是正整数");
      if (findItem(db, code)) throw new BizError("模型编号已存在", 409);

      const standard = findStandard(db, input.shipType, mastCount);
      const item = {
        id: newId("MR"),
        ...Object.fromEntries(editableFields.map(k => [k, k === "mastCount" ? mastCount : (input[k] ?? "")])),
        code,
        status: "待检查",
        checkStandardId: null,
        checkVersion: null,
        checkAt: null,
        installations: [],
        tasks: [],
        logs: [nowNote("建档", standard
          ? `建档并带出标准：${standard.shipType}·${standard.mastCount}桅 v${standard.version}，应装 ${standard.positions.reduce((n, p) => n + p.quantity, 0)} 根`
          : "建档时没有匹配的标准资料")]
      };
      db.items.unshift(item);
      await saveDb(db);
      return send(res, 201, summarize(db, item));
    }

    const itemRoute = url.pathname.match(/^\/api\/items\/([^/]+)$/);
    if (itemRoute && req.method === "PATCH") {
      const item = findItem(db, decodeURIComponent(itemRoute[1]));
      if (!item) throw new BizError("模型不存在", 404);
      const input = await readBody(req);

      let newMast = item.mastCount;
      if (input.mastCount !== undefined) {
        newMast = Number(input.mastCount);
        if (!Number.isInteger(newMast) || newMast <= 0) throw new BizError("桅杆数量必须是正整数");
      }
      const newShipType = input.shipType !== undefined ? String(input.shipType).trim() : item.shipType;
      const standardChanged = newShipType !== item.shipType || newMast !== item.mastCount;

      if (input.status !== undefined && input.status !== item.status) {
        if (!stages.includes(input.status)) throw new BizError("未知状态");
        // 缺装没补齐就停在待检查：任何向前流转（含直接跳到待复核/已交付）都要过齐套闸门
        if (item.status === "待检查" && stageIndex[input.status] > stageIndex["待检查"]) {
          const block = gateReason(db, item);
          if (block) throw new BizError(`齐套核对未通过：${block}，模型不能离开待检查`, 409);
        }
        item.status = input.status;
        item.logs.push(nowNote("状态", `更新为 ${item.status}`));
      }

      for (const key of editableFields) {
        if (key === "code" || input[key] === undefined) continue;
        item[key] = key === "mastCount" ? newMast : input[key];
      }
      if (standardChanged) {
        // 船型或桅杆数量一变，等于换了标准：原结论作废并重算
        recomputeAll(db, [], "模型船型/桅杆数量变更，按新标准重算");
        item.logs.push(nowNote("标准变更", `改按 ${newShipType}·${newMast}桅标准核对`));
      }

      await saveDb(db);
      return send(res, 200, summarize(db, item));
    }

    // ---------- 登记实装索位 ----------
    const installRoute = url.pathname.match(/^\/api\/items\/([^/]+)\/installations$/);
    if (installRoute && req.method === "POST") {
      const item = findItem(db, decodeURIComponent(installRoute[1]));
      if (!item) throw new BizError("模型不存在", 404);
      const input = await readBody(req);
      const position = String(input.position || "").trim();
      if (!position) throw new BizError("索具位置不能为空");
      const standard = findStandard(db, item.shipType, item.mastCount);
      if (!standard) throw new BizError("该船型与桅杆数量还没有标准，无法登记索位", 409);
      if (!standard.positions.some(p => p.name === position)) {
        throw new BizError(`「${position}」不在标准索位中，登记后会算未登记索位；请先修订标准`, 409);
      }
      item.installations ||= [];
      item.installations.push({
        id: newId("I"),
        position,
        note: String(input.note || "").trim(),
        at: new Date().toISOString()
      });
      const result = evaluateKit(item, standard);
      const tag = result.duplicates.some(d => d.position === position)
        ? `（重样：应 ${standard.positions.find(p => p.name === position).quantity} 实 ${result.rows.find(r => r.position === position).actual}）`
        : "";
      item.logs.push(nowNote("实装登记", `${position}${tag}`));
      await saveDb(db);
      return send(res, 201, summarize(db, item));
    }

    const uninstallRoute = url.pathname.match(/^\/api\/items\/([^/]+)\/installations\/(\d+)$/);
    if (uninstallRoute && req.method === "DELETE") {
      const item = findItem(db, decodeURIComponent(uninstallRoute[1]));
      if (!item) throw new BizError("模型不存在", 404);
      const idx = Number(uninstallRoute[2]);
      const removed = (item.installations || [])[idx];
      if (!removed) throw new BizError("登记记录不存在", 404);
      item.installations.splice(idx, 1);
      item.logs.push(nowNote("撤销登记", removed.position));
      await saveDb(db);
      return send(res, 200, summarize(db, item));
    }

    // ---------- 齐套核对提交 ----------
    const checkRoute = url.pathname.match(/^\/api\/items\/([^/]+)\/check$/);
    if (checkRoute && req.method === "POST") {
      const item = findItem(db, decodeURIComponent(checkRoute[1]));
      if (!item) throw new BizError("模型不存在", 404);
      const standard = findStandard(db, item.shipType, item.mastCount);
      if (!standard) throw new BizError("缺少该船型与桅杆数量的标准资料", 409);
      const result = evaluateKit(item, standard);
      if (!result.complete) {
        const bits = [];
        if (result.missing.length) bits.push(`缺装 ${result.missing.length} 项（${result.missing.map(m => m.position).join("、")}）`);
        if (result.duplicates.length) bits.push(`重样 ${result.duplicates.length} 项（${result.duplicates.map(m => m.position).join("、")}）`);
        if (result.unrecognized.length) bits.push(`未登记索位 ${result.unrecognized.length} 项`);
        throw new BizError(`齐套核对未通过：${bits.join("；")}。补齐后再提交`, 409);
      }
      item.checkStandardId = standard.id;
      item.checkVersion = standard.version;
      item.checkAt = new Date().toISOString();
      item.logs.push(nowNote("齐套核对", `按 ${standard.shipType}·${standard.mastCount}桅 v${standard.version} 核对通过，应装 ${result.requiredTotal} 根`));
      await saveDb(db);
      return send(res, 200, summarize(db, item));
    }

    // ---------- 校准任务（沿用旧功能，但必须齐套通过） ----------
    const actionRoute = url.pathname.match(/^\/api\/items\/([^/]+)\/action$/);
    if (actionRoute && req.method === "POST") {
      const item = findItem(db, decodeURIComponent(actionRoute[1]));
      if (!item) throw new BizError("模型不存在", 404);
      const block = gateReason(db, item);
      if (block) throw new BizError(`齐套核对未通过：${block}，不能开始校准任务`, 409);
      const input = await readBody(req);
      item.tasks ||= [];
      item.tasks.push({
        id: newId("T"),
        position: String(input.position || "").trim(),
        tension: String(input.tension || "未评"),
        status: "调整中",
        logs: [{ at: new Date().toISOString(), note: input.note || "新增帆索任务" }]
      });
      item.status = "校准中";
      item.logs.push(nowNote("帆索", `${input.position} · ${input.tension || "未评"}`));
      await saveDb(db);
      return send(res, 201, summarize(db, item));
    }

    const logRoute = url.pathname.match(/^\/api\/items\/([^/]+)\/logs$/);
    if (logRoute && req.method === "POST") {
      const item = findItem(db, decodeURIComponent(logRoute[1]));
      if (!item) throw new BizError("模型不存在", 404);
      const input = await readBody(req);
      item.logs ||= [];
      item.logs.push(nowNote(input.step || "记录", input.note || ""));
      await saveDb(db);
      return send(res, 201, summarize(db, item));
    }

    if (req.method === "GET" && url.pathname === "/api/stats") {
      return send(res, 200, { stages: computeStats(db.items) });
    }
    send(res, 404, { error: "not_found" });
  } catch (error) {
    const status = error instanceof BizError ? error.status : 500;
    send(res, status, { error: status === 500 ? error.message : error.message });
  }
});

server.listen(port, () => console.log("古船模型索具齐套核对台 listening on http://localhost:" + port));
