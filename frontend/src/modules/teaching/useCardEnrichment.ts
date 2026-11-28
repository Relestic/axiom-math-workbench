import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAppData } from "../../app/DataProvider";
import type { CurriculumUnit } from "../../domain/types";
import { useAIConnection } from "../ai/connection";
import { generateCardExercises, generateCardProof, generateCardVisual } from "./localTextbooks";

const preference = "axiom-auto-enrich";
const steps = [
  ["proof", "证明", generateCardProof],
  ["exercises", "练习", generateCardExercises],
  ["visual", "配图", generateCardVisual],
] as const;

// The desk mounts this hook with a key for the selected local card.
export function useCardEnrichment(unit: CurriculumUnit) {
  const { data, refreshLocal } = useAppData();
  const ai = useAIConnection();
  const failureKey = `axiom-enrich-failure-${unit.id}`;
  const [autoEnrich, setAuto] = useState(() => localStorage.getItem(preference) !== "false");
  useEffect(() => { localStorage.setItem(preference, String(autoEnrich)); }, [autoEnrich]);
  const [error, setError] = useState(() => sessionStorage.getItem(failureKey) ?? "");
  const [busy, setBusy] = useState<"automatic" | "manual" | null>(null);
  const [visible, setVisible] = useState(() => !document.hidden);
  const proof = !unit.proofSteps?.length;
  const exercises = !data.exercises.some(item => item.topicId === unit.id);
  const visual = !unit.visual;
  const complete = !proof && !exercises && !visual;
  const ready = ai.status?.state === "ready";
  const mounted = useRef(false);
  const running = useRef(false);
  const attempted = useRef(false);
  const latest = useRef({ proof, exercises, visual, autoEnrich, ready });
  useLayoutEffect(() => { latest.current = { proof, exercises, visual, autoEnrich, ready }; });
  useLayoutEffect(() => {
    mounted.current = true;
    const changed = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", changed);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", changed);
    };
  }, []);

  const enrich = useCallback(async (mode: "automatic" | "manual") => {
    if (running.current || !mounted.current) return;
    if (mode === "automatic") {
      const previousFailure = sessionStorage.getItem(failureKey);
      if (previousFailure) { setError(previousFailure); return; }
      if (attempted.current || !latest.current.autoEnrich || !latest.current.ready || document.hidden) return;
    }
    running.current = true;
    attempted.current = true;
    setBusy(mode);
    const failures: string[] = [];
    try {
      for (const [part, label, generate] of steps) {
        if (!mounted.current) break;
        if (mode === "automatic" && (!latest.current.autoEnrich || !latest.current.ready || document.hidden)) {
          attempted.current = false;
          break;
        }
        if (!latest.current[part]) continue;
        try {
          await generate(unit.id);
        } catch (cause) {
          failures.push(label + "：" + (cause instanceof Error ? cause.message : "生成失败"));
        }
      }
      await refreshLocal();
    } catch (cause) {
      failures.push(cause instanceof Error ? cause.message : "刷新书桌失败");
    } finally {
      const failure = failures.join("；");
      if (failure) sessionStorage.setItem(failureKey, failure);
      else sessionStorage.removeItem(failureKey);
      running.current = false;
      if (mounted.current) {
        setError(failure);
        setBusy(null);
      }
    }
  }, [unit.id, failureKey, refreshLocal]);

  useEffect(() => {
    if (!autoEnrich || !ready || complete || error || !visible || busy || attempted.current) return;
    const timer = window.setTimeout(() => void enrich("automatic"), 1500);
    return () => window.clearTimeout(timer);
  }, [autoEnrich, ready, complete, error, visible, busy, enrich]);

  return { autoEnrich, toggle: setAuto, busy, complete, error, configured: ai.status?.configured,
    generate: () => void enrich("manual") };
}
