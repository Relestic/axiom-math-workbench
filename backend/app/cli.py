"""Command line entry points: init, seed, reset, invite, stats."""

from __future__ import annotations

import argparse
import sys
from datetime import timedelta
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.engine import make_url

from . import create_app
from .auth import invite_hash, invite_prefix
from .config import load_config
from .db import get_engine, session_scope
from .models import (
    Attempt,
    Classic,
    Concept,
    Exercise,
    GraphEdge,
    GraphNode,
    Invite,
    Job,
    ModelCall,
    Proof,
    Textbook,
    User,
    utcnow,
)
from .seed.loader import seed_all
from .workers.queue import usage_summary


def _app(*, worker: bool = False, auto_migrate: bool = True):
    return create_app(
        {
            "worker_enabled": worker,
            "seed_on_start": False,
            "auto_migrate": auto_migrate,
            "testing": False,
        }
    )


def cmd_init(args) -> int:
    app = _app()
    with app.app_context():
        from migrations.runner import current, migrate

        migrate(get_engine())
        print("数据库已初始化" if not current(get_engine()) else "数据库已是最新迁移")
        print("迁移版本：", ", ".join(current(get_engine())) or "无")
    return 0


def cmd_seed(args) -> int:
    app = _app()
    with app.app_context():
        config = app.config["AXIOM"]
        with session_scope() as session:
            result = seed_all(session, config, with_demo=args.demo)
        print("种子数据完成：")
        print(
            "  教材：",
            result["content"]["textbook"],
            "（新建）" if result["content"]["created"] else "（已存在）",
        )
        for key, value in result["content"]["counts"].items():
            print(f"  {key}: {value}")
        print("  管理员：", result["admin"])
        print("  演示邀请码：", result["demo_invite"])
        if result.get("demo_user"):
            print("  演示账号：", result["demo_user"], "/", result["demo_password"])
        print("提示：演示邀请码与默认管理员密码仅用于本地试用，部署前必须更换。")
    return 0


def cmd_reset(args) -> int:
    if not args.yes:
        print("这会删除整个数据库。确认后加 --yes 重跑。", file=sys.stderr)
        return 1
    config = load_config()
    url = make_url(config.database_url)
    if url.get_backend_name() != "sqlite" or not url.database:
        print("只支持删除 SQLite 本地数据库；其他数据库请使用迁移或备份工具。", file=sys.stderr)
        return 1
    path = Path(url.database).resolve()
    data_dir = config.data_dir.resolve()
    if data_dir not in path.parents and path.parent != data_dir:
        print(f"拒绝删除数据目录之外的路径：{path}", file=sys.stderr)
        return 1
    for suffix in ("", "-wal", "-shm"):
        target = Path(str(path) + suffix)
        if target.exists():
            target.unlink()
            print("已删除", target)
    app = _app()
    with app.app_context():
        from migrations.runner import migrate

        migrate(get_engine())
        with session_scope() as session:
            result = seed_all(session, app.config["AXIOM"], with_demo=args.demo)
        print("已重建并写入种子数据：", result["content"]["counts"])
    return 0


def cmd_invite(args) -> int:
    app = _app()
    with app.app_context():
        config = app.config["AXIOM"]
        import uuid

        code = f"AXIOM-{uuid.uuid4().hex[:4].upper()}-{uuid.uuid4().hex[:4].upper()}"
        with session_scope() as session:
            admin = session.scalar(select(User).where(User.role == "admin").order_by(User.created_at))
            invite = Invite(
                code_hash=invite_hash(code),
                code_prefix=invite_prefix(code),
                role=args.role,
                note=args.note,
                created_by_id=admin.id if admin else None,
                expires_at=utcnow() + timedelta(days=args.days),
            )
            session.add(invite)
        print("邀请码（只显示一次）：", code)
        print("角色：", args.role, "有效期：", args.days, "天")
    return 0


def cmd_stats(args) -> int:
    app = _app()
    with app.app_context():
        with session_scope() as session:
            counts = {
                "users": session.scalar(select(func.count(User.id))) or 0,
                "textbooks": session.scalar(select(func.count(Textbook.id))) or 0,
                "concepts": session.scalar(select(func.count(Concept.id))) or 0,
                "proofs": session.scalar(select(func.count(Proof.id))) or 0,
                "classics": session.scalar(select(func.count(Classic.id))) or 0,
                "graph_nodes": session.scalar(select(func.count(GraphNode.id))) or 0,
                "graph_edges": session.scalar(select(func.count(GraphEdge.id))) or 0,
                "exercises": session.scalar(select(func.count(Exercise.id))) or 0,
                "attempts": session.scalar(select(func.count(Attempt.id))) or 0,
                "jobs": session.scalar(select(func.count(Job.id))) or 0,
                "model_calls": session.scalar(select(func.count(ModelCall.id))) or 0,
            }
            usage = usage_summary(session)
        for key, value in counts.items():
            print(f"{key:14} {value}")
        print("模型调用成本（微单位）：", usage["cost_estimate"])
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="Axiom 后端管理命令")
    sub = parser.add_subparsers(dest="command", required=True)

    init = sub.add_parser("init", help="创建或迁移数据库")
    init.set_defaults(func=cmd_init)

    seed = sub.add_parser("seed", help="写入示例内容（幂等）")
    seed.add_argument("--demo", action="store_true", help="同时创建演示学生与示例学习记录")
    seed.set_defaults(func=cmd_seed)

    reset = sub.add_parser("reset", help="删除并重建本地 SQLite 数据库")
    reset.add_argument("--yes", action="store_true", help="确认删除")
    reset.add_argument("--demo", action="store_true", help="重建后写入演示记录")
    reset.set_defaults(func=cmd_reset)

    invite = sub.add_parser("invite", help="生成邀请码")
    invite.add_argument("--role", choices=["student", "admin"], default="student")
    invite.add_argument("--note", default="命令行生成")
    invite.add_argument("--days", type=int, default=14)
    invite.set_defaults(func=cmd_invite)

    stats = sub.add_parser("stats", help="查看内容与使用统计")
    stats.set_defaults(func=cmd_stats)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
