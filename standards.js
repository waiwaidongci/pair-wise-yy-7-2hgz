// 标准资料：按“船型 + 桅杆数量”维护标准索位，写明名称与应有数量。
// 标准每次修订版本号 +1，供模型侧判断结论是否需要重算。

export function standardKey(shipType, mastCount) {
  return `${String(shipType || "").trim()}__${Number(mastCount)}`;
}

// 新模型建档时带出对应标准；没有维护则返回 null（结论为“未配标准”）。
export function findStandard(db, shipType, mastCount) {
  const key = standardKey(shipType, mastCount);
  return (db.standards || []).find((s) => s.key === key) || null;
}

export function listStandards(db) {
  return [...(db.standards || [])].sort(
    (a, b) =>
      a.shipType.localeCompare(b.shipType, "zh-Hans-CN") ||
      a.mastCount - b.mastCount
  );
}

function normalizePositions(input) {
  const positions = [];
  const seen = new Map();
  for (const row of Array.isArray(input) ? input : []) {
    const name = String(row.name || "").trim();
    const required = Math.max(0, Math.floor(Number(row.required)));
    if (!name) continue;
    if (seen.has(name)) {
      // 同一标准内索位名称合并，数量累加，避免标准自身重样。
      positions[seen.get(name)].required += required;
    } else {
      seen.set(name, positions.length);
      positions.push({ name, required });
    }
  }
  return positions;
}

// 新增或修订标准。返回 { standard, created, changed }。
export function upsertStandard(db, input) {
  const shipType = String(input.shipType || "").trim();
  const mastCount = Math.floor(Number(input.mastCount));
  if (!shipType) return { error: "shipType_required" };
  if (!Number.isInteger(mastCount) || mastCount <= 0)
    return { error: "mastCount_invalid" };

  const positions = normalizePositions(input.positions);
  if (positions.length === 0) return { error: "positions_required" };

  const key = standardKey(shipType, mastCount);
  const existing = (db.standards || []).find((s) => s.key === key);
  const now = new Date().toISOString();

  if (existing) {
    const before = new Map(existing.positions.map((p) => [p.name, p.required]));
    const changed =
      positions.length !== existing.positions.length ||
      positions.some((p) => before.get(p.name) !== p.required);
    existing.positions = positions;
    existing.updatedAt = now;
    if (changed) existing.version += 1;
    return { standard: existing, created: false, changed };
  }

  const standard = {
    key,
    shipType,
    mastCount,
    positions,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  db.standards ||= [];
  db.standards.push(standard);
  return { standard, created: true, changed: true };
}

export function deleteStandard(db, shipType, mastCount) {
  const key = standardKey(shipType, mastCount);
  const index = (db.standards || []).findIndex((s) => s.key === key);
  if (index < 0) return false;
  db.standards.splice(index, 1);
  return true;
}
