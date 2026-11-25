import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  parseFormula,
  numericalSlope,
  taylorModel,
  sampleCurve,
  midpointSum,
} from "../.test-build/src/lib/functionEngine.js";
import {
  validateScene,
  initialScene,
  curveEvaluator,
  parseAIResult,
} from "../.test-build/src/lib/plotScene.js";
import {
  requestPlotChange,
  createAIMiddleware,
} from "../.test-build/server/ai.js";
const close = (a, b, t = 1e-6) =>
  assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);
test("任意组合公式、参数与三目分段表达式", () => {
  const f = parseFormula("sin(a*x^2)+exp(-b*x^2)");
  assert.deepEqual(f.symbols, ["a", "b"]);
  close(f.evaluate(2, { a: 0.5, b: 1 }), Math.sin(2) + Math.exp(-4));
  const g = parseFormula("x < 0 ? -x : x^2");
  close(g.evaluate(-2), 2);
  close(g.evaluate(2), 4);
  close(g.evaluate(0), 0);
});
test("不执行赋值、访问器、数组、对象、代码或未支持的调用", () => {
  for (const formula of [
    "x=2",
    "f(x)=x^2",
    "[1,2]",
    "a.b",
    "a[1]",
    'import("fs")',
    'evaluate("x")',
    "constructor",
    "random()",
    "factorial(99999999)",
  ])
    assert.throws(() => parseFormula(formula), formula);
  assert.throws(() => parseFormula("sin(".repeat(100) + "x" + ")".repeat(100)));
});
test("定义域与显示窗口分开，log/sqrt的非实数取值不画出来", () => {
  const curve = {
    ...initialScene.curves[0],
    expression: "sqrt(x)",
    domainMin: 0,
    leftOpen: true,
  };
  const fn = curveEvaluator(curve, {});
  assert.ok(Number.isNaN(fn(0)));
  assert.ok(Number.isNaN(fn(-1)));
  close(fn(4), 2);
  assert.ok(Number.isNaN(parseFormula("log(x)").evaluate(-1)));
});
test("尖点不绘制误导性切线，复合函数可计算差商", () => {
  assert.equal(
    numericalSlope((x) => Math.abs(x), 0),
    null,
  );
  assert.equal(
    numericalSlope((x) => 1 / x, 0),
    null,
  );
  close(
    numericalSlope((x) => Math.sin(x * x), 1),
    2 * Math.cos(1),
  );
});
test("一般函数Taylor系数及分段边界拒绝处理", () => {
  const t = taylorModel(parseFormula("sin(x)"), 0, {}, 3);
  assert.ok(t);
  close(t.coefficients[1], 1);
  close(t.coefficients[3], -1 / 6);
  close(t.evaluate(0.1), 0.1 - 0.001 / 6);
  assert.equal(taylorModel(parseFormula("x<0 ? -x : x^2"), 0, {}, 3), null);
});
test("断点和不稳定跳跃断开连线；奇点积分不给出有限和", () => {
  const samples = sampleCurve((x) => 1 / (x - 0.123), -2, 2, 10);
  assert.ok(samples.x.includes(null));
  const jump = sampleCurve((x) => (x < 0.123 ? 0 : 1), -1, 1, 2);
  assert.ok(jump.x.includes(null));
  assert.equal(
    midpointSum((x) => 1 / x, -1, 1, 20),
    null,
  );
  close(
    midpointSum((x) => x * x, 0, 1, 100),
    0.333325,
  );
});
test("场景校验添加参数，拒绝重复编号和无效范围", () => {
  const s = structuredClone(initialScene);
  s.curves[0].expression = "a*sin(b*x)";
  const v = validateScene(s);
  assert.deepEqual(
    v.parameters.map((p) => p.name),
    ["a", "b"],
  );
  assert.throws(() => validateScene({ ...s, xMin: 3, xMax: -3 }));
  assert.throws(() =>
    validateScene({ ...s, curves: [s.curves[0], s.curves[0]] }),
  );
  assert.throws(() =>
    parseAIResult({ message: "x", scene: { ...s, execute: "arbitrary code" } }),
  );
});
async function serve(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
test("兼容接口端到端：发送上下文、解析AI场景并校验，不将错误响应或密钥暴露给前端", async () => {
  let received;
  let mode = "ok";
  const upstream = await serve(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    received = JSON.parse(raw);
    if (mode === "error") {
      res.writeHead(401);
      res.end("sensitive provider error");
      return;
    }
    const s = structuredClone(initialScene);
    s.curves[0].expression = mode === "invalid" ? 'import("fs")' : "sin(a*x)";
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                message: "已修改为参数正弦函数",
                scene: s,
              }),
            },
          },
        ],
      }),
    );
  });
  const config = {
    baseUrl: upstream.url + "/v1",
    model: "test-model",
    apiKey: "test-only-key",
    jsonMode: true,
  };
  const middleware = createAIMiddleware(config);
  const app = await serve((req, res) =>
    middleware(req, res, () => {
      res.statusCode = 404;
      res.end();
    }),
  );
  try {
    const result = await requestPlotChange(config, {
      message: "换成正弦函数",
      scene: initialScene,
      history: [{ role: "user", content: "保留切线" }],
    });
    assert.equal(result.scene.curves[0].expression, "sin(a*x)");
    assert.equal(received.response_format.type, "json_object");
    assert.equal(received.messages[1].content, "保留切线");
    assert.ok(received.messages.at(-1).content.includes("currentScene"));
    const posted = await fetch(app.url + "/api/ai/plot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "换成带参数的正弦函数",
        scene: initialScene,
      }),
    });
    assert.equal(posted.status, 200);
    assert.equal((await posted.json()).scene.curves[0].expression, "sin(a*x)");
    assert.equal(
      JSON.parse(received.messages.at(-1).content).request,
      "换成带参数的正弦函数",
    );
    const status = await (await fetch(app.url + "/api/ai/status")).text();
    assert.ok(!status.includes("test-only-key"));
    assert.ok(status.includes("test-model"));
    const forbidden = await fetch(app.url + "/api/ai/plot", {
      method: "POST",
      headers: {
        Origin: "https://untrusted.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(forbidden.status, 403);
    mode = "invalid";
    await assert.rejects(
      () => requestPlotChange(config, { message: "画图", scene: initialScene }),
      /未通过校验/,
    );
    mode = "error";
    await assert.rejects(
      () => requestPlotChange(config, { message: "画图", scene: initialScene }),
      /鉴权失败/,
    );
  } finally {
    upstream.server.closeAllConnections();
    app.server.closeAllConnections();
    upstream.server.close();
    app.server.close();
  }
});
test("无模型配置时明确返回未连接，不生成伪AI回答", async () => {
  const handler = createAIMiddleware({
    baseUrl: "https://example.com/v1",
    model: "",
    apiKey: "",
    jsonMode: true,
  });
  const app = await serve((req, res) => handler(req, res, () => {}));
  try {
    const r = await fetch(app.url + "/api/ai/plot", { method: "POST" });
    assert.equal(r.status, 503);
    assert.match((await r.json()).error, /AI 尚未配置/);
  } finally {
    app.server.closeAllConnections();
    app.server.close();
  }
});
