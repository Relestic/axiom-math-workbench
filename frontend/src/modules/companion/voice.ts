import type { Profile, WLipSyncAudioNode } from "wlipsync";
import type { MouthDriver, MouthPose } from "./CompanionStage";

const LOCAL_VOICE = "http://127.0.0.1:50000";
const ENDPOINT = "/inference_zero_shot";
const ASSETS = "/companion/voice";
const PROMPT = "希望你以后能够做的比我还好呦。";
const PCM_RATE = 24_000;
const CLOSED: MouthPose = { open: 0, form: 0 };

class EnvelopeDriver implements MouthDriver {
  private startTime?: number;
  private boundaryTime = -Infinity;
  private finish?: () => void;

  async play(text: string) {
    const synthesis = globalThis.speechSynthesis;
    if (!synthesis || typeof SpeechSynthesisUtterance === "undefined") {
      throw new Error("当前浏览器不支持本地朗读。");
    }
    await new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      let submitted = false;
      let voiceTimer: ReturnType<typeof setTimeout> | undefined;
      let startTimer: ReturnType<typeof setTimeout> | undefined;
      const finish = (error?: Error) => {
        clearTimeout(voiceTimer);
        clearTimeout(startTimer);
        synthesis.removeEventListener?.("voiceschanged", submit);
        utterance.onstart = utterance.onboundary = utterance.onend = utterance.onerror = null;
        this.startTime = undefined;
        this.boundaryTime = -Infinity;
        this.finish = undefined;
        if (error) reject(error);
        else resolve();
      };
      this.finish = () => {
        finish();
        if (submitted) synthesis.cancel();
      };
      const submit = () => {
        if (submitted) return;
        const voices = synthesis.getVoices().filter(item => item.localService && /^zh(?:-|_|$)/i.test(item.lang));
        const voice = voices.find(item => /^zh[-_]CN$/i.test(item.lang)) ?? voices[0];
        if (!voice) return;
        clearTimeout(voiceTimer);
        synthesis.removeEventListener?.("voiceschanged", submit);
        utterance.lang = voice.lang;
        utterance.voice = voice;
        submitted = true;
        startTimer = setTimeout(() => {
          finish(new Error("本地中文语音启动超时。"));
          synthesis.cancel();
        }, 5_000);
        try {
          synthesis.speak(utterance);
        } catch {
          finish(new Error("本地中文语音无法朗读。"));
        }
      };
      utterance.onstart = () => {
        clearTimeout(startTimer);
        this.startTime = performance.now();
      };
      utterance.onboundary = () => { this.boundaryTime = performance.now(); };
      utterance.onend = () => finish();
      utterance.onerror = () => finish(new Error("本地中文语音无法朗读。"));
      voiceTimer = setTimeout(() => finish(new Error("当前设备没有可用的离线中文语音。")), 900);
      synthesis.addEventListener?.("voiceschanged", submit);
      submit();
    });
  }

  sample(): MouthPose {
    if (this.startTime === undefined) return CLOSED;
    const now = performance.now();
    const elapsed = (now - this.startTime) / 1_000;
    const pulse = Math.abs(Math.sin(elapsed * 17 + 0.9 + 0.6 * Math.sin(elapsed * 7)));
    const boundary = 0.15 * Math.exp(-(now - this.boundaryTime) / 100);
    return { open: 0.08 + 0.56 * pulse + boundary, form: 0.16 * Math.sin(elapsed * 12) };
  }

  stop() { this.finish?.(); }
}

class PcmDecoder {
  private lowByte?: number;

  decode(chunk: Uint8Array): Float32Array<ArrayBuffer> {
    const lowByte = this.lowByte;
    const length = Math.floor((chunk.length + Number(lowByte !== undefined)) / 2);
    const samples = new Float32Array(length);
    if (chunk.length === 0) return samples;
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    let offset = 0;
    let sample = 0;
    if (lowByte !== undefined) {
      const highByte = chunk[0] < 128 ? chunk[0] : chunk[0] - 256;
      samples[sample++] = (highByte * 256 + lowByte) / 32768;
      offset++;
    }
    for (; sample < length; sample++, offset += 2) {
      samples[sample] = view.getInt16(offset, true) / 32768;
    }
    this.lowByte = chunk[offset];
    return samples;
  }
}

function withAbort<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

class AnalyserDriver implements MouthDriver {
  private run?: AbortController;
  private node?: WLipSyncAudioNode;
  private context?: AudioContext;
  private sources = new Map<AudioBufferSourceNode, Promise<void>>();
  hasScheduledAudio = false;

  async play(text: string) {
    const run = new AbortController();
    this.run = run;
    const signal = run.signal;
    try {
      if (typeof AudioContext === "undefined") throw new Error("Web Audio unavailable");
      // Resume during the original user action so autoplay restrictions do not
      // depend on how long probing the loopback service takes.
      const context = new AudioContext();
      this.context = context;
      if (!context.audioWorklet) throw new Error("AudioWorklet unavailable");
      const resumed = context.resume();
      void resumed.catch(() => undefined);
      const probeSignal = AbortSignal.any([signal, AbortSignal.timeout(1_000)]);
      const probe = await fetch(LOCAL_VOICE + "/openapi.json", { signal: probeSignal, redirect: "error" });
      if (!probe.ok) throw new Error("Local speech service unavailable");
      const api = await probe.json();
      if (!api?.paths?.[ENDPOINT]?.post) throw new Error("Local speech service has no zero-shot endpoint");

      const prepare = AbortSignal.any([signal, AbortSignal.timeout(5_000)]);
      const [profileResponse, wavResponse, { createWLipSyncNode }] = await Promise.all([
        fetch(ASSETS + "/profile.json", { signal: prepare }),
        fetch(ASSETS + "/zero_shot_prompt.wav", { signal: prepare }),
        import("wlipsync"),
        withAbort(resumed, prepare),
      ]);
      if (!profileResponse.ok || !wavResponse.ok) throw new Error("Missing local speech assets");
      const [profile, wav]: [Profile, Blob] = await Promise.all([profileResponse.json(), wavResponse.blob()]);
      const node = await withAbort(createWLipSyncNode(context, profile), prepare);
      this.node = node;
      // This branch is silent. It keeps the worklet processing while the
      // separate source-to-destination branch plays the actual audio.
      node.connect(context.destination);
      node.onprocessorerror = () => run.abort(new Error("本地口型分析失败。"));

      const form = new FormData();
      form.set("tts_text", text);
      form.set("prompt_text", PROMPT);
      form.set("prompt_wav", wav, "zero_shot_prompt.wav");
      const streamSignal = AbortSignal.any([signal, AbortSignal.timeout(120_000)]);
      const audio = await fetch(LOCAL_VOICE + ENDPOINT, {
        method: "POST", body: form, signal: streamSignal, redirect: "error",
      });
      if (!audio.ok || !audio.body) throw new Error("Local speech synthesis unavailable");
      const reader = audio.body.getReader();
      const decoder = new PcmDecoder();
      let nextTime = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          streamSignal.throwIfAborted();
          const samples = decoder.decode(value);
          if (!samples.length) continue;
          const buffer = context.createBuffer(1, samples.length, PCM_RATE);
          buffer.copyToChannel(samples, 0);
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.connect(context.destination);
          source.connect(node);
          const ended = new Promise<void>(resolve => {
            source.onended = () => {
              source.disconnect();
              this.sources.delete(source);
              resolve();
            };
          });
          this.sources.set(source, ended);
          const startTime = Math.max(nextTime, context.currentTime + 0.015);
          source.start(startTime);
          this.hasScheduledAudio = true;
          nextTime = startTime + buffer.duration;
          // Bound the amount of queued audio while retaining enough lead time
          // to play continuously when the server writes faster than real time.
          const firstQueued = this.sources.values().next().value;
          if (firstQueued && this.sources.size > 1 && nextTime - context.currentTime > 1) {
            await withAbort(firstQueued, streamSignal);
          }
        }
      } finally {
        void reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      if (!this.hasScheduledAudio) throw new Error("Local speech service returned empty audio");
      await withAbort(Promise.all(this.sources.values()), streamSignal);
    } finally {
      this.stop();
    }
  }

  sample(): MouthPose {
    const node = this.node;
    if (!node || this.sources.size === 0 || !node.volume) return CLOSED;
    const { A, E, I, O, U, S } = node.weights;
    const vowels = A + E + I + O + U;
    if (vowels < 0.02) return CLOSED;
    return {
      open: Math.min(1, node.volume * (0.35 * I + 0.5 * U + 0.65 * E + 0.85 * O + A) / (vowels + S)),
      form: Math.min(0.8, Math.max(-0.4, (I + 0.6 * E - 0.5 * U - 0.3 * O) / vowels)),
    };
  }

  stop() {
    this.run?.abort();
    this.run = undefined;
    for (const source of this.sources.keys()) {
      source.onended = null;
      try { source.stop(); } catch { /* the buffer may not have been started */ }
      source.disconnect();
    }
    this.sources.clear();
    if (this.node) {
      this.node.onprocessorerror = null;
      this.node.port.close();
      this.node.disconnect();
      this.node = undefined;
    }
    const context = this.context;
    this.context = undefined;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
  }
}

export function createMouthDriver(): MouthDriver {
  let active: MouthDriver | undefined;
  return {
    async play(text) {
      active?.stop();
      active = undefined;
      if (!text.trim()) return;
      const analyser = new AnalyserDriver();
      active = analyser;
      try {
        await analyser.play(text);
      } catch {
        if (active !== analyser) return;
        if (analyser.hasScheduledAudio) throw new Error("本地 CosyVoice 朗读中断。");
        const envelope = new EnvelopeDriver();
        active = envelope;
        try { await envelope.play(text); }
        finally { if (active === envelope) active = undefined; }
      } finally {
        if (active === analyser) active = undefined;
      }
    },
    sample: () => active?.sample() ?? CLOSED,
    stop() {
      const driver = active;
      active = undefined;
      driver?.stop();
    },
  };
}
