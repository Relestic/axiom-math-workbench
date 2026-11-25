import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ApiError,
  clearSession,
  getStoredSession,
  loginRequest,
  logoutRequest,
  meRequest,
  registerRequest,
  updateProfile,
  type ServerUser,
} from "./api";

type Mode = "server" | "offline";

type SessionValue = {
  ready: boolean;
  busy: boolean;
  mode: Mode | null;
  user: ServerUser | null;
  error: string;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    invite: string;
    email: string;
    password: string;
    displayName: string;
  }) => Promise<void>;
  enterOffline: () => void;
  logout: () => Promise<void>;
  updateName: (name: string) => Promise<void>;
  serverMode: boolean;
};

const SessionContext = createContext<SessionValue | null>(null);

function writeIdentity(user: ServerUser): void {
  try {
    localStorage.setItem("axiom-name", user.display_name);
  } catch {
    /* ignore */
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [user, setUser] = useState<ServerUser | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      const stored = getStoredSession();
      if (!stored) {
        if (!cancelled) setReady(true);
        return;
      }
      try {
        const current = await meRequest();
        if (cancelled) return;
        setUser(current);
        setMode("server");
        writeIdentity(current);
      } catch (cause) {
        if (cancelled) return;
        if (cause instanceof ApiError && cause.status === 401) {
          clearSession();
        }
        setError(
          cause instanceof ApiError
            ? cause.message
            : "无法连接后端，请确认后端已启动。",
        );
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setBusy(true);
    setError("");
    try {
      const result = await loginRequest(email.trim(), password);
      setUser(result.user);
      setMode("server");
      writeIdentity(result.user);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "登录失败：无法连接后端，请先启动 backend。",
      );
      setMode(null);
      throw cause;
    } finally {
      setBusy(false);
      setReady(true);
    }
  }, []);

  const register = useCallback(
    async (input: {
      invite: string;
      email: string;
      password: string;
      displayName: string;
    }) => {
      setBusy(true);
      setError("");
      try {
        const result = await registerRequest({
          invite_code: input.invite.trim(),
          email: input.email.trim(),
          password: input.password,
          display_name: input.displayName.trim(),
        });
        setUser(result.user);
        setMode("server");
        writeIdentity(result.user);
      } catch (cause) {
        setError(
          cause instanceof ApiError
            ? cause.message
            : "注册失败：无法连接后端，请先启动 backend。",
        );
        setMode(null);
        throw cause;
      } finally {
        setBusy(false);
        setReady(true);
      }
    },
    [],
  );

  const enterOffline = useCallback(() => {
    clearSession();
    setMode("offline");
    setUser(null);
    setError("");
    setReady(true);
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // Local sign-out must still work when the server is unreachable.
    } finally {
      clearSession();
      setUser(null);
      setMode(null);
      setError("");
      window.location.reload();
    }
  }, []);

  const updateName = useCallback(
    async (name: string) => {
      if (mode === "server") {
        const updated = await updateProfile({ display_name: name });
        setUser(updated);
        writeIdentity(updated);
        return;
      }
      try {
        localStorage.setItem("axiom-name", name);
      } catch {
        /* ignore */
      }
    },
    [mode],
  );

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      busy,
      mode,
      user,
      error,
      login,
      register,
      enterOffline,
      logout,
      updateName,
      serverMode: mode === "server",
    }),
    [ready, busy, mode, user, error, login, register, enterOffline, logout, updateName],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
