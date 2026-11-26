"""Test-only HTTPS transport loaded in the isolated portable server subprocess."""
import json

import httpx


DUMMY_KEY = "qa-only-axiom-disposable-test-key"


def install(root):
    rules = json.loads((root / "model-rules.json").read_text(encoding="utf-8"))

    def respond(request):
        assert request.url == httpx.URL("https://api.deepseek.com/chat/completions")
        assert request.method == "POST"
        assert request.headers["Authorization"] == "Bearer " + DUMMY_KEY
        payload = json.loads(request.content)
        messages = payload["messages"]
        with (root / "model-requests.jsonl").open("a", encoding="utf-8") as log:
            log.write(json.dumps({"model": payload["model"], "messages": messages}) + "\n")
        prompt = "\n".join(message["content"] for message in messages)
        for rule in rules:
            if "question" in rule and json.loads(messages[-1]["content"]).get("question") != rule["question"]:
                continue
            if all(mark in prompt for mark in rule.get("contains", [])):
                return httpx.Response(200, json={
                    "choices": [{"message": {"role": "assistant", "content": json.dumps(rule["reply"])}}],
                    "usage": {"prompt_tokens": 5, "completion_tokens": 7},
                })
        return httpx.Response(422, json={"error": "No fixture matched the model prompt"})

    transport = httpx.MockTransport(respond)

    def post(url, **kwargs):
        with httpx.Client(transport=transport, trust_env=kwargs.pop("trust_env", False)) as client:
            return client.post(url, **kwargs)

    httpx.post = post
