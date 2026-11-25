# 练习与复盘模块

> 迁移状态：边界已定义；当前页面/服务仍在现有目录，按 `MODULES.md` 的顺序逐步迁入，
> 不复制第二套数据或场景契约。

## 负责范围

出题、提示、完整解答、作答、批改反馈、错因、自评与复盘。

## 对外接口

`pages/learning/Exercises.tsx`、`Review.tsx`；`POST /api/v1/attempts`、`GET /exercises`、`/hint`、`/solution`。

## 数据归属

练习模块是 Exercise/Attempt 的唯一写入者；用户只能写自己的作答；进度模块只读 Attempt。

## 验收标准

计算题符号检查、证明结构分、无法解析不强行判错、幂等与越权测试通过。

## 约束

- 只通过模块接口读写；跨模块不能直接改另一个模块的状态。
- ID 使用 `frontend/src/modules/contracts.ts` 中的字符串约定。
- 字段变更必须与后端 Pydantic schema 同一次验收。
- 详细边界见 [`../../../../MODULES.md`](../../../../MODULES.md)。
