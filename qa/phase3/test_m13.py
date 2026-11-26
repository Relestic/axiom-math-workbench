"""Exercise the offline knowledge atlas through the PDF shelf, SVG and reader."""
from contextlib import closing
import json
import re
import sqlite3

from playwright.sync_api import expect

from fake_deepseek import DUMMY_KEY
from workstation import check_inline_navigation, drag_pdf, select_range


BOOK_A = "实分析讲义"
BOOK_B = "级数与逼近"
BOUNDARY = "连续函数在闭区间上的局部控制与全局一致连续性的边界条件"
PAGES_A = [
    "Intervals and neighborhoods provide the local setting for real analysis.",
    "For a function limit, a small change in the input bounds the output error near a point.",
    "Uniform continuity on a compact interval admits one positive radius for all points.",
    "On a compact interval, continuous functions attain their extrema and are bounded.",
    "One-sided limits describe how a function approaches each endpoint of its interval.",
    "The algebra of limits includes sums and products when individual finite limits exist.",
]
PAGES_B = [
    "A partial sum is the sum of the first n elements of an infinite numerical series.",
    "Absolute convergence means that the series of the absolute terms converges.",
    "The remainder measures the difference between a convergent sum and its partial sums.",
    "Uniform convergence gives one approximation bound on the entire domain.",
]


def card(page_number, title, definition, formula, *prerequisites):
    return {"title": title, "definition": definition, "formula": formula,
            "page_start": page_number, "page_end": page_number, "prerequisites": list(prerequisites)}


A = [
    card(1, "区间与邻域", "邻域给出实直线上的局部范围。", r"U_r(a)=(a-r,a+r)"),
    card(2, "函数极限", "考察函数在指定点附近的变化。", r"\lim_{x\to a} f(x)=L", "区间与邻域"),
    card(3, BOUNDARY, "闭区间上的连续函数可对所有点选取同一个正半径。", r"|f(x)-f(y)|<\varepsilon", "函数极限"),
    card(4, "闭区间上的有界性", "闭区间上的连续函数有上界和下界。", r"|f(x)|\le M", BOUNDARY),
    card(5, "端点与单侧极限", "可从区间内部单侧趋近端点。", r"\lim_{x\to a^+}f(x)"),
    card(6, "极限的四则运算", "有限极限可在条件满足时相加或相乘。", r"\lim(f+g)=\lim f+\lim g", "函数极限"),
]
B = [
    card(1, "部分和", "级数的部分和是前若干项的和。", r"S_n=\sum_{k=1}^{n}a_k"),
    card(2, "绝对收敛", "各项绝对值构成的级数收敛。", r"\sum |a_k|<\infty", "部分和"),
    card(3, "余项估计", "余项衡量部分和与极限的差。", r"R_n=S-S_n", "部分和"),
    card(4, "整个定义域上的一致逼近与误差估计", "近似误差界对定义域中的每一点同时有效。", "E_n<1/n"),
]


def import_book(page, pdf, title, count):
    uploaded = drag_pdf(page, pdf)
    entry = page.get_by_role("article", name=uploaded["title"], exact=True)
    entry.get_by_role("button", name="重命名").click()
    entry.get_by_role("textbox", name="教材名称").fill(title)
    entry.get_by_role("button", name="保存名称").click()
    entry = page.get_by_role("article", name=title, exact=True)
    select_range(entry, 1, count)
    with page.expect_response(re.compile(r"/extract-cards$")) as event:
        entry.get_by_role("button", name="生成学习卡片").click()
    assert event.value.ok, event.value.text()
    cards = event.value.json()["cards"]
    assert len(cards) == count
    expect(entry).to_have_attribute("aria-busy", "false")
    return uploaded["id"], [c["id"] for c in cards]


def node(page, node_id):
    return page.locator(f'[data-node-id="{node_id}"]')


def label(page, name):
    return page.get_by_role("button", name=name, exact=True)


def edges(page):
    return page.locator("[data-edge-type]").evaluate_all(
        """els => els.map(el => ({from:el.dataset.from, to:el.dataset.to, type:el.dataset.edgeType,
            dash:getComputedStyle(el).strokeDasharray, marker:getComputedStyle(el).markerEnd,
            d:el.getAttribute('d')}))""")


def check_card_geometry(page):
    rects = page.locator("[data-node-id] .graph-card-frame").evaluate_all("""els => els.map(el => {
        const {left,top,right,bottom} = el.getBoundingClientRect();
        return {left,top,right,bottom,id:el.closest('[data-node-id]').dataset.nodeId};
    })""")
    assert len(rects) >= len(A) + len(B) + 5
    for i, a in enumerate(rects):
        assert a["left"] < a["right"] and a["top"] < a["bottom"]
        for b in rects[i + 1:]:
            assert a["right"] <= b["left"] or b["right"] <= a["left"] or a["bottom"] <= b["top"] or b["bottom"] <= a["top"], (a, b)


def check_edge_clearance(page, endpoints):
    # Chrome measures each rendered path in the same unscaled SVG coordinates as the frames.
    world = page.locator("[data-graph-world]")
    for source, target in endpoints:
        path = world.locator(f'path[data-from="{source}"][data-to="{target}"]')
        expect(path).to_have_count(1)
        crossing = path.evaluate("""path => {
          const unrelated = [...path.parentElement.querySelectorAll('.graph-card-frame')].map(rect => ({
            id:rect.closest('[data-node-id]').dataset.nodeId, box:rect.getBBox(),
          })).filter(({id}) => id !== path.dataset.from && id !== path.dataset.to);
          const length = path.getTotalLength();
          for (let distance = 0; distance < length; distance += 1) {
            const {x,y} = path.getPointAtLength(distance);
            for (const {id,box} of unrelated) {
              if (box.x < x && x < box.x + box.width && box.y < y && y < box.y + box.height) return id;
            }
          }
          return null;
        }""")
        assert crossing is None, f"The {source} → {target} link enters the {crossing} card"


def blank_point(viewport):
    # Pick exposed paper even when zoomed in or the canvas is partly scrolled.
    return viewport.evaluate("""svg => {
      const r = svg.getBoundingClientRect();
      const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight);
      for (let y = top + 12; y < bottom - 24; y += 22)
        for (let x = r.left + 18; x < r.right - 75; x += 22) {
          const target = document.elementFromPoint(x, y);
          if (target && svg.contains(target) && !target.closest('[data-node-id]')) return [x, y];
        }
      throw Error("No visible atlas background for pointer test");
    }""")


def check_camera(page):
    viewport = page.locator("svg[data-graph-viewport]")
    # The third world coordinate measures the wheel scale; the first two track pan.
    def camera():
        return viewport.evaluate("el => [Number(el.dataset.panX), Number(el.dataset.panY), Number(el.dataset.zoom)]")
    def wheel_to(delta, limit):
        page.mouse.move(*blank_point(viewport))
        for _ in range(35):
            if abs(camera()[2] - limit) < 0.001:
                return
            page.mouse.wheel(0, delta)
            page.evaluate("() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
        assert abs(camera()[2] - limit) < 0.001, camera()
    label(page, "适屏居中").click()
    fit = camera()
    x, y = blank_point(viewport)
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + 55, y + 35, steps=6)
    page.mouse.up()
    panned = camera()
    assert abs(panned[0] - fit[0]) > 20 and abs(panned[1] - fit[1]) > 14
    wheel_to(-680, 2)
    wheel_to(680, 0.4)
    label(page, "适屏居中").click()
    assert all(abs(a - b) < 0.5 for a, b in zip(camera(), fit))
    bounds = viewport.bounding_box()
    lane = viewport.locator(".graph-lane-frame").bounding_box()
    assert abs(lane["x"] + lane["width"] / 2 - bounds["x"] - bounds["width"] / 2) < 2
    assert abs(lane["y"] + lane["height"] / 2 - bounds["y"] - bounds["height"] / 2) < 2
    cards = page.locator("[data-node-id] .graph-card-frame").evaluate_all("""els => els.map(el => {
      const r=el.getBoundingClientRect(); return [r.left,r.top,r.right,r.bottom]})""")
    assert all(x >= bounds["x"] - 1 and y >= bounds["y"] - 1 and
               r <= bounds["x"] + bounds["width"] + 1 and b <= bounds["y"] + bounds["height"] + 1
               for x, y, r, b in cards)


def check_neighbors(page, selected, graph_edges):
    related = {selected}
    for edge in graph_edges:
        ends = {edge["from"], edge["to"]}
        if edge["type"] == "prerequisite" and selected in ends:
            related.update(ends)
    opacities = page.locator("[data-node-id]").evaluate_all(
        "els => Object.fromEntries(els.map(el => [el.dataset.nodeId, Number(el.getAttribute('opacity'))]))")
    assert len(related) > 1 and set(opacities) - related
    for ident, opacity in opacities.items():
        assert abs(opacity - (1 if ident in related else 0.35)) < 0.01, (ident, opacity, related)


def check_paper(page, dark):
    paper = page.locator(".constellation")
    background = paper.evaluate(r"""el => {
        const style = getComputedStyle(el);
        return {pattern:style.backgroundImage, rgb:style.backgroundColor.match(/[\d.]+/g).map(Number)};
    }""")
    assert "radial-gradient" in background["pattern"]
    assert (max(background["rgb"][:3]) < 100 if dark else min(background["rgb"][:3]) > 175), background


def test_offline_multibook_atlas_and_reader(page, server, make_pdf, capture):
    page.set_viewport_size({"width": 1840, "height": 1010})
    server.use_mock_deepseek([
        {"contains": [PAGES_A[1], PAGES_A[-1]], "reply": {"cards": A}},
        {"contains": [PAGES_B[1], PAGES_B[-1]], "reply": {"cards": B}},
    ])
    key = page.request.put(server.url + "/api/v1/ai/key", data={"api_key": DUMMY_KEY, "model": "deepseek-chat"})
    assert key.ok and key.json()["configured"]
    page.goto(server.url + "/#shelf/books")
    first_book, a = import_book(page, make_pdf(PAGES_A), BOOK_A, len(A))
    second_book, b = import_book(page, make_pdf(PAGES_B), BOOK_B, len(B))
    assert page.request.delete(server.url + "/api/v1/ai/key").ok

    # A historical/imported cycle can exist even though extraction prevents new forward references.
    server.stop()
    with closing(sqlite3.connect(server.root / "data" / "axiom.db")) as db:
        with db:
            updated = db.execute("UPDATE concepts SET prerequisites=? WHERE id=?",
                                 (json.dumps([a[0], a[3]]), a[1]))
            assert updated.rowcount == 1
    server.start()
    assert not page.request.get(server.url + "/api/v1/ai/key/status").json()["configured"]
    page.goto(server.url + "/#atlas/knowledge-map")
    page.reload()
    viewport = page.locator("svg[data-graph-viewport]")
    expect(viewport).to_be_visible()
    expect(page.locator("[data-lane-id]")).to_have_count(3)
    lane_by_id = dict(page.locator("[data-lane-id]").evaluate_all(
        "els => els.map(el => [el.dataset.laneId, el.querySelector('.graph-lane-title').textContent])"))
    assert BOOK_A in lane_by_id[first_book] and BOOK_B in lane_by_id[second_book] and "builtin" in lane_by_id
    panel = page.locator(".node-detail")
    for name in ("全部关系", "蕴含与反例", "显示反例", "仅看 MVP"):
        expect(page.get_by_text(name, exact=True)).to_have_count(0)
    expect(page.locator(".map-proof-path, .map-dark-note")).to_have_count(0)
    for noise in ("reciprocal", "abs", "series", "improper", "multi"):
        expect(node(page, noise)).to_have_count(0)
    all_ids = set(page.locator("[data-node-id]").evaluate_all("els => els.map(el=>el.dataset.nodeId)"))
    assert set(a + b) <= all_ids and len(all_ids) > len(a + b)
    check_card_geometry(page)
    graph_edges = edges(page)
    assert all(e["from"] in all_ids and e["to"] in all_ids for e in graph_edges)
    cycle = {(a[1], a[2]), (a[2], a[3]), (a[3], a[1])}
    reduced = [e for e in graph_edges if (e["from"], e["to"]) in cycle]
    assert len(reduced) == 3 and sorted(e["type"] for e in reduced) == ["prerequisite", "prerequisite", "sequence"]
    [back_edge] = [(e["from"], e["to"]) for e in reduced if e["type"] == "sequence"]
    check_edge_clearance(page, [("real", "compact"), ("derivative", "taylor"), ("integral", "ftc"), back_edge])
    assert any(e["from"] == a[3] and e["to"] == a[4] and e["type"] == "sequence" for e in graph_edges)
    for edge in reduced:
        assert "C" in edge["d"].upper() and edge["marker"] != "none"
        assert (edge["dash"] != "none") == (edge["type"] == "sequence")
    long_title = node(page, a[2]).locator(".graph-card-title")
    assert long_title.evaluate("el => el.scrollWidth > el.clientWidth && getComputedStyle(el).textOverflow === 'ellipsis'")
    expect(node(page, a[2]).locator("title")).to_contain_text(BOUNDARY)

    review = label(page, "仅标出待复习")
    review.click()
    expect(review).to_have_attribute("aria-pressed", "true")
    expect(page.locator('[data-node-id][data-review="true"]').first).to_have_attribute("opacity", "1")
    expect(node(page, a[0])).to_have_attribute("opacity", "0.35")
    review.click()
    expect(node(page, a[0])).to_have_attribute("opacity", "1")
    label(page, BOOK_B).click()
    expect(label(page, BOOK_B)).to_have_attribute("aria-pressed", "true")
    expect(page.locator("[data-lane-id]")).to_have_count(1)
    assert set(page.locator("[data-node-id]").evaluate_all("els => els.map(el=>el.dataset.nodeId)")) == set(b)
    check_camera(page)
    label(page, BOOK_A).click()
    expect(page.locator("[data-node-id]")).to_have_count(len(a))
    search = page.get_by_role("textbox", name="搜索节点")
    search.fill("边界条件")
    expect(node(page, a[2])).to_have_attribute("data-match", "true")
    expect(panel.get_by_role("heading", name=BOUNDARY)).to_be_visible()
    expect(panel.locator(".katex").first).to_be_visible()
    expect(panel).to_contain_text("P.3")
    expect(panel).to_contain_text("未练习")
    page.wait_for_function("""id => {
        const v = document.querySelector('[data-graph-viewport]').getBoundingClientRect();
        const n = document.querySelector('[data-node-id="'+id+'"] .graph-card-frame').getBoundingClientRect();
        return Math.abs(n.x+n.width/2-v.x-v.width/2)<8 && Math.abs(n.y+n.height/2-v.y-v.height/2)<8;
    }""", arg=a[2], timeout=6000)

    search.fill("")
    node(page, a[3]).press("Enter")
    page.mouse.move(*blank_point(viewport))
    check_neighbors(page, a[3], edges(page))
    # A sequence edge must remain outside the one-hop prerequisite highlight.
    expect(node(page, a[4])).to_have_attribute("opacity", "0.35")
    node(page, a[2]).hover()
    check_neighbors(page, a[2], edges(page))
    page.mouse.move(*blank_point(viewport))
    check_neighbors(page, a[3], edges(page))
    node(page, a[2]).press("Enter")
    label(page, "适屏居中").click()
    page.mouse.move(5, 5)
    check_paper(page, dark=False)
    expect(page.locator(".toast")).to_be_hidden(timeout=8000)
    capture(page, "m13-light.png")
    label(page, "切换深色主题").click()
    expect(page.locator("html")).to_have_attribute("data-theme", "dark")
    check_paper(page, dark=True)
    capture(page, "m13-dark.png")
    label(page, "切换浅色主题").click()

    # Detail relation buttons work for the rendered solid predecessors and successors.
    for group, source_side, target_side in (("前置来源", "to", "from"), ("后续推导", "from", "to")):
        relations = [e for e in edges(page) if e["type"] == "prerequisite" and e[source_side] == a[2]]
        related = a.index(relations[0][target_side])
        panel.locator("section").filter(has=page.get_by_role("heading", name=re.compile(group))).get_by_role(
            "button", name=A[related]["title"], exact=True).click()
        expect(panel.get_by_role("heading", name=A[related]["title"], exact=True)).to_be_visible()
        node(page, a[2]).press("Enter")

    label(page, "内置课程").click()
    expect(page.locator("[data-node-id]")).to_have_count(len(all_ids) - len(a + b))
    node(page, "mvt").press("Enter")
    label(page, "去学习书桌研读").click()
    expect(page).to_have_url(re.compile("#desk/textbook$"))
    selector = page.locator("#desk-study .desk-tools select")
    expect(selector).to_have_value("mean-value")
    atlas = page.get_by_role("navigation", name="主导航").get_by_role("button", name="知识星图")
    atlas.click()
    label(page, BOOK_B).click()
    label(page, "定位当前学习").click()
    expect(node(page, "mvt")).to_have_attribute("aria-pressed", "true")
    label(page, BOOK_A).click()
    node(page, a[2]).press("Enter")
    file_url = f"{server.url}/api/v1/local/textbooks/{first_book}/file"
    with page.expect_response(file_url) as opened:
        label(page, "去学习书桌研读").click()
    check_inline_navigation(opened.value, file_url)
    expect(page).to_have_url(re.compile("#desk/textbook$"))
    expect(selector).to_have_value(a[2])
    expect(page.locator("#desk-pane-textbook")).to_contain_text(A[2]["definition"])
    expect(page.get_by_role("tab", name="课本原文")).to_have_attribute("aria-selected", "true")
    pdf = page.locator("iframe[title='课本原文 PDF']")
    expect(pdf).to_be_visible()
    assert pdf.evaluate("el => el.src") == file_url + "#page=3"
    assert len(server.model_requests()) == 2


def test_phone_atlas_controls_details_and_builtin_lecture(page, server, make_pdf):
    server.use_mock_deepseek([{"contains": PAGES_B[:2], "reply": {"cards": B[:2]}}])
    key = page.request.put(server.url + "/api/v1/ai/key", data={"api_key": DUMMY_KEY, "model": "deepseek-chat"})
    assert key.ok
    page.goto(server.url + "/#shelf/books")
    _, ids = import_book(page, make_pdf(PAGES_B[:2]), BOOK_B, 2)
    assert page.request.delete(server.url + "/api/v1/ai/key").ok
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(server.url + "/#atlas/knowledge-map")
    page.reload()
    label(page, BOOK_B).click()
    expect(page.locator("[data-node-id]")).to_have_count(2)
    page.get_by_role("textbox", name="搜索节点").fill("绝对收敛")
    expect(node(page, ids[1])).to_have_attribute("aria-pressed", "true")
    panel = page.locator(".node-detail")
    expect(panel.get_by_role("heading", name="绝对收敛")).to_be_visible()
    for item in [page.locator("[data-graph-viewport]"), panel]:
        item.scroll_into_view_if_needed()
        box = item.bounding_box()
        assert box["width"] > 180 and -1 <= box["x"] <= box["x"] + box["width"] <= 391, box
    label(page, "适屏居中").click()
    label(page, "定位当前学习").click()
    expect(node(page, "uniform")).to_have_attribute("aria-pressed", "true")
    expect(label(page, "内置课程")).to_have_attribute("aria-pressed", "true")
    label(page, "去学习书桌研读").click()
    expect(page).to_have_url(re.compile("#desk/textbook$"))
    expect(page.locator("#desk-study .desk-tools select")).to_have_value("uniform")
    expect(page.locator("#desk-pane-textbook")).to_be_visible()
