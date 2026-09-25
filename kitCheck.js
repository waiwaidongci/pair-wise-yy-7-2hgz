// 索具齐套核对台 —— 齐套判定（业务代码之二）
// 职责：按标准索位核对模型实际安装记录，给出缺装 / 重样 / 未登记索位与齐套结论；
// 标准改版后重算所有在制模型；以及"待检查 → 校准中"的齐套闸门。

const stages = ["待检查", "校准中", "待复核", "已交付"];
const inProgressStages = ["待检查", "校准中", "待复核"];

export class BizError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// 按船型 + 桅杆数量匹配生效标准
export function findStandard(db, shipType, mastCount) {
  const key = `${(shipType || "").trim()}@${Number(mastCount)}`;
  return (db.standards || []).find(s => !s.deleted && `${s.shipType}@${Number(s.mastCount)}` === key) || null;
}

// 统计某索位的实际安装条数（同一索位重复登记即重样）
function countInstalled(installs, name) {
  return (installs || []).filter(i => i.position === name).length;
}

// 核对单张模型：逐项比对标准索位的应有数量与实装数量
export function evaluateKit(item, standard) {
  const installs = item.installations || [];
  const missing = [];
  const duplicates = [];
  const rows = [];
  let requiredTotal = 0;
  let installedOnStandard = 0;

  for (const pos of standard?.positions || []) {
    const required = Number(pos.quantity) || 0;
    requiredTotal += required;
    const actual = countInstalled(installs, pos.name);
    installedOnStandard += Math.min(actual, required);
    rows.push({
      position: pos.name,
      required,
      actual,
      gap: Math.max(0, required - actual),
      extra: Math.max(0, actual - required)
    });
    if (actual < required) {
      missing.push({ position: pos.name, required, actual, gap: required - actual });
    } else if (actual > required) {
      duplicates.push({ position: pos.name, required, actual, extra: actual - required });
    }
  }

  const standardNames = new Set((standard?.positions || []).map(p => p.name));
  const unrecognized = [];
  for (const install of installs) {
    if (!standardNames.has(install.position)) {
      unrecognized.push({ position: install.position, actual: countInstalled(installs, install.position) });
    }
  }

  const installedTotal = installs.length;
  return {
    standardId: standard?.id || null,
    standardName: standard ? `${standard.shipType}·${standard.mastCount}桅标准 v${standard.version}` : null,
    requiredTotal,
    installedTotal,
    rows,
    missing,
    duplicates,
    unrecognized: unrecognized.filter((row, i, arr) => arr.findIndex(r => r.position === row.position) === i),
    complete: missing.length === 0 && duplicates.length === 0 && unrecognized.length === 0
  };
}

// 组装一条模型的齐套结论（含标准改版后的失效判定）
export function buildConclusion(db, item) {
  const standard = findStandard(db, item.shipType, item.mastCount);
  const result = evaluateKit(item, standard);

  let state;
  let reason;
  if (!standard) {
    state = "no_standard";
    reason = `缺少 ${item.shipType} · ${item.mastCount} 桅的标准索位资料，先到「标准资料」建档`;
  } else if (item.checkStandardId !== standard.id || item.checkVersion !== standard.version) {
    state = "stale";
    reason = item.checkAt
      ? `标准已升级（v${item.checkVersion || "?"} → v${standard.version}），原齐套结论作废，请重新核对`
      : `请按「${standard.shipType}·${standard.mastCount}桅标准 v${standard.version}」完成齐套核对`;
  } else if (!result.complete) {
    state = "incomplete";
    const bits = [];
    if (result.missing.length) bits.push(`缺装 ${result.missing.length} 项`);
    if (result.duplicates.length) bits.push(`重样 ${result.duplicates.length} 项`);
    if (result.unrecognized.length) bits.push(`未登记索位 ${result.unrecognized.length} 项`);
    reason = bits.join("，");
  } else {
    state = "passed";
    reason = `齐套 ${result.requiredTotal} 根，核对通过`;
  }

  return { ...result, state, reason, checkAt: item.checkAt || null };
}

// 模型能否进入校准中：结论必须是"当前标准下已通过"
export function gateReason(db, item) {
  const conclusion = buildConclusion(db, item);
  return conclusion.state === "passed" ? null : conclusion.reason;
}

// 标准改过后重算所有模型：原先通过的一律不算数；
// 在制模型若在新标准下不齐套，退回待检查，校准停摆；已交付的不动。
export function recomputeAll(db, changedStandardIds = [], note = "标准索位资料已修订") {
  const at = new Date().toISOString();
  const affected = [];
  for (const item of db.items || []) {
    const standard = findStandard(db, item.shipType, item.mastCount);
    // 标准被删除时 findStandard 已找不到，但模型上次核对的正是它，仍属受影响范围
    const belongs = changedStandardIds.length === 0
      || (standard && changedStandardIds.includes(standard.id))
      || (item.checkStandardId && changedStandardIds.includes(item.checkStandardId));
    if (!belongs) continue;

    const wasPassed = Boolean(item.checkStandardId);
    const isComplete = standard ? evaluateKit(item, standard).complete : false;
    item.checkStandardId = null;
    item.checkVersion = null;
    item.checkAt = null;

    if (wasPassed) {
      item.logs ||= [];
      item.logs.push({ at, step: "标准改版", note: `${note}，原齐套结论作废，需重新核对` });
    }
    if (inProgressStages.includes(item.status) && item.status !== "待检查" && !isComplete) {
      item.status = "待检查";
      item.logs ||= [];
      item.logs.push({ at, step: "退回待检查", note: `标准改版后核对不齐，${note}` });
    }
    affected.push(item.id || item.code);
  }
  return affected;
}
