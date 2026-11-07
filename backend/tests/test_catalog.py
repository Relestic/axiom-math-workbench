from __future__ import annotations


def test_catalog_structure(client, student_headers):
    response = client.get("/api/v1/catalog", headers=student_headers)
    assert response.status_code == 200
    data = response.get_json()
    assert data["textbook"]["slug"] == "analysis-4e-sample"
    assert data["textbook"]["page_count"] == 326
    assert data["stats"]["chapters"] == 12
    assert data["stats"]["concepts"] == 8
    assert len(data["chapters"]) == 12
    assert len(data["concepts"]) == 8
    assert data["progress"]["week"] == 7
    assert data["sample_content"] is True
    tools = {tool["slug"]: tool for tool in data["tools"]}
    assert tools["eps-delta"]["unlocked"] is True
    assert tools["ftc"]["unlocked"] is False


def test_concept_list_filters_and_pagination(client, student_headers):
    all_concepts = client.get("/api/v1/concepts?limit=3", headers=student_headers)
    assert all_concepts.status_code == 200
    data = all_concepts.get_json()
    assert data["total"] == 8
    assert len(data["items"]) == 3
    assert data["next_offset"] == 3
    filtered = client.get(
        "/api/v1/concepts?query=一致连续", headers=student_headers
    ).get_json()
    assert filtered["total"] >= 1
    assert filtered["items"][0]["id"] == "uniform"
    chapter = client.get("/api/v1/concepts?chapter=ch-4", headers=student_headers).get_json()
    assert {item["id"] for item in chapter["items"]} == {"continuous", "uniform"}


def test_concept_detail_has_every_required_section(client, student_headers):
    response = client.get("/api/v1/concepts/uniform", headers=student_headers)
    assert response.status_code == 200
    data = response.get_json()
    assert data["definition"]
    assert data["formula"]
    assert any("δ" in item["symbol"] for item in data["quantifiers"])
    assert any(item["symbol"] == "ω(f,E)" for item in data["symbols"])
    assert len(data["conditions"]) == 4
    assert len(data["proofs"]) == 1
    assert data["proofs"][0]["steps"]
    assert any(item["slug"] == "reciprocal-1x" for item in data["classics"])
    assert any(item["truth"] == "false" for item in data["propositions"])
    assert len(data["exercises"]) == 4
    assert data["graph"]["node_id"] == "uniform"
    assert data["navigation"]["previous"]["id"] == "continuous"


def test_proof_classic_proposition_and_section(client, student_headers):
    proof = client.get("/api/v1/proofs/proof-heine-cantor", headers=student_headers)
    assert proof.status_code == 200
    assert len(proof.get_json()["steps"]) == 6
    assert proof.get_json()["tool_details"]
    classic = client.get("/api/v1/classics/abs-kink", headers=student_headers)
    assert classic.status_code == 200
    payload = classic.get_json()
    assert payload["kind"] == "counterexample"
    assert payload["proposition"]["truth"] == "false"
    assert len(payload["properties"]) >= 4
    proposition = client.get(
        "/api/v1/propositions/prop-uniform-converse", headers=student_headers
    )
    assert proposition.status_code == 200
    assert proposition.get_json()["missing_conditions"]
    section = client.get("/api/v1/sections/sec-4-2", headers=student_headers)
    assert section.status_code == 200
    assert "一致连续" in section.get_json()["text"]
    assert section.get_json()["chapter"]["number"] == 4


def test_search_across_content_types(client, student_headers):
    response = client.get("/api/v1/search?q=一致连续", headers=student_headers)
    assert response.status_code == 200
    types = {item["type"] for item in response.get_json()["items"]}
    assert "concept" in types
    assert "exercise" in types
    missing = client.get("/api/v1/search?q=", headers=student_headers)
    assert missing.status_code == 422
    unknown_type = client.get(
        "/api/v1/search?q=连续&types=concept,bogus", headers=student_headers
    )
    assert unknown_type.status_code == 422


def test_tools_respect_current_week(client, student_headers):
    response = client.get("/api/v1/tools", headers=student_headers)
    assert response.status_code == 200
    items = {item["slug"]: item for item in response.get_json()["items"]}
    assert items["continuity-definition"]["unlocked"] is True
    assert items["taylor-theorem"]["unlocked"] is False
    assert items["mvt"]["unlock_week"] == 10


def test_draft_content_hidden_from_students(client, student_headers, admin_headers):
    created = client.post(
        "/api/v1/admin/concepts",
        headers=admin_headers,
        json={
            "id": "draft-only",
            "chapter_id": "ch-4",
            "name": "草稿知识点",
            "definition": "草稿定义",
        },
    )
    assert created.status_code == 201
    assert client.get("/api/v1/concepts/draft-only", headers=student_headers).status_code == 404
    admin_view = client.get("/api/v1/concepts/draft-only", headers=admin_headers)
    assert admin_view.status_code == 200
    published_list = client.get("/api/v1/concepts", headers=student_headers).get_json()
    assert "draft-only" not in {item["id"] for item in published_list["items"]}


def test_draft_chapter_and_section_hidden(client, admin_headers, student_headers):
    chapter = client.post(
        "/api/v1/admin/textbooks/tb-analysis/chapters",
        headers=admin_headers,
        json={"number": 99, "title": "草稿章节", "summary": "未发布"},
    )
    assert chapter.status_code == 201
    chapter_id = chapter.get_json()["id"]
    assert (
        client.get(f"/api/v1/chapters/{chapter_id}", headers=student_headers).status_code
        == 404
    )
    assert (
        client.get(f"/api/v1/chapters/{chapter_id}", headers=admin_headers).status_code
        == 200
    )
    section = client.post(
        f"/api/v1/admin/chapters/{chapter_id}/sections",
        headers=admin_headers,
        json={"title": "草稿小节", "text": "尚未发布"},
    )
    assert section.status_code == 201
    section_id = section.get_json()["id"]
    assert (
        client.get(f"/api/v1/sections/{section_id}", headers=student_headers).status_code
        == 404
    )
    assert (
        client.get(f"/api/v1/sections/{section_id}", headers=admin_headers).status_code
        == 200
    )


def test_unknown_resource_returns_not_found(client, student_headers):
    assert client.get("/api/v1/concepts/nope", headers=student_headers).status_code == 404
    assert client.get("/api/v1/proofs/nope", headers=student_headers).status_code == 404
    assert client.get("/api/v1/classics/nope", headers=student_headers).status_code == 404
