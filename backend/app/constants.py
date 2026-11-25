"""Shared learning-skill taxonomy.

The six exercise skills come from the product requirements. The visualization
uses the five classic dimensions from the design reference, so "计算与论证" is
folded into "综合迁移" only for the heatmap display bucket.
"""

from __future__ import annotations

EXERCISE_SKILLS = [
    "定义理解",
    "条件辨析",
    "独立证明",
    "反例构造",
    "计算与论证",
    "综合迁移",
]

HEATMAP_SKILLS = ["定义理解", "条件辨析", "独立证明", "反例构造", "综合迁移"]

SKILL_ALIASES = {"计算与论证": "综合迁移"}


def skill_bucket(skill: str) -> str:
    return SKILL_ALIASES.get(skill, skill)
