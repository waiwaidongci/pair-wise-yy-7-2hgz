// 齐套判定：比对“标准应有数量”与“实际安装登记”，
// 列出缺装（应装未装够）与重样（同一索位登记超过应有数量）。
//
// 判定结论始终按当前标准实时计算，不落库为“最终结论”；
// 模型上只保存标准版本快照（checkedAtStandardVersion），
// 版本对不上即视为需要重算，原先通过的不算数。

import { findStandard } from "./standards.js";

export const RESULT_LABELS = {
  pass: "齐套",
  incomplete: "缺装",
  duplicate: "重样",
  both: "缺装+重样",
  noStandard: "未配标准",
};

// 实际安装记录：item.tasks 中每条都是一次索位安装登记（position 为索位名称）。
export function installedCounts(item) {
  const counts = new Map();
  for (const task of item.tasks || []) {
    const name = String(task.position || "").trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return counts;
}

// 核心比对：返回逐索位明细、缺装、重样、结论及标准版本。
export function evaluate(db, item) {
  const standard = findStandard(db, item.shipType, item.mastCount);
  if (!standard) {
    return {
      key: null,
      standardVersion: null,
      result: "noStandard",
      complete: false,
      missing: [],
      duplicates: [],
      rows: [],
      stale: true,
    };
  }

  const installed = installedCounts(item);
  const rows = [];
  const missing = [];
  const duplicates = [];
  let missingCount = 0;
  let duplicateCount = 0;

  for (const spec of standard.positions) {
    const actual = installed.get(spec.name) || 0;
    const miss = Math.max(0, spec.required - actual);
    const extra = Math.max(0, actual - spec.required);
    if (miss > 0) {
      missing.push({ name: spec.name, required: spec.required, actual, short: miss });
      missingCount += miss;
    }
    if (extra > 0) {
      duplicates.push({ name: spec.name, required: spec.required, actual, extra });
      duplicateCount += extra;
    }
    rows.push({
      name: spec.name,
      required: spec.required,
      actual,
      short: miss,
      extra,
      status: miss > 0 ? "missing" : extra > 0 ? "duplicate" : "ok",
    });
  }

  // 标准外的索位也算重样（同一索位挂错/多挂）。
  for (const [name, actual] of installed) {
    if (standard.positions.some((p) => p.name === name)) continue;
    duplicates.push({ name, required: 0, actual, extra: actual });
    duplicateCount += actual;
    rows.push({
      name,
      required: 0,
      actual,
      short: 0,
      extra: actual,
      status: "duplicate",
    });
  }

  const result =
    missingCount && duplicateCount
      ? "both"
      : missingCount
        ? "incomplete"
        : duplicateCount
          ? "duplicate"
          : "pass";

  // 模型上次通过时的标准版本与当前版本不一致 => 旧结论作废。
  const snapshotVersion = item.checkedAtStandardVersion ?? null;
  const stale = snapshotVersion !== standard.version;

  return {
    key: standard.key,
    standardVersion: standard.version,
    result,
    complete: result === "pass",
    missing,
    duplicates,
    missingCount,
    duplicateCount,
    rows,
    stale,
  };
}

// 允许进入“校准中”之后阶段（校准中/待复核/已交付）的唯一闸门：齐套通过。
export function assertReady(db, item, nextStatus) {
  const calibrationStage = "校准中";
  const stages = ["待检查", "校准中", "待复核", "已交付"];
  if (!stages.includes(nextStatus)) return { ok: false, error: "status_invalid" };
  if (stages.indexOf(nextStatus) < stages.indexOf(calibrationStage))
    return { ok: true };

  const verdict = evaluate(db, item);
  if (!verdict.complete) {
    return {
      ok: false,
      error: "kit_incomplete",
      reason: RESULT_LABELS[verdict.result],
      missing: verdict.missing,
      duplicates: verdict.duplicates,
      verdict,
    };
  }
  return { ok: true, verdict };
}

// 每次登记/删除安装后复核：
// 1) 记录通过时的标准版本快照；
// 2) 标准改版导致旧结论失效（stale）时，把模型退回“待检查”，
//    原先通过的不算数；缺装/重样没补齐一律停在“待检查”。
export function recompute(db, item) {
  const verdict = evaluate(db, item);
  item.kitResult = verdict.result;
  item.kitMissingCount = verdict.missingCount || 0;
  item.kitDuplicateCount = verdict.duplicateCount || 0;
  item.kitStandardVersion = verdict.standardVersion;
  item.kitEvaluatedAt = new Date().toISOString();

  if (verdict.complete) {
    item.checkedAtStandardVersion = verdict.standardVersion;
  } else {
    // 结论未通过：不在标准版本上，闸门自然挡住后续阶段。
    if (item.status && item.status !== "待检查") item.status = "待检查";
  }
  return verdict;
}

// 标准修订后批量重算受影响模型（同船型同桅杆数，且版本已落后）。
// 返回受影响模型清单：原先通过、现在缺装/重样的会被退回“待检查”。
export function recomputeAll(db) {
  const affected = [];
  for (const item of db.items || []) {
    const before = item.status;
    const beforePassed = item.checkedAtStandardVersion != null;
    const verdict = recompute(db, item);
    if (verdict.stale || before !== item.status || beforePassed !== verdict.complete) {
      affected.push({
        id: item.id || item.code,
        code: item.code,
        shipType: item.shipType,
        mastCount: item.mastCount,
        status: item.status,
        result: verdict.result,
        forcedBack: before !== "待检查" && item.status === "待检查",
      });
    }
  }
  return affected;
}
