# 教学内容模块

> 迁移状态：边界已定义；当前页面/服务仍在现有目录，按 `MODULES.md` 的顺序逐步迁入，
> 不复制第二套数据或场景契约。

## 负责范围

教材、知识点、定义/条件、定理、证明、经典正反例与出处。

## 对外接口

`pages/learning/Textbook.tsx`、`Proof.tsx`；`GET /api/v1/catalog`、`concepts/{id}`、`sections/{id}`、`proofs/{id}`。

## 数据归属

教学内容/管理员可写；其他模块只读，只能引用 concept_id / proof_step_ref。

## 验收标准

未发布内容对学生不可见；引用不存在的证明步骤失败；内容可追溯出处。

## 约束

- 只通过模块接口读写；跨模块不能直接改另一个模块的状态。
- ID 使用 `frontend/src/modules/contracts.ts` 中的字符串约定。
- 字段变更必须与后端 Pydantic schema 同一次验收。
- 详细边界见 [`../../../../MODULES.md`](../../../../MODULES.md)。
