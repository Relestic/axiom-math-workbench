"""Prerequisite diagnostic questions used by the dashboard."""

from __future__ import annotations

DIAGNOSTIC_QUESTIONS = [
    {
        "id": "dq-uniform-delta",
        "text": "证明一致连续时，δ 可以依赖于什么？",
        "options": ["ε，但不能依赖具体位置", "ε 和任意基准点 x₀", "只能依赖 x₀"],
        "correct_index": 0,
        "reason": "定义要求同一个 δ 对定义域内所有点对有效。",
        "concept_id": "uniform",
        "skill": "条件辨析",
        "sort_order": 1,
    },
    {
        "id": "dq-heine-cantor",
        "text": "下列哪项足以保证实函数一致连续？",
        "options": [
            "定义在开区间上且连续",
            "定义在有界闭区间上且连续",
            "存在一个点的导数",
        ],
        "correct_index": 1,
        "reason": "这是 Heine–Cantor 定理的典型情形；条件充分但并非必要。",
        "concept_id": "uniform",
        "skill": "定义理解",
        "sort_order": 2,
    },
    {
        "id": "dq-darboux",
        "text": "有界函数在 [a,b] 上 Riemann 可积的一个等价判据是？",
        "options": [
            "画出的曲线足够平滑",
            "某次等距采样结果稳定",
            "对任意 ε>0，存在分割使上下和之差小于 ε",
        ],
        "correct_index": 2,
        "reason": "Darboux 判据约束上下和差距，有限采样不能证明可积。",
        "concept_id": "riemann",
        "skill": "条件辨析",
        "sort_order": 3,
    },
]
