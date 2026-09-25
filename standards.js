// 索具齐套核对台 —— 标准资料（业务代码之一）
// 职责：按船型与桅杆数量维护标准索位，每个索位写明名称和应有数量；
// 标准可改版本号，改动后由齐套判定重算已有模型。

import { findStandard, BizError, recomputeAll } from "./kitCheck.js";

export const seedStandards = [
  {
    id: "STD-FUCHUAN-3",
    shipType: "福船",
    mastCount: 3,
    version: 1,
    note: "福船三桅常用静索、动索配置",
    positions: [
      { name: "前桅侧支索", quantity: 2 },
      { name: "主桅侧支索", quantity: 2 },
      { name: "后桅侧支索", quantity: 2 },
      { name: "前桅升帆索", quantity: 1 },
      { name: "主桅升帆索", quantity: 1 },
      { name: "后桅升帆索", quantity: 1 },
      { name: "前桅稳索", quantity: 2 },
      { name: "主桅稳索", quantity: 2 },
      { name: "后桅稳索", quantity: 2 },
      { name: "船尾牵索", quantity: 1 },
      { name: "锚缆", quantity: 1 }
    ],
    updatedAt: "2026-06-01T00:00:00.000Z",
    deleted: false
  },
  {
    id: "STD-SHACHUAN-2",
    shipType: "沙船",
    mastCount: 2,
    version: 1,
    note: "沙船两桅简化配置",
    positions: [
      { name: "前桅侧支索", quantity: 2 },
      { name: "主桅侧支索", quantity: 2 },
      { name: "前桅升帆索", quantity: 1 },
      { name: "主桅升帆索", quantity: 1 },
      { name: "前桅稳索", quantity: 2 },
      { name: "主桅稳索", quantity: 2 },
      { name: "锚缆", quantity: 1 }
    ],
    updatedAt: "2026-06-01T00:00:00.000Z",
    deleted: false
  }
];

function normalizeMastCount(input) {
  const mastCount = Number(input);
  if (!Number.isInteger(mastCount) || mastCount <= 0) {
    throw new BizError("桅杆数量必须是正整数");
  }
  return mastCount;
}

// 校验索位清单：名称必填不重样，数量为正整数
export function normalizePositions(rawPositions) {
  const rows = Array.isArray(rawPositions) ? rawPositions : [];
  if (!rows.length) throw new BizError("至少维护一个标准索位");
  const positions = [];
  const names = new Set();
  for (const row of rows) {
    const name = String(row?.name ?? "").trim();
    const quantity = Number(row?.quantity);
    if (!name) throw new BizError("索位名称不能为空");
    if (names.has(name)) throw new BizError(`标准内索位重样：${name}`);
    if (!Number.isInteger(quantity) || quantity <= 0) throw new BizError(`索位「${name}」的应有数量必须是正整数`);
    names.add(name);
    positions.push({ name, quantity });
  }
  return positions;
}

function publicView(standard) {
  const { deleted, ...rest } = standard;
  return rest;
}

export function listStandards(db) {
  return (db.standards || []).filter(s => !s.deleted).map(publicView);
}

export function createStandard(db, input) {
  const shipType = String(input.shipType || "").trim();
  if (!shipType) throw new BizError("船型不能为空");
  const mastCount = normalizeMastCount(input.mastCount);
  if (findStandard(db, shipType, mastCount)) {
    throw new BizError(`${shipType} · ${mastCount} 桅的标准已存在，请直接修订`, 409);
  }
  const positions = normalizePositions(input.positions);
  const at = new Date().toISOString();
  const standard = {
    id: "STD-" + Date.now().toString(36).toUpperCase(),
    shipType,
    mastCount,
    version: 1,
    note: String(input.note || "").trim(),
    positions,
    updatedAt: at,
    deleted: false
  };
  db.standards ||= [];
  db.standards.push(standard);
  return publicView(standard);
}

// 修订标准（改名称 / 数量 / 增删索位）：版本号 +1，已有模型结论立即失效重算
export function updateStandard(db, id, input) {
  const standard = (db.standards || []).find(s => s.id === id && !s.deleted);
  if (!standard) throw new BizError("标准不存在", 404);

  const shipType = input.shipType !== undefined ? String(input.shipType).trim() : standard.shipType;
  if (!shipType) throw new BizError("船型不能为空");
  const mastCount = input.mastCount !== undefined ? normalizeMastCount(input.mastCount) : standard.mastCount;
  const other = findStandard(db, shipType, mastCount);
  if (other && other.id !== id) throw new BizError(`${shipType} · ${mastCount} 桅已有别的标准`, 409);
  const positions = normalizePositions(input.positions ?? standard.positions);

  const beforeKey = `${standard.shipType}@${standard.mastCount}`;
  const afterKey = `${shipType}@${mastCount}`;

  standard.shipType = shipType;
  standard.mastCount = mastCount;
  standard.note = input.note !== undefined ? String(input.note).trim() : standard.note;
  standard.positions = positions;
  standard.version += 1;
  standard.updatedAt = new Date().toISOString();

  // 船型/桅杆数量改了，前后两键的模型都受影响
  const affectedIds = new Set([standard.id]);
  recomputeAll(db, [...affectedIds], "标准索位资料已修订");
  if (beforeKey !== afterKey) recomputeAll(db, [], "标准船型/桅杆数量已调整");
  return publicView(standard);
}

export function deleteStandard(db, id) {
  const standard = (db.standards || []).find(s => s.id === id);
  if (!standard || standard.deleted) throw new BizError("标准不存在", 404);
  standard.deleted = true;
  standard.updatedAt = new Date().toISOString();
  // 删除同样算标准改版：依赖它的模型结论作废并退回待检查
  recomputeAll(db, [id], "标准资料已删除");
  return { id };
}

export { findStandard };
