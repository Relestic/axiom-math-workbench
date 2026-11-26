import json

from flask import Blueprint

from ..adapters.llm import chat, use_local_ai
from ..adapters.math import MathError
from ..db import get_session
from ..errors import ApiError, parse_json
from ..modules.counterexamples import Candidate, check_candidate, finding
from .local_only import local_learner

bp = Blueprint("local_counterexamples", __name__)


@bp.post("/counterexamples/check")
def check():
    candidate = parse_json(Candidate)
    try:
        result = check_candidate(candidate)
    except MathError as error:
        raise ApiError("unprocessable", str(error)) from None
    if candidate.include_model:
        try:
            use_local_ai()
            session = get_session()
            reply, _ = chat(session, [
                {"role": "system", "content": "作为数学助教，用中文解释提供的本地检验结论。保留每条结论的依据边界，"
                 "不从有限采样断言全区间性质。只回复简短解释，不修改输入的结果。"},
                {"role": "user", "content": json.dumps(result, ensure_ascii=False)},
            ], purpose="counterexample_explanation", user_id=local_learner(session).id, json_mode=False, max_tokens=600)
            result["findings"].append(finding("model-explanation", reply.text))
            session.commit()
        except ApiError as error:
            result["model_status"] = error.message
    return result
