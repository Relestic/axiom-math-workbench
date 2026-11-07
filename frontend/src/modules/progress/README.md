# 学习进度模块

> 迁移状态：边界已定义；当前页面/服务仍在现有目录，按 `MODULES.md` 的顺序逐步迁入，
> 不复制第二套数据或场景契约。

## 负责范围

掌握度、诊断、复习计划、工作台聚合、图谱中的学习状态。

## 对外接口

`pages/Dashboard.tsx`、`Diagnostic.tsx`、`maps/`；`GET /api/v1/dashboard`、`progress/*`、`POST /diagnostic`、`GET /graph`。

## 数据归属

可写派生进度/诊断/复习状态；只读 Attempt 与教学内容，不能改答案或笔记。

## 验收标准

提交/自评后工作台与热力图更新；越权 Attempt 不进入统计；重复提交幂等。

## 约束

- 只通过模块接口读写；跨模块不能直接改另一个模块的状态。
- ID 使用 `frontend/src/modules/contracts.ts` 中的字符串约定。
- 字段变更必须与后端 Pydantic schema 同一次验收。
- 详细边界见 [`../../../../MODULES.md`](../../../../MODULES.md)。
