def _proof_answer() -> str:
    return (
        "任给 ε>0，取 δ=ε/4。若 |x−y|<δ，则 |x²−y²|≤4|x−y|<ε，"
        "因此函数在 [0,1] 上一致连续。在 ℝ 上取 xₙ=n，yₙ=n+1/n，"
        "函数值差大于 2，所以不一致连续。"
    )


def test_proof_submission_gets_structural_rubric(client, student_headers):
    response = client.post(
        "/api/v1/attempts",
        headers=student_headers,
        json={"exercise_id": "uniform-3", "answer_text": _proof_answer()},
    )
    assert response.status_code == 201
    data = response.get_json()
    assert data["status"] == "needs_review"
    assert isinstance(data["score"], int)
    assert 0 <= data["score"] <= 100
    feedback = data["feedback"]
    assert feedback["grading_scope"] == "structural"
    assert feedback["criteria"]
    assert feedback["checker"] == "rubric+keywords"
    assert feedback["needs_review"] is True
    assert any(item["met"] for item in feedback["criteria"])


def test_wrong_final_expression_gets_zero_and_reference(client, student_headers):
    response = client.post(
        "/api/v1/attempts",
        headers=student_headers,
        json={"exercise_id": "primitive-2", "answer_text": "答案是 exp(2*x)"},
    )
    assert response.status_code == 201
    data = response.get_json()
    assert data["score"] == 0
    assert data["feedback"]["correct"] is False
    assert data["feedback"]["reference_answer"] == "x*exp(2*x)"
    assert "wrong_answer" in data["feedback"]["error_types"]


def test_final_answer_is_extracted_from_prose(client, student_headers):
    response = client.post(
        "/api/v1/attempts",
        headers=student_headers,
        json={
            "exercise_id": "primitive-2",
            "answer_text": "先做分部积分，最后得到 F(x)=exp(2*x)*(2*x-1)/4 + C。",
        },
    )
    assert response.status_code == 201
    data = response.get_json()
    assert data["status"] == "auto_checked"
    assert data["score"] == 100
    assert data["feedback"]["correct"] is True
