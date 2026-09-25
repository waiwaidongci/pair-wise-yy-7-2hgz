# 古船模型索具齐套核对台

船模配索不再只靠师傅经验：按**船型 + 桅杆数量**维护标准索位（名称与应有数量），
模型建档时自动带出对应标准；逐条登记实装索位，页面立即列出**缺装**与**重样**；
缺装没补齐模型停在「待检查」，进不了「校准中」。标准改版后已有模型的结论全部作废重算。

## 运行

```bash
npm start
```

访问 `http://localhost:3038`。数据保存在 `data/model-rigging-calibration.json`（首次启动自动生成种子数据；旧格式数据启动时自动迁移并重算）。

## 三份业务代码

| 文件 | 职责 |
| --- | --- |
| `standards.js` | **标准资料**：按船型与桅杆数量维护标准索位，写明名称和应有数量；新建/修订（升版本号）/删除，校验索位不重样、数量为正整数。 |
| `kitCheck.js` | **齐套判定**：按标准逐项比对实装数量，给出去装、重样、未登记索位与齐套结论；「待检查 → 校准中」齐套闸门；标准改版后重算全部在制模型（原通过的结论作废，不齐者退回待检查）。 |
| `page.js` | **页面**：标准维护、模型建档（填写船型/桅杆数量即提示将带出的标准）、实装登记与撤销、齐套核对清单（应/实对照表、缺装重样标记、状态流转）。 |

`server.js` 只做 HTTP 路由和存储，判定口径全部来自 `kitCheck.js`。

## 核对状态（kit.state）

- `no_standard` 缺少该船型与桅杆数量的标准资料，先建标准。
- `stale` 标准改版或尚未提交核对，原结论作废，需重新核对。
- `incomplete` 当前标准下有缺装 / 重样 / 未登记索位，停在待检查。
- `passed` 齐套核对通过（记录 `checkStandardId/checkVersion/checkAt`），方可进入校准中、添加校准任务。

## 主要接口

- 标准：`GET/POST /api/standards`，`PUT/DELETE /api/standards/:id`
- 模型：`GET/POST /api/items`，`PATCH /api/items/:id`
- 实装：`POST /api/items/:id/installations`，`DELETE /api/items/:id/installations/:index`
- 核对：`POST /api/items/:id/check`
- 校准任务（需齐套通过）：`POST /api/items/:id/action`
- 备注：`POST /api/items/:id/logs`
