import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  fetchAIStatus,
  getKeyStatus,
  type AIStatus,
  type KeyStatus,
} from "./api";

type AIConnection = {
  status: KeyStatus | null;
  effective: AIStatus | null;
  available: boolean | null;
  failed: boolean;
  setFailed: (failed: boolean) => void;
  refresh: () => Promise<void>;
};

const AIContext = createContext<AIConnection | null>(null);

export function AIConnectionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [legacy, setLegacy] = useState<AIStatus | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const refreshId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++refreshId.current;
    const [current, fallback] = await Promise.allSettled([
      getKeyStatus(),
      fetchAIStatus(),
    ]);
    if (id !== refreshId.current) return;
    const valid =
      current.status === "fulfilled" &&
      current.value &&
      ["unset", "ready", "error"].includes(current.value.state);
    setStatus(valid ? current.value : null);
    setAvailable(!!valid);
    setLegacy(fallback.status === "fulfilled" ? fallback.value : null);
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      refreshId.current += 1;
    };
  }, [refresh]);

  const effective = status?.configured
    ? { configured: true, provider_label: "DeepSeek", model: status.model }
    : legacy?.configured
      ? legacy
      : null;

  return (
    <AIContext.Provider
      value={{ status, effective, available, failed, setFailed, refresh }}
    >
      {children}
    </AIContext.Provider>
  );
}

export function useAIConnection() {
  const connection = useContext(AIContext);
  if (!connection) throw new Error("AIConnectionProvider is missing");
  return connection;
}
