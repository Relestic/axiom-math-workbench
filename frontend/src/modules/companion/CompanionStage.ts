import { Application } from "pixi.js";
import { Live2DModel, MotionPriority, type Cubism4InternalModel } from "pixi-live2d-display/cubism4";

export type MouthPose = { open: number; form: number };
export interface MouthDriver {
  play(text: string): Promise<void>;
  sample(): MouthPose;
  stop(): void;
}
export type SpeechSource = { text: string; driver: MouthDriver };
const MODEL = "/companion/Hiyori/Hiyori.model3.json";
let applications = 0;

export class CompanionStage {
  private app?: Application;
  private model?: Live2DModel<Cubism4InternalModel>;
  private host?: HTMLElement;
  private observer?: ResizeObserver;
  private driver?: MouthDriver;
  private fps = 30;
  private resetMouth = false;

  async mount(host: HTMLElement): Promise<void> {
    if (this.app) return;
    this.host = host;
    const app = new Application({
      width: host.clientWidth || 260, height: host.clientHeight || 320, antialias: true,
      backgroundAlpha: 0, autoDensity: true, resolution: Math.min(devicePixelRatio, 2),
      sharedTicker: false,
    });
    this.app = app;
    host.dataset.application = String(++applications);
    console.debug("[Hiyori] Pixi Application", applications);
    app.view.setAttribute("aria-label", "与 Hiyori 打招呼");
    app.view.setAttribute("role", "button");
    app.view.tabIndex = 0;
    host.appendChild(app.view);
    this.setFps(this.fps);
    try {
      const model = await Live2DModel.from(MODEL, { autoUpdate: false, autoInteract: false }) as Live2DModel<Cubism4InternalModel>;
      if (this.app !== app) { model.destroy({ children: true, texture: true, baseTexture: true }); return; }
      this.model = model;
      model.anchor.set(0.5, 0);
      app.stage.addChild(model);
      this.fit();
      this.observer = new ResizeObserver(() => this.fit());
      this.observer.observe(host);
      model.internalModel.on("beforeModelUpdate", this.updateMouth);
      app.ticker.add(() => model.update(app.ticker.deltaMS));
      const tap = () => { void this.playMotion("TapBody"); };
      app.view.onclick = tap;
      app.view.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tap(); } };
      host.dataset.ready = "true";
    } catch (cause) {
      if (this.app === app) this.unmount();
      throw cause;
    }
  }

  private fit() {
    const { host, app, model } = this;
    if (!app || !model || !host?.clientWidth || !host.clientHeight) return;
    const w = host.clientWidth, h = host.clientHeight;
    app.renderer.resize(w, h);
    // Frame the face and upper body inside the narrow companion column.
    const scale = Math.min(w * 1.65 / model.internalModel.originalWidth, h * 1.9 / model.internalModel.originalHeight);
    model.scale.set(scale);
    model.position.set(w / 2, -0.025 * h);
  }

  setFps(n: number) {
    this.fps = Math.max(1, Math.min(60, n));
    if (this.app) {
      this.app.ticker.maxFPS = this.fps;
      if (this.host) this.host.dataset.fps = String(this.app.ticker.maxFPS);
    }
  }

  async playMotion(group: "Idle" | "TapBody") {
    if (!this.model) return false;
    const played = await this.model.motion(group, undefined, MotionPriority.FORCE);
    if (played && this.host) this.host.dataset.motion = group;
    return played;
  }

  private updateMouth = () => {
    if (!this.model || (!this.driver && !this.resetMouth)) return;
    const {open, form} = this.driver?.sample() ?? {open: 0, form: 0};
    const core = this.model.internalModel.coreModel;
    core.setParameterValueById("ParamMouthOpenY", Math.min(1, Math.max(0, open)));
    core.setParameterValueById("ParamMouthForm", Math.min(1, Math.max(-1, form)));
    this.resetMouth = false;
  };

  async speak({text, driver}: SpeechSource) {
    this.stopSpeaking();
    this.driver = driver;
    void this.playMotion("TapBody");
    try { await driver.play(text); }
    finally { if (this.driver === driver) this.stopSpeaking(); }
  }

  stopSpeaking() {
    this.driver?.stop();
    this.driver = undefined;
    this.resetMouth = true;
  }

  unmount() {
    this.stopSpeaking();
    this.observer?.disconnect();
    this.model?.internalModel.off("beforeModelUpdate", this.updateMouth);
    this.app?.destroy(true, { children: true, texture: true, baseTexture: true });
    if (this.host) delete this.host.dataset.ready;
    this.app = undefined;
    this.model = undefined;
    this.host = undefined;
  }
}
