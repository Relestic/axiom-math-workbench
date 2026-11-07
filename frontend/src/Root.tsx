import { AlertCircle, LoaderCircle, RotateCcw } from "lucide-react";
import App from "./App";
import { AuthScreen } from "./modules/identity";
import { useAppData } from "./app/DataProvider";
import { useSession } from "./lib/session";

function Boot({ label }: { label: string }) {
  return (
    <div className="auth-boot">
      <div>
        <LoaderCircle size={20} className="auth-spin" />
        {label}
      </div>
    </div>
  );
}

function DataError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="auth-page">
      <section className="auth-brand">
        <h1>Axiom 公理</h1>
        <h2>无法加载学习数据</h2>
        <p className="auth-server">{message}</p>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-error" role="alert">
            <AlertCircle size={16} />
            <span>{message}</span>
          </div>
          <button className="auth-submit" onClick={retry}>
            <RotateCcw size={17} />
            重新加载
          </button>
          <p className="auth-hint">
            请确认后端仍在运行。若登录已失效，刷新页面后重新登录即可。
          </p>
        </div>
      </section>
    </div>
  );
}

export default function Root() {
  const { ready, user, mode } = useSession();
  const { status, error, retry } = useAppData();

  if (!ready) return <Boot label="正在检查登录状态…" />;
  if (mode !== "offline" && !user) return <AuthScreen />;
  if (mode === "server" && status === "loading") {
    return <Boot label="正在从后端加载课程与学习记录…" />;
  }
  if (mode === "server" && status === "error") {
    return <DataError message={error} retry={retry} />;
  }
  return <App />;
}
