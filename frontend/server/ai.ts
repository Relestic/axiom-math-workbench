import type { IncomingMessage, ServerResponse } from "node:http";
import { validateScene, parseAIResult } from "../src/lib/plotScene.js";
import { resolveDeepSeekModel } from "../src/modules/ai/models.js";
export type AIConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
  jsonMode: boolean;
};
const system = `你是 Axiom 数学图像工作区助手。根据当前 scene 和用户对话修改函数，而不是切换预设函数类型。只返回 JSON 对象 {"message":"中文说明","scene":完整配置或null}。纯解释或需澄清时 scene 为 null。修改时保留未要求改变的函数、参数、分析模式和范围。
scene 字段：curves(1到4项，每项 id、expression、label、visible、domainMin、domainMax、leftOpen、rightOpen)，activeId，parameters(每项 name、value、min、max)，mode(graph/continuity/derivative/integral/taylor)，xMin、xMax、yMin、yMax、x0、epsilon、delta、h、integralStart、integralEnd、subdivisions(4到200整数)、order(1到5整数)。所有字段都必须返回。定义域端点不限时用null。
表达式使用 mathjs 语法：x^2、sin(a*x)、exp(-x^2)、x<0 ? -x : x^2。仅实值一元显函数，自变量x；参数为a-d,f-w,z中的单个小写字母，最多8个。允许 + - * / ^ 比较 and or not 及 sin cos tan asin acos atan sinh cosh tanh exp log sqrt abs floor ceil round sign min max。不允许赋值、数组、对象、函数定义、任意代码、积分求和命令。乘法明确写*。log是自然对数。pi和e是常数。
用户要求改变类型时请构造具体函数；要求分段函数时用条件表达式并说明分界点。新增参数提供合理范围。一元隐函数、微分方程和三维曲面暂不支持，请明确解释而不要强行转成其他函数。设置与函数相称的显示范围，定义域与显示窗口分开；不要用裁剪显示窗口掩盖数学定义域。xMin<xMax，yMin<yMax，integralStart<integralEnd。数值均在[-10000,10000]内，epsilon/delta在[.001,100]，h在[.0001,100]。
解释使用的假设，不能把有限采样当作连续性、可导性或可积性的证明。不要声称执行了未提供的工具。message中简要说明具体修改，不使用Markdown代码块。`;
function endpoint(config: AIConfig) {
  const url = new URL(config.baseUrl);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    )
  )
    throw new Error("AI_BASE_URL 需要 HTTPS；本机模型可使用 localhost HTTP");
  return config.baseUrl.replace(/\/+$/, "") + "/chat/completions";
}

function isDeepSeek(config: AIConfig) {
  return URL.canParse(config.baseUrl) && new URL(config.baseUrl).hostname === "api.deepseek.com";
}
export async function requestPlotChange(
  config: AIConfig,
  body: any,
  signal?: AbortSignal,
) {
  const deepSeek = isDeepSeek(config);
  const model = deepSeek ? resolveDeepSeekModel(config.model) : config.model;
  if (!config.apiKey || !model)
    throw new Error(
      "请先在 .env 中设置 AI_BASE_URL、AI_MODEL 和 AI_API_KEY，并重新启动服务",
    );
  const scene = validateScene(body.scene);
  if (
    typeof body.message !== "string" ||
    !body.message.trim() ||
    body.message.length > 2000
  )
    throw new Error("请输入 1–2000 字的修改要求");
  const history = Array.isArray(body.history)
    ? body.history
        .slice(-8)
        .filter(
          (m: any) =>
            m &&
            ["user", "assistant"].includes(m.role) &&
            typeof m.content === "string",
        )
        .map((m: any) => ({ role: m.role, content: m.content.slice(0, 3000) }))
    : [];
  const response = await fetch(endpoint(config), {
    method: "POST",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
      : AbortSignal.timeout(60000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        ...history,
        {
          role: "user",
          content: JSON.stringify({
            currentScene: scene,
            request: body.message,
          }),
        },
      ],
      ...(config.jsonMode ? { response_format: { type: "json_object" } } : {}),
      ...(deepSeek ? { thinking: { type: "disabled" } } : {}),
      stream: false,
    }),
  });
  if (!response.ok)
    throw new Error(
      response.status === 401 || response.status === 403
        ? "模型服务鉴权失败，请检查服务端 API Key"
        : response.status === 429
          ? "模型服务限流或额度不足，请稍后重试"
          : `模型服务返回 HTTP ${response.status}，请检查模型名和接口兼容性`,
    );
  const raw = await response.text();
  if (raw.length > 200000) throw new Error("模型返回内容过大");
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("模型服务未返回有效 JSON，请检查接口地址和兼容性");
  }
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string")
    throw new Error("模型未返回可用内容，可能拒绝了请求");
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  try {
    return parseAIResult(JSON.parse(cleaned));
  } catch {
    throw new Error(
      "AI 返回的公式或配置未通过校验，当前图像保持不变。请换一种说法或缩小修改范围。",
    );
  }
}
export function createAIMiddleware(config: AIConfig) {
  let active = 0;
  const model = isDeepSeek(config) ? resolveDeepSeekModel(config.model) : config.model;
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    const path = req.url?.split("?")[0];
    if (path !== "/api/ai/status" && path !== "/api/ai/plot") {
      next();
      return;
    }
    const json = (status: number, data: unknown) => {
      if (res.destroyed) return;
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(data));
    };
    if (
      req.headers.origin &&
      req.headers.origin !== `http://${req.headers.host}` &&
      req.headers.origin !== `https://${req.headers.host}`
    ) {
      json(403, { error: "仅接受当前站点的请求" });
      return;
    }
    if (path === "/api/ai/status" && req.method === "GET") {
      json(200, {
        configured: !!(config.apiKey && model && config.baseUrl),
        model,
        provider: (() => {
          try {
            return new URL(config.baseUrl).hostname;
          } catch {
            return "地址配置有误";
          }
        })(),
      });
      return;
    }
    if (req.method !== "POST") {
      json(405, { error: "不支持的请求方法" });
      return;
    }
    if (!config.apiKey || !model) {
      json(503, {
        error:
          "AI 尚未配置。请填写项目 .env 并重启；当前仍可直接编辑任意支持的公式。",
      });
      return;
    }
    if (!req.headers["content-type"]?.startsWith("application/json")) {
      json(415, { error: "需要 JSON 请求" });
      return;
    }
    if (active >= 2) {
      json(429, { error: "正在处理其他修改，请稍后再试" });
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    const controller = new AbortController();
    res.on("close", () => controller.abort());
    active++;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 40000) {
          json(413, { error: "请求内容过大" });
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      const result = await requestPlotChange(
        config,
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
        controller.signal,
      );
      json(200, result);
    } catch (error) {
      json(502, {
        error:
          error instanceof Error &&
          ["TimeoutError", "AbortError"].includes(error.name)
            ? "请求超时或已取消，请重试"
            : error instanceof Error
              ? error.message
              : "修改失败，请重试",
      });
    } finally {
      active--;
    }
  };
}
