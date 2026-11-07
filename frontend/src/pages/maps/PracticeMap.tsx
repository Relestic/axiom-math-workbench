import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  Download,
  Flame,
  Info,
  Layers,
  Network,
  PlayCircle,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { useAppData } from "../../app/DataProvider";
import { level, total, type MapProps } from "./shared";

type View = "matrix" | "bars" | "timeline";

export function PracticeMap({ onNavigate, notify }: MapProps) {
  const app = useAppData();
  const modules = app.data.practice.modules;
  const skillNames = app.data.practice.skills;
  const totals = app.data.practice.totals;
  const [view, setView] = useState<View>("matrix");
  const [row, setRow] = useState(1);
  const [col, setCol] = useState(2);

  const current = modules[row] || modules[0];
  const count = current?.counts[col] ?? 0;
  const score = current?.scores[col] ?? 0;
  const exerciseCount = Number(
    totals.exercises ?? total(modules.map((module) => total(module.counts))),
  );
  const totalCells = Number(
    totals.cells ?? modules.reduce((sum, module) => sum + module.counts.length, 0),
  );
  const covered = Number(
    totals.coveredCells ??
      modules.reduce(
        (sum, module) => sum + module.counts.filter((value) => value > 0).length,
        0,
      ),
  );
  const empty = Number(totals.blankCells ?? Math.max(0, totalCells - covered));
  const coverage = Number(
    totals.coveragePercent ??
      (totalCells ? Math.round((covered / totalCells) * 100) : 0),
  );

  const weak = modules
    .flatMap((module, moduleIndex) =>
      module.counts.map((value, skillIndex) => ({
        module,
        moduleIndex,
        skillIndex,
        count: value,
        score: module.scores[skillIndex] || 0,
        skill: skillNames[skillIndex] || "未分类",
      })),
    )
    .filter((item) => item.count > 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  const goExercises = () => {
    if (!current) return;
    app.selectConcept(current.id);
    onNavigate("exercises");
  };

  const locateBlank = () => {
    for (let moduleIndex = 0; moduleIndex < modules.length; moduleIndex += 1) {
      const skillIndex = modules[moduleIndex].counts.findIndex(
        (value) => value === 0,
      );
      if (skillIndex >= 0) {
        setRow(moduleIndex);
        setCol(skillIndex);
        notify(
          `已定位：${modules[moduleIndex].name} · ${skillNames[skillIndex] || "空白能力"}`,
        );
        return;
      }
    }
    notify("当前矩阵没有空白格");
  };

  const exportCsv = () => {
    const lines = [
      "章节,能力,练习量,掌握度",
      ...modules.flatMap((module) =>
        module.counts.map(
          (value, index) =>
            `${module.name},${skillNames[index] || "未分类"},${value},${module.scores[index]}%`,
        ),
      ),
    ];
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + lines.join("\r\n")], {
        type: "text/csv;charset=utf-8;",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "Axiom-练习分布.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("练习分布已导出为 CSV");
  };

  const serverLive = app.data.source === "server";

  return (
    <div className="maps-page practice-page">
      <div className="page-heading map-heading">
        <div>
          <h1>书中的知识点练习可视化</h1>
          <p>按章节与能力展开练习分布，发现薄弱点，让下一次练习更有方向。</p>
        </div>
        <button className="btn" onClick={exportCsv}>
          <Download size={15} />
          导出
        </button>
      </div>

      <div className="map-controls">
        <span className="map-sample-label">
          <Info size={14} />
          {serverLive
            ? "数据来自你的服务端学习记录；空白格表示题库暂无该能力练习"
            : "离线演示数据；登录后显示真实作答与掌握度"}
        </span>
        <div className="map-filter-buttons">
          <div className="map-segment">
            {(
              [
                ["matrix", "热力矩阵"],
                ["bars", "分布条形"],
                ["timeline", "时间线"],
              ] as [View, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                className={view === value ? "active" : ""}
                onClick={() => setView(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="practice-stat-grid">
        <div className="card practice-stat">
          <span>
            <Layers size={14} /> MVP 模块
          </span>
          <div>
            <strong>{modules.length}</strong>
            <small>连续性 → 定积分</small>
          </div>
        </div>
        <div className="card practice-stat">
          <span>
            <Network size={14} /> 能力维度
          </span>
          <div>
            <strong>{skillNames.length}</strong>
            <small>定义、证明与迁移</small>
          </div>
        </div>
        <div className="card practice-stat">
          <span>
            <Check size={14} /> 练习总量
          </span>
          <div>
            <strong>{exerciseCount}</strong>
            <small>按知识模块归类</small>
          </div>
        </div>
        <div className="card practice-stat is-pink">
          <span>
            <CircleAlert size={14} /> 空白格（无练习）
          </span>
          <div>
            <strong>{empty}</strong>
            <small>值得补充的练习</small>
          </div>
        </div>
        <div className="card practice-stat is-dark">
          <span>
            <Flame size={14} /> 练习覆盖率
          </span>
          <div>
            <strong>{coverage}%</strong>
            <small>
              已覆盖 {covered} / {totalCells} 个格子
            </small>
          </div>
        </div>
      </div>

      <div className="map-main-grid">
        <div className="map-left-column">
          <section className="card practice-primary-panel">
            <div className="map-section-head">
              <h3>
                {view === "matrix"
                  ? "章节 × 能力 · 掌握度热力矩阵"
                  : view === "bars"
                    ? "按章节查看平均掌握度"
                    : "练习推进时间线"}
              </h3>
              <span>点击格子，查看练习方向与对应章节</span>
            </div>

            {view === "matrix" && (
              <>
                <div className="heatmap-legend">
                  <span>
                    <i className="empty" /> 未练
                  </span>
                  <span>
                    <i className="low" /> &lt;40%
                  </span>
                  <span>
                    <i className="medium" /> 40–60%
                  </span>
                  <span>
                    <i className="good" /> 60–80%
                  </span>
                  <span>
                    <i className="strong" /> ≥80%
                  </span>
                </div>
                <div className="heatmap-scroll">
                  <table className="heatmap-table">
                    <thead>
                      <tr>
                        <th>章节</th>
                        {skillNames.map((skill) => (
                          <th key={skill}>{skill}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {modules.map((module, moduleIndex) => (
                        <tr key={module.id}>
                          <th className={moduleIndex === row ? "selected" : ""}>
                            <span>0{moduleIndex + 1}</span>
                            {module.name}
                          </th>
                          {module.counts.map((value, skillIndex) => (
                            <td key={skillIndex}>
                              <button
                                className={`heat-cell ${level(module.scores[skillIndex])} ${
                                  moduleIndex === row && skillIndex === col
                                    ? "selected"
                                    : ""
                                }`}
                                aria-label={`${module.name}，${skillNames[skillIndex]}，${value} 道题，掌握度 ${module.scores[skillIndex]}%`}
                                aria-pressed={
                                  moduleIndex === row && skillIndex === col
                                }
                                onClick={() => {
                                  setRow(moduleIndex);
                                  setCol(skillIndex);
                                }}
                              >
                                {value ? `${value} 题` : "—"}
                              </button>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th>练习量合计</th>
                        {skillNames.map((skill, skillIndex) => (
                          <td key={skill}>
                            {total(
                              modules.map((module) => module.counts[skillIndex]),
                            )}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="practice-panel-footer">
                  <span>
                    <Info size={14} /> 空白格表示题库暂未覆盖该能力，不代表能力已掌握
                  </span>
                  <button className="btn small" onClick={locateBlank}>
                    定位一个空白格 <ArrowRight size={13} />
                  </button>
                </div>
              </>
            )}

            {view === "bars" && (
              <div className="large-bars">
                {modules.map((module, index) => {
                  const avg = Math.round(
                    total(module.scores) / Math.max(1, module.scores.length),
                  );
                  return (
                    <button
                      className={`practice-bar-row ${index === row ? "selected" : ""}`}
                      key={module.id}
                      onClick={() => setRow(index)}
                    >
                      <span>
                        0{index + 1} {module.name}
                      </span>
                      <div className="practice-bar-track">
                        <i
                          className={avg < 40 ? "warm" : ""}
                          style={{ width: `${Math.max(3, avg)}%` }}
                        />
                      </div>
                      <strong>{avg}%</strong>
                      <em>{total(module.counts)} 题</em>
                    </button>
                  );
                })}
              </div>
            )}

            {view === "timeline" && (
              <div className="practice-timeline">
                {modules.map((module, index) => (
                  <article className="timeline-item" key={module.id}>
                    <i />
                    <div>
                      <small>模块 0{index + 1}</small>
                      <h4>{module.name}</h4>
                      <p>
                        已练 {total(module.counts)} 题 · 平均掌握度{" "}
                        {Math.round(
                          total(module.scores) /
                            Math.max(1, module.scores.length),
                        )}
                        %
                      </p>
                    </div>
                    <Sparkles size={16} />
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="map-right-column">
          {current && (
            <section className="card practice-detail">
              <span className="badge purple">已选中</span>
              <h2>
                {current.name} · {skillNames[col] || "能力"}
              </h2>
              <div className="practice-detail-stats">
                <div>
                  <small>练习量</small>
                  <strong>{count} 题</strong>
                  <em>{count ? "已有作答记录" : "还没有开始"}</em>
                </div>
                <div>
                  <small>掌握度</small>
                  <strong>{score}%</strong>
                  <em>{score >= 60 ? "保持这个节奏" : "建议优先补齐"}</em>
                </div>
              </div>
              <div className="map-progress">
                <i style={{ width: `${Math.max(3, score)}%` }} />
              </div>
              <div className="practice-recommendation">
                <h4>{count ? "下一步建议" : "从一道题开始补齐理解"}</h4>
                <p>
                  {count
                    ? score < 40
                      ? "先回看定义与一个正例，再独立完成一道条件辨析。"
                      : score < 80
                        ? "尝试不看解答完成变式，并把关键条件写进复盘。"
                        : "可以进入综合迁移，检查能否在新的情境中复用。"
                    : "先列出允许引用的定理，再尝试独立完成关键步骤。"}
                </p>
              </div>
              <button className="btn primary" onClick={goExercises}>
                <PlayCircle size={15} /> 进入该模块练习
              </button>
              <button className="btn" onClick={goExercises}>
                <Check size={15} /> 查看我的实际作答
              </button>
            </section>
          )}

          <section className="card practice-weakness">
            <h3>
              <Flame size={16} /> 最需要补充的方向
            </h3>
            {weak.length ? (
              weak.map((item, index) => (
                <button
                  key={`${item.module.id}-${item.skillIndex}`}
                  onClick={() => {
                    setRow(item.moduleIndex);
                    setCol(item.skillIndex);
                  }}
                >
                  <i>0{index + 1}</i>
                  <span>
                    <b>{item.module.name}</b>
                    <small>
                      {item.skill} · 掌握度 {item.score}%
                    </small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))
            ) : (
              <p className="muted">当前没有需要特别提醒的薄弱方向。</p>
            )}
          </section>
        </aside>
      </div>

      <div className="practice-bottom-grid">
        <section className="card practice-insight">
          <div className="map-spark-icon">
            <Sparkles size={18} />
          </div>
          <h3>把空白格变成下一步</h3>
          <p>
            练习覆盖 {covered}/{totalCells} 个格子。优先选择掌握度低且练习量为 0
            的方向，比重复做已经熟练的题更有价值。
          </p>
          <button className="btn" onClick={locateBlank}>
            定位空白格 <ArrowRight size={14} />
          </button>
        </section>
        <section className="card practice-insight">
          <div className="map-spark-icon">
            <Network size={18} />
          </div>
          <h3>当前建议：{current?.name || "课程主线"}</h3>
          <p>
            {current
              ? `当前选中 ${current.name} · ${skillNames[col] || "能力"}。完成后回到热力矩阵，检查相邻能力是否也需要补齐。`
              : "选择一个模块开始练习。"}
          </p>
          <button className="btn" onClick={() => onNavigate("knowledge-map")}>
            查看知识依赖 <ArrowRight size={14} />
          </button>
        </section>
      </div>
    </div>
  );
}
