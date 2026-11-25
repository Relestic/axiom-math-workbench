# 账号与权限模块

> 迁移状态：边界已定义；当前页面/服务仍在现有目录，按 `MODULES.md` 的顺序逐步迁入，
> 不复制第二套数据或场景契约。

## 负责范围

登录、刷新、用户身份、管理员权限、数据归属、邀请码与限流。

## 对外接口

`pages/Auth.tsx`、`app/DataProvider.tsx` 会话部分；`/api/v1/auth/*`、`/api/v1/admin/*`。

## 数据归属

账号模块是 User/Session/Invite 的唯一写入者；其他模块只接收已验证 User，数据必须带 user_id 并校验归属。

## 验收标准

刷新令牌重放被拒绝；越权 404/403；管理员操作有审计；密钥不进前端/日志。

## 约束

- 只通过模块接口读写；跨模块不能直接改另一个模块的状态。
- ID 使用 `frontend/src/modules/contracts.ts` 中的字符串约定。
- 字段变更必须与后端 Pydantic schema 同一次验收。
- 详细边界见 [`../../../../MODULES.md`](../../../../MODULES.md)。
