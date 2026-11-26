from playwright.sync_api import expect

from workstation import check_speech, observe_speech


def test_hiyori_reads_local_lecture_without_key(page, server):
    assert not page.request.get(server.url + "/api/v1/ai/key/status").json()["configured"]
    model_requests = []
    def record_model_request(request):
        if request.url.endswith("/ai/companion"):
            model_requests.append(request.url)

    page.on("request", record_model_request)
    page.goto(server.url + "/#desk/textbook")
    page.locator(".companion-stage[data-ready]").wait_for()
    page.get_by_role("button", name="开启伴学朗读").click()
    observe_speech(page)
    page.get_by_role("button", name="解释当前定义", exact=True).click()
    reply = page.get_by_role("log", name="伴学对话记录").locator("article.assistant")
    expect(reply).to_contain_text("Hiyori · 本地讲义")
    check_speech(page, "连续")
    assert not model_requests
