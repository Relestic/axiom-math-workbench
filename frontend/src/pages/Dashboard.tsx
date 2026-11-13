import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  FileText,
  Flame,
  LayoutGrid,
  Network,
  Play,
  Plus,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import { Constellation } from "./Maps";
import { useAppData } from "../app/DataProvider";
import { validRoutes } from "../navigation";

export function Dashboard({
  name,
  onNavigate,
  onUpload,
}: {
  name: string;
  onNavigate: (p: string) => void;
  onUpload: () => void;
}) {
  const [compact, setCompact] = useState(false);
  const { data } = useAppData();
  const dashboard = data.dashboard;
  const last = localStorage.getItem("axiom-last-page") || "textbook";
  const resume =
    validRoutes.includes(last) && last !== "dashboard" ? last : "textbook";
  const summary = dashboard.summary;
  const count = summary.practice.attemptsTotal;
  const mastery = Math.round(summary.mastery.overall);
  const streak = summary.streakDays;
  const reviewCount = summary.review.count;
  const gapCount = summary.graph.gaps;
  const conceptTotal = summary.mastery.conceptTotal;
  const graphStats = dashboard.graphStats;
  const practiceTotals = dashboard.practiceTotals;
  const currentConcept = summary.current.conceptName || "一致连续";
  return (
    <div className="dashboard">
      <div className="page-heading">
        <div>
          <h1>你好，{name}</h1>
          <p>沿着当前进度继续探索。让每一次观察，都成为证明的起点。</p>
        </div>
        <div className="button-row">
          <button className="btn" onClick={onUpload}>
            <Upload size={16} />
            上传教材
          </button>
          <button className="btn primary" onClick={() => onNavigate(resume)}>
            <Play size={15} fill="currentColor" />
            继续上次学习
          </button>
        </div>
      </div>
      <div className="section-heading">
        <div>
          <Eye size={17} />
          <strong>可视化视图</strong>
          <span className="muted">把整本书的练习分布与知识依赖摆到眼前</span>
        </div>
        <div className="segmented">
          <button
            className={!compact ? "active" : ""}
            onClick={() => setCompact(false)}
          >
            卡片
          </button>
          <button
            className={compact ? "active" : ""}
            onClick={() => setCompact(true)}
          >
            紧凑
          </button>
        </div>
      </div>
      <div className={`dashboard-maps ${compact ? "compact" : ""}`}>
        {[
          {
            id: "practice-map",
            title: "书中的知识点练习可视化",
            subtitle:
              "章节依赖星图：章节之间的依赖与掌握度一图看清，薄弱环节染成粉色",
            icon: LayoutGrid,
            teal: false,
          },
          {
            id: "knowledge-map",
            title: "数学总地图可视化",
            subtitle:
              "整门课的知识依赖网络，点哪里都能看到它由谁支撑、被谁用着",
            icon: Network,
            teal: true,
          },
        ].map((item, index) => (
          <article className="card map-preview-card" key={item.id}>
            <div className="card-heading">
              <span className={`tile-icon ${item.teal ? "teal" : ""}`}>
                <item.icon size={18} />
              </span>
              <h3>{item.title}</h3>
              <span className="new-label">NEW</span>
            </div>
            <p className="small muted">{item.subtitle}</p>
            <button
              aria-label={`预览${item.title}`}
              className="constellation-preview"
              onClick={() => onNavigate(item.id)}
            >
              <Constellation mini />
            </button>
            <div className="preview-stats">
              {(index === 0
                ? [
                    [
                      "已覆盖格子",
                      `${practiceTotals.coveredCells ?? 8} / ${practiceTotals.cells ?? 40}`,
                    ],
                    ["知识主题", `${conceptTotal} 个`],
                    ["待复习", `${reviewCount} 项`],
                  ]
                : [
                    ["知识节点", `${graphStats.nodes ?? 20}`],
                    ["依赖边", `${graphStats.edges ?? 28} 条`],
                    ["前置缺口", `${gapCount} 处`],
                  ]
              ).map(([label, value], i) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong className={i === 2 ? "rose-text" : ""}>
                    {value}
                  </strong>
                </div>
              ))}
            </div>
            <div className="card-bottom">
              <small className={index ? "teal-text" : "orange-text"}>
                {index
                  ? `◉ ${currentConcept} ← 连接定义、证明与反例`
                  : `◉ ${currentConcept} · 从量词理解开始补强`}
              </small>
              <button
                className={`btn ${index ? "dark" : "primary"}`}
                onClick={() => onNavigate(item.id)}
              >
                {index ? "打开数学总地图" : "打开练习星图"}
                <ArrowRight size={15} />
              </button>
            </div>
          </article>
        ))}
      </div>
      <section className="card today-card">
        <div className="today-heading">
          <span className="tile-icon large">
            <Flame size={24} />
          </span>
          <div>
            <h2>今日练习</h2>
            <p className="muted">一点直觉，一步证明。今天也让理解更进一步。</p>
          </div>
          <div className="button-row">
            <button
              className="btn primary"
              onClick={() => onNavigate("exercises")}
            >
              <Play size={16} />
              开始今日练习
            </button>
            <button className="btn" onClick={() => onNavigate("review")}>
              查看今日报告
            </button>
          </div>
        </div>
        <div className="daily-metrics">
          <div>
            <span>服务端作答</span>
            <strong>
              {count}
              <small>次作答</small>
            </strong>
            <small className="green-text">
              连续学习 {streak} 天 · 掌握度 {mastery}%
            </small>
          </div>
          <div>
            <span>当前学习主线</span>
            <strong>
              {conceptTotal}
              <small>个模块</small>
            </strong>
            <small className="orange-text">{currentConcept} · 连续性 → 定积分</small>
          </div>
          <div>
            <span>待复习 / 前置缺口</span>
            <strong>
              {reviewCount}
              <small>项待复习</small>
            </strong>
            <small>另有 {gapCount} 处前置知识缺口</small>
          </div>
        </div>
        <div className="daily-progress">
          <span>服务端掌握度</span>
          <div className="progress-track">
            <i style={{ width: `${mastery}%` }} />
          </div>
          <strong>{mastery}%</strong>
        </div>
        <div className="quick-actions">
          {[
            [
              "explore",
              `续练：${currentConcept}`,
              "继续当前的图像与证明任务",
              Play,
            ],
            [
              "review",
              `待复习队列 · ${reviewCount} 项`,
              "按服务端记录继续复盘",
              Clock3,
            ],
            [
              "practice-map",
              "掌握度与学习链路",
              "查看真实练习分布，寻找下一步",
              TrendingUp,
            ],
          ].map(([id, label, desc, Icon]: any) => (
            <button key={id} onClick={() => onNavigate(id)}>
              <span
                className={`tile-icon ${id === "review" ? "orange" : id === "practice-map" ? "teal" : ""}`}
              >
                <Icon size={18} />
              </span>
              <span>
                <strong>{label}</strong>
                <small>{desc}</small>
              </span>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
        <div className="today-foot">
          <small>
            {count
              ? "作答、提示使用和掌握度来自你的服务端学习记录。"
              : "还没有服务端作答记录；完成一次练习后会在这里汇总。"}
          </small>
          <button className="text-button" onClick={() => onNavigate("review")}>
            查看全部练习记录 →
          </button>
        </div>
      </section>
    </div>
  );
}
