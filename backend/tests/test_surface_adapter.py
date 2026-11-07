from __future__ import annotations

from app.schemas.surface import SurfaceScene


def _scene(expression: str = "x^2 + y^2") -> dict:
    return {
        "expression": expression,
        "xMin": -1.6,
        "xMax": 1.6,
        "yMin": -1.6,
        "yMax": 1.6,
        "resolution": 20,
        "view": {"azimuth": 45, "elevation": 28, "heightScale": 1, "zoom": 1},
        "display": {
            "opacity": 0.88,
            "wireframe": True,
            "showAxes": True,
            "palette": "violet",
        },
    }


def test_surface_scene_accepts_two_variable_expression():
    scene = SurfaceScene.model_validate(_scene("sin(x)*cos(y)"))
    assert scene.expression == "sin(x)*cos(y)"


def test_surface_scene_rejects_unknown_symbols():
    try:
        SurfaceScene.model_validate(_scene("a*x + y"))
    except Exception as exc:
        assert "未声明" in str(exc) or "不支持" in str(exc)
    else:
        raise AssertionError("unknown symbol should fail")


def test_mock_surface_endpoint_changes_scene(client, student_headers):
    response = client.post(
        "/api/v1/ai/surface",
        headers=student_headers,
        json={
            "message": "把曲面换成 sin(x)*cos(y)",
            "scene": _scene(),
            "history": [],
        },
    )
    assert response.status_code == 200, response.get_json()
    data = response.get_json()
    assert data["provider"] == "mock"
    assert "sin" in data["scene"]["expression"]
    assert data["scene"]["view"]["azimuth"] == 45
