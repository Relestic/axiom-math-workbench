"""Persist per-user reader rules and correction examples."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import ReaderExample, ReaderRule, User

TASKS = ("recognition", "image", "qa")

DEFAULT_RULES = {
    "recognition": (
        "只链接当前原文中真实出现、且已有可用可视化目标的数学对象。"
        "优先识别函数名、定理名、极限/导数/积分等可图像化概念；"
        "人物介绍、边值问题等同名异义不应链接。返回原文片段，不要编造文字。"
    ),
    "image": (
        "修改图像时只改用户要求的函数、参数或范围，保留未要求改变的分析模式。"
        "解释改动并区分数值观察与证明。"
    ),
    "qa": (
        "围绕用户选中的原文回答，解释定义、条件和证明步骤；"
        "不编造未提供的公式或页码，不把有限采样说成证明。"
    ),
}


def _active_rule(session: Session, user_id: str, task: str) -> ReaderRule | None:
    return session.scalars(
        select(ReaderRule)
        .where(
            ReaderRule.user_id == user_id,
            ReaderRule.task == task,
            ReaderRule.active.is_(True),
        )
        .order_by(ReaderRule.version.desc())
    ).first()


def _rule_version(session: Session, user_id: str, task: str) -> int:
    latest = session.scalars(
        select(ReaderRule)
        .where(ReaderRule.user_id == user_id, ReaderRule.task == task)
        .order_by(ReaderRule.version.desc())
    ).first()
    return latest.version if latest else 0


def settings(session: Session, user: User) -> dict[str, Any]:
    rules = {}
    for task in TASKS:
        rule = _active_rule(session, user.id, task)
        rules[task] = {
            "content": rule.content if rule else DEFAULT_RULES[task],
            "version": rule.version if rule else 0,
            "custom": rule is not None,
        }
    examples = session.scalars(
        select(ReaderExample)
        .where(ReaderExample.user_id == user.id)
        .order_by(ReaderExample.created_at.desc())
        .limit(50)
    ).all()
    return {
        "rules": rules,
        "examples": [
            {
                "id": item.id,
                "task": item.task,
                "block_text": item.block_text,
                "exact_text": item.exact_text,
                "target": item.target,
                "visualization_id": item.visualization_id,
                "reason": item.reason,
                "source": item.source,
                "created_at": item.created_at.isoformat(),
            }
            for item in examples
        ],
    }


def save_rule(session: Session, user: User, task: str, content: str) -> dict[str, Any]:
    if task not in TASKS:
        raise ValueError("未知的阅读规则任务")
    for old in session.scalars(
        select(ReaderRule).where(
            ReaderRule.user_id == user.id,
            ReaderRule.task == task,
            ReaderRule.active.is_(True),
        )
    ):
        old.active = False
    rule = ReaderRule(
        user_id=user.id,
        task=task,
        content=content,
        version=_rule_version(session, user.id, task) + 1,
        active=True,
    )
    session.add(rule)
    session.flush()
    return {"task": task, "content": rule.content, "version": rule.version}


def reset_rule(session: Session, user: User, task: str) -> dict[str, Any]:
    if task not in TASKS:
        raise ValueError("未知的阅读规则任务")
    for old in session.scalars(
        select(ReaderRule).where(
            ReaderRule.user_id == user.id,
            ReaderRule.task == task,
            ReaderRule.active.is_(True),
        )
    ):
        old.active = False
    return {
        "task": task,
        "content": DEFAULT_RULES[task],
        "version": 0,
        "custom": False,
    }


def add_example(session: Session, user: User, data: dict[str, Any]) -> dict[str, Any]:
    example = ReaderExample(
        user_id=user.id,
        task=data.get("task", "recognition"),
        block_text=data.get("block_text", ""),
        exact_text=data["exact_text"],
        target=data.get("target", ""),
        visualization_id=data.get("visualization_id", ""),
        reason=data.get("reason", ""),
        source=data.get("source", "correction"),
    )
    session.add(example)
    session.flush()
    return {
        "id": example.id,
        "task": example.task,
        "block_text": example.block_text,
        "exact_text": example.exact_text,
        "target": example.target,
        "visualization_id": example.visualization_id,
        "reason": example.reason,
        "source": example.source,
    }


def delete_example(session: Session, user: User, example_id: str) -> None:
    example = session.scalars(
        select(ReaderExample).where(
            ReaderExample.id == example_id,
            ReaderExample.user_id == user.id,
        )
    ).first()
    if example:
        session.delete(example)


def rule_text(session: Session, user: User, task: str) -> str:
    rule = _active_rule(session, user.id, task)
    return rule.content if rule else DEFAULT_RULES.get(task, "")


def recognition_inputs(session: Session, user: User) -> tuple[str, int, list[dict[str, Any]]]:
    rule = _active_rule(session, user.id, "recognition")
    examples = session.scalars(
        select(ReaderExample)
        .where(
            ReaderExample.user_id == user.id,
            ReaderExample.task == "recognition",
        )
        .order_by(ReaderExample.created_at.desc())
        .limit(8)
    ).all()
    return (
        rule.content if rule else DEFAULT_RULES["recognition"],
        rule.version if rule else 0,
        [
            {
                "block_text": item.block_text[:1000],
                "exact_text": item.exact_text,
                "target": item.target,
                "visualization_id": item.visualization_id,
                "reason": item.reason,
            }
            for item in examples
        ],
    )
