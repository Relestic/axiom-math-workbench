import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Application } from "pixi.js";
import { Live2DModel, type Cubism4InternalModel, MotionPriority } from "pixi-live2d-display/cubism4";

function Spike() {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = target.current!;
    const app = new Application({ width: 420, height: 520, antialias: true, backgroundColor: 0xf2effa });
    host.appendChild(app.view);
    let alive = true;
    Live2DModel.from("/companion/Hiyori/Hiyori.model3.json", {
      autoUpdate: false, autoInteract: false,
    }).then(model => {
      if (!alive) { model.destroy(); return; }
      model.anchor.set(0.5);
      model.scale.set(Math.min(410 / model.width, 505 / model.height));
      model.position.set(210,260);
      app.stage.addChild(model);
      app.ticker.maxFPS = 30;
      app.ticker.add(() => model.update(app.ticker.deltaMS));
      model.internalModel.on("beforeModelUpdate", () => {
        const core = (model.internalModel as Cubism4InternalModel).coreModel;
        host.dataset.breath = String(core.getParameterValueById("ParamBreath"));
        host.dataset.eye = String(core.getParameterValueById("ParamEyeLOpen"));
      });
      app.view.onclick = async () => { host.dataset.tap = String(await model.motion("TapBody", 0, MotionPriority.FORCE)); };
      host.dataset.ready = "true";
    }).catch(e => { host.textContent = String(e); });
    return () => { alive = false; app.destroy(true, {children:true}); };
  }, []);
  return <div ref={target} id="spike" />;
}
createRoot(document.getElementById("root")!).render(<Spike />);
