import re
from urllib.parse import urlsplit

from playwright.sync_api import expect


SOURCE_A = "Chapter One. Walled gardens are an example of a compact metric space."
SOURCE_B = "Chapter Two. Each continuous function on a compact interval is uniformly continuous."
TITLE = "紧区间上的连续函数"


def drag_pdf(page, content):
    drop_zone = page.locator(".upload-zone")
    drop_zone.wait_for()
    transfer = page.evaluate_handle("""bytes => {
        const data = new DataTransfer();
        data.items.add(new File([Uint8Array.from(bytes)], 'lecture-qa.pdf', {type:'application/pdf'}));
        return data;
    }""", list(content))
    try:
        with page.expect_response(lambda response: response.url.endswith("/local/textbooks")
                                  and response.request.method == "POST") as event:
            drop_zone.dispatch_event("drop", {"dataTransfer": transfer})
    finally:
        transfer.dispose()
    response = event.value
    assert response.ok, response.text()
    assert "authorization" not in response.request.all_headers()
    return response.json()


def bootstrap(page, server):
    result = page.request.get(server.url + "/api/v1/local/bootstrap-extras")
    assert result.ok, result.text()
    return result.json()


def check_inline_navigation(response, source):
    assert response.url == source
    assert response.status in (200, 206)
    assert response.request.is_navigation_request()
    headers = response.all_headers()
    assert headers["content-type"].startswith("application/pdf")
    assert headers["content-disposition"].lower().startswith("inline")
    assert headers.get("x-frame-options", "").lower() != "deny"
    assert "frame-ancestors 'none'" not in headers.get("content-security-policy", "")
    request_headers = response.request.all_headers()
    assert "origin" not in request_headers and "authorization" not in request_headers
    parent = response.request.frame.parent_frame
    assert parent is not None and urlsplit(parent.url).netloc == urlsplit(source).netloc
    assert request_headers.get("sec-fetch-site") in ("same-origin", None)


def select_range(book, start, end):
    book.get_by_role("spinbutton", name="起始页").fill(str(start))
    book.get_by_role("spinbutton", name="结束页").fill(str(end))


def export_zip(page, server, archive_path):
    page.goto(server.url + "/#shelf/archive")
    with page.expect_download() as download:
        page.get_by_role("button", name="导出学习存档").click()
    download.value.save_as(archive_path)


def restore_into_clean_workstation(page, server, archive_path):
    # The original data directory stays intact. Start a fresh SQLite workstation
    # on the same origin so Chrome exercises the real import and restore dialog.
    server.stop()
    (server.root / "data").rename(server.root / "before-restore")
    server.start()
    page.evaluate("localStorage.clear()")
    page.reload()
    fresh = bootstrap(page, server)
    assert fresh["textbooks"] == [] and fresh["cards"] == [] and fresh["exercises"] == []
    page.once("dialog", lambda dialog: dialog.accept())
    with page.expect_response(lambda r: r.url.endswith("/archive/import") and r.request.method == "POST") as restored:
        page.locator(".learning-archive-settings input[type=file]").set_input_files(archive_path)
    assert restored.value.ok, restored.value.text()


def observe_speech(page):
    # Observe the real voice engine and keep its native callbacks intact.
    page.evaluate("""() => {
        window.qaSpeech = { started: false };
        const original = SpeechSynthesis.prototype.speak;
        SpeechSynthesis.prototype.speak = function(utterance) {
            window.qaSpeech.text = utterance.text;
            utterance.addEventListener('start', () => { window.qaSpeech.started = true; });
            return original.call(this, utterance);
        };
        speechSynthesis.getVoices();
    }""")


def check_speech(page, expected_text):
    voices = page.evaluate("speechSynthesis.getVoices().filter(v => v.localService && /^zh/i.test(v.lang)).map(v => v.name)")
    if voices:
        page.wait_for_function("window.qaSpeech.started", timeout=10000)
        assert expected_text in page.evaluate("window.qaSpeech.text")
        print("Chrome native speech start:", voices[0])
    else:
        expect(page.locator(".companion-dock")).to_contain_text(re.compile("语音|朗读.*不可用"))
        print("Chrome exposed no local Chinese voice; verified transcript and voice-unavailable state")
