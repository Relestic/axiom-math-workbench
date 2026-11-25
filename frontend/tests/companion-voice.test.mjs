import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const compiled = await build({
  entryPoints: ["src/modules/companion/voice.ts"],
  bundle: true,
  format: "esm",
  write: false,
  plugins: [{
    name: "mock-worklet",
    setup(build) {
      build.onResolve({ filter: /^wlipsync$/ }, args => ({ path: args.path, namespace: "mock" }));
      build.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
        contents: "export const createWLipSyncNode = (...args) => globalThis.createWorklet(...args);",
      }));
    },
  }],
});
const { createMouthDriver } = await import("data:text/javascript;base64," +
  Buffer.from(compiled.outputFiles[0].text).toString("base64"));

const closed = { open: 0, form: 0 };
const voices = [{ localService: false, lang: "zh-CN" }, { localService: true, lang: "zh-CN" }];

test("unavailable CosyVoice falls back to a local Mandarin voice and resets on end or stop", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("connection refused"); });
  globalThis.AudioContext = class {
    audioWorklet = {};
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  };
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  let utterance;
  let canceled = false;
  globalThis.speechSynthesis = {
    getVoices: () => voices,
    speak(next) { utterance = next; },
    cancel() { canceled = true; },
  };
  const driver = createMouthDriver();
  const done = driver.play("任意大于零的伊普西隆");
  await new Promise(setImmediate);
  assert.equal(fetchMock.mock.calls[0].arguments[0], "http://127.0.0.1:50000/openapi.json");
  assert.equal(utterance.voice, voices[1]);
  assert.deepEqual(driver.sample(), closed);
  utterance.onstart();
  utterance.onboundary({ charIndex: 2 });
  assert.ok(driver.sample().open > 0);
  utterance.onend();
  await done;
  assert.deepEqual(driver.sample(), closed);

  const canceledPlay = driver.play("停止朗读");
  await new Promise(setImmediate);
  driver.stop();
  await canceledPlay;
  assert.ok(canceled);
  assert.deepEqual(driver.sample(), closed);
  delete globalThis.AudioContext;
  delete globalThis.speechSynthesis;
  delete globalThis.SpeechSynthesisUtterance;
});

test("stopping during detection aborts the probe without starting native speech", async t => {
  let probeSignal;
  let contextClosed = false;
  globalThis.AudioContext = class {
    audioWorklet = {};
    resume() { return Promise.resolve(); }
    close() { contextClosed = true; return Promise.resolve(); }
  };
  t.mock.method(globalThis, "fetch", (_url, { signal }) => {
    probeSignal = signal;
    return new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  });
  const driver = createMouthDriver();
  const playback = driver.play("停止检测");
  driver.stop();
  await playback;
  assert.ok(probeSignal.aborted);
  assert.ok(contextClosed);
  assert.deepEqual(driver.sample(), closed);
  delete globalThis.AudioContext;
});

test("streamed 16-bit samples survive odd chunk boundaries and drive playback with the supplied profile", async t => {
  const samples = [];
  const sources = [];
  let audioClosed = false;
  globalThis.AudioContext = class {
    state = "running";
    currentTime = 0;
    destination = {};
    audioWorklet = {};
    resume() { return Promise.resolve(); }
    close() { audioClosed = true; return Promise.resolve(); }
    createBuffer(_channels, length, rate) {
      assert.equal(rate, 24000);
      const data = new Float32Array(length);
      return { getChannelData: () => data, copyToChannel: values => data.set(values), duration: length / rate };
    }
    createBufferSource() {
      const source = {
        connect() {},
        disconnect() {},
        start() { samples.push(...source.buffer.getChannelData(0)); },
        stop() {},
      };
      sources.push(source);
      return source;
    }
  };
  globalThis.createWorklet = async (_context, profile) => {
    assert.equal(profile.mfccs[0].name, "A");
    return { volume: 0.8, weights: { A: 1, E: 0, I: 0, O: 0, U: 0, S: 0 }, connect() {}, port: { close() {} }, disconnect() {} };
  };
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (url.endsWith("/openapi.json")) {
      return Response.json({ paths: { "/inference_zero_shot": { post: {} } } });
    }
    if (url.endsWith("/profile.json")) {
      return Response.json({ mfccs: [{ name: "A" }] });
    }
    if (url.endsWith(".wav")) return new Response(new Uint8Array([1, 2, 3]));
    assert.equal(url, "http://127.0.0.1:50000/inference_zero_shot");
    assert.equal(init.body.get("tts_text"), "读这段");
    assert.equal(init.body.get("prompt_text"), "希望你以后能够做的比我还好呦。");
    assert.equal(init.body.get("prompt_wav").size, 3);
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array([0, 128, 0]));
      controller.enqueue(new Uint8Array([0, 255, 127]));
      controller.close();
    } }));
  });
  const driver = createMouthDriver();
  const done = driver.play("读这段");
  await new Promise(setImmediate);
  assert.deepEqual(samples, [-1, 0, 32767 / 32768]);
  assert.ok(driver.sample().open > 0);
  sources.forEach(source => source.onended());
  await done;
  assert.ok(audioClosed);
  assert.deepEqual(driver.sample(), closed);
  delete globalThis.AudioContext;
  delete globalThis.createWorklet;
});
