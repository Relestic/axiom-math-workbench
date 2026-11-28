"""Personal Codex settings and actionable diagnostics in Chrome."""

import os

from playwright.sync_api import expect
import conftest


def test_codex_settings_switch_save_test_and_clear(page, server):
    unset = {"configured": False, "model": "deepseek-flash", "state": "unset", "codex_detected": False}
    status = dict(unset)
    saves = []
    login = "本机 Codex 尚未登录或登录已过期，请先运行 codex login"
    page.route("**/ai/key/status", lambda route: route.fulfill(json=status))

    def settings(route):
        if route.request.method == "PUT":
            payload = route.request.post_data_json
            saves.append(payload)
            status.update(configured=True, state="ready", **payload)
        else:
            assert route.request.method == "DELETE"
            status.clear()
            status.update(unset)
        route.fulfill(json=status)

    page.route("**/v1/ai/key", settings)
    page.route("**/ai/key/test", lambda route: route.fulfill(status=401, json={
        "error": {"code": "invalid_key", "message": login}}))
    page.goto(server.url)
    page.locator(".ai-status-badge").click()
    dialog = page.get_by_role("dialog")
    provider = dialog.get_by_label("提供商")
    model = dialog.get_by_label("模型", exact=True)
    test = dialog.get_by_role("button", name="测试连接")
    save = dialog.get_by_role("button", name="保存", exact=True)
    provider.select_option("openai")
    dialog.get_by_label("OpenAI API Key").fill("previous-draft")
    provider.select_option("codex")
    expect(dialog.locator("input[type=password], input[type=url]")).to_have_count(0)
    expect(dialog).to_contain_text("当前未在本机检测到 Codex CLI，请先安装并登录 Codex。")
    expect(model).to_have_value("auto")
    expect(model.locator("option:checked")).to_have_text("auto（跟随本机 Codex 默认模型）")
    expect(test).to_be_disabled()
    save.click()
    expect(test).to_be_enabled()
    assert saves == [{"provider": "codex", "model": "auto"}]
    model.select_option(":custom")
    dialog.get_by_label("自定义模型名称").fill("o3")
    expect(test).to_be_disabled()
    status["codex_detected"] = True
    save.click()
    expect(test).to_be_enabled()
    assert saves[-1] == {"provider": "codex", "model": "o3"}
    expect(dialog.get_by_text("当前未在本机检测到", exact=False)).to_have_count(0)
    test.click()
    expect(dialog.get_by_role("alert")).to_have_text(login)
    page.unroute("**/ai/key/test")
    page.route("**/ai/key/test", lambda route: route.fulfill(json={"ok": True}))
    test.click()
    expect(dialog).to_contain_text("连接测试成功")
    page.reload()
    page.locator(".ai-status-badge").click()
    expect(provider).to_have_value("codex")
    expect(dialog.get_by_label("自定义模型名称")).to_have_value("o3")
    confirmations = []

    def confirm(prompt):
        confirmations.append(prompt.message)
        prompt.accept()

    page.once("dialog", confirm)
    dialog.get_by_role("button", name="清除配置").click()
    expect(dialog).to_contain_text("已清除")
    assert confirmations == ["清除本机 Codex 配置？"]
    expect(provider).to_have_value("deepseek")
    expect(save).to_be_disabled()


def test_real_connection_probe_after_installing_cli(page, server, monkeypatch):
    binary = server.root / ("test codex.cmd" if os.name == "nt" else "test codex")
    original_env = conftest.workstation_env
    monkeypatch.setattr(conftest, "workstation_env", lambda port: {
        **original_env(port), "AXIOM_CODEX_BIN": str(binary)})
    server.restart()
    page.goto(server.url)
    page.locator(".ai-status-badge").click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label("提供商").select_option("codex")
    dialog.get_by_role("button", name="保存", exact=True).click()
    probe = dialog.get_by_role("button", name="测试连接")
    probe.click()
    expect(dialog.get_by_role("alert")).to_have_text("未检测到本机 Codex CLI，请先安装并登录 Codex")
    if os.name == "nt":
        binary.write_text("@echo off\necho unauthorized 1>&2\nexit /b 1\n", encoding="ascii")
    else:
        binary.write_text("#!/bin/sh\necho unauthorized >&2\nexit 1\n", encoding="ascii")
        binary.chmod(0o700)
    probe.click()
    expect(dialog.get_by_role("alert")).to_have_text("本机 Codex 尚未登录或登录已过期，请先运行 codex login")
    expect(dialog.get_by_text("当前未在本机检测到", exact=False)).to_have_count(0)
