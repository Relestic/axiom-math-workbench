import { useState } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  CircleAlert,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  Mail,
  Server,
  Sparkles,
  WifiOff,
} from "lucide-react";
import { API_BASE } from "../lib/api";
import { useSession } from "../lib/session";
import "./auth.css";

export default function AuthScreen() {
  const { login, register, enterOffline, busy, error } = useSession();
  const [registering, setRegistering] = useState(false);
  const [email, setEmail] = useState("demo@axiom.local");
  const [password, setPassword] = useState("axiom-demo-2026");
  const [displayName, setDisplayName] = useState("");
  const [invite, setInvite] = useState("");
  const [localError, setLocalError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError("");
    try {
      if (registering) {
        if (!displayName.trim() || !invite.trim()) {
          setLocalError("请填写邀请码与显示名称");
          return;
        }
        await register({ invite, email, password, displayName });
      } else {
        await login(email, password);
      }
    } catch {
      /* The session provider exposes the server message. */
    }
  };

  const demo = async () => {
    setLocalError("");
    try {
      await login("demo@axiom.local", "axiom-demo-2026");
    } catch {
      /* handled by the provider */
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-brand">
        <span className="auth-logo">
          <BookOpenCheck size={27} />
        </span>
        <h1>Axiom 公理</h1>
        <p className="auth-kicker">数学系 AI 学习工作台</p>
        <h2>
          从图像直觉，
          <br />
          走向严谨证明。
        </h2>
        <ul>
          <li>
            <Sparkles size={16} />
            教材定义、条件与证明依赖可追溯
          </li>
          <li>
            <Sparkles size={16} />
            讲义、图像与练习连在一起
          </li>
          <li>
            <Sparkles size={16} />
            作答、笔记与学习进度保存在服务端
          </li>
        </ul>
        <div className="auth-server">
          <Server size={15} />
          后端：{API_BASE || "当前站点（同源 API）"}
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-tabs">
            <button
              className={!registering ? "active" : ""}
              onClick={() => {
                setRegistering(false);
                setLocalError("");
              }}
            >
              登录
            </button>
            <button
              className={registering ? "active" : ""}
              onClick={() => {
                setRegistering(true);
                setLocalError("");
                setEmail("");
                setPassword("");
              }}
            >
              使用邀请码注册
            </button>
          </div>

          <form onSubmit={submit}>
            {registering && (
              <>
                <label className="auth-field">
                  <span>邀请码</span>
                  <div>
                    <LockKeyhole size={16} />
                    <input
                      value={invite}
                      onChange={(event) => setInvite(event.target.value)}
                      placeholder="AXIOM-XXXX-XXXX"
                      autoComplete="one-time-code"
                    />
                  </div>
                </label>
                <label className="auth-field">
                  <span>显示名称</span>
                  <div>
                    <Sparkles size={16} />
                    <input
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="例如：林越"
                      autoComplete="nickname"
                    />
                  </div>
                </label>
              </>
            )}
            <label className="auth-field">
              <span>邮箱</span>
              <div>
                <Mail size={16} />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </label>
            <label className="auth-field">
              <span>密码</span>
              <div>
                <LockKeyhole size={16} />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={registering ? "至少 10 个字符" : "输入密码"}
                  autoComplete={registering ? "new-password" : "current-password"}
                  required
                />
              </div>
            </label>

            {(localError || error) && (
              <div className="auth-error" role="alert">
                <CircleAlert size={16} />
                <span>{localError || error}</span>
              </div>
            )}

            <button className="auth-submit" disabled={busy} type="submit">
              {busy ? (
                <LoaderCircle size={17} className="auth-spin" />
              ) : registering ? (
                <Sparkles size={17} />
              ) : (
                <LogIn size={17} />
              )}
              {busy ? "正在连接后端…" : registering ? "注册并进入" : "登录"}
            </button>
          </form>

          {!registering && (
            <button className="auth-demo" onClick={demo} disabled={busy}>
              使用演示学生账号快速进入
              <ArrowRight size={15} />
            </button>
          )}

          <div className="auth-divider">
            <span>或者</span>
          </div>
          <button className="auth-offline" onClick={enterOffline}>
            <WifiOff size={15} />
            返回本地学习空间
          </button>
          <p className="auth-hint">
            本地空间把作答、笔记和进度保存在当前浏览器。登录后使用该账号的服务器记录。
            若连接失败，请稍后重试；本地开发请确认 backend 已启动。
          </p>
        </div>
      </section>
    </div>
  );
}
