import { useMemo, useRef } from "react";
import { sampleSurface } from "./engine";
import type { SurfacePalette, SurfaceScene } from "./types";

const palettes: Record<
  SurfacePalette,
  { low: [number, number, number]; high: [number, number, number]; hue: number }
> = {
  violet: { low: [246, 64, 58], high: [183, 78, 76], hue: 255 },
  teal: { low: [174, 62, 45], high: [168, 76, 76], hue: 178 },
  amber: { low: [28, 78, 58], high: [52, 92, 78], hue: 38 },
  mono: { low: [220, 16, 48], high: [220, 18, 84], hue: 220 },
};

function interpolateColor(
  t: number,
  palette: SurfacePalette,
  opacity: number,
): string {
  const p = palettes[palette];
  const clamped = Math.max(0, Math.min(1, t));
  const hue = p.low[0] + (p.high[0] - p.low[0]) * clamped;
  const sat = p.low[1] + (p.high[1] - p.low[1]) * clamped;
  const light = p.low[2] + (p.high[2] - p.low[2]) * clamped;
  return `hsla(${hue}, ${sat}%, ${light}%, ${opacity})`;
}

export function SurfacePlot3D({
  scene,
  onViewChange,
  onResetView,
}: {
  scene: SurfaceScene;
  onViewChange: (view: Partial<SurfaceScene["view"]>) => void;
  onResetView: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    azimuth: number;
    elevation: number;
  } | null>(null);
  const grid = useMemo(
    () => sampleSurface(scene),
    [
      scene.expression,
      scene.xMin,
      scene.xMax,
      scene.yMin,
      scene.yMax,
      scene.resolution,
    ],
  );
  const W = 920;
  const H = 560;
  const a = (scene.view.azimuth * Math.PI) / 180;
  const e = (scene.view.elevation * Math.PI) / 180;
  const cosA = Math.cos(a);
  const sinA = Math.sin(a);
  const cosE = Math.cos(e);
  const sinE = Math.sin(e);
  const halfX = (scene.xMax - scene.xMin) / 2 || 1;
  const halfY = (scene.yMax - scene.yMin) / 2 || 1;
  const halfZ = (grid.zMax - grid.zMin) / 2 || 1;
  const zMid = (grid.zMax + grid.zMin) / 2;
  const xMid = (scene.xMin + scene.xMax) / 2;
  const yMid = (scene.yMin + scene.yMax) / 2;
  const base = Math.min(W, H) * 0.36 * scene.view.zoom;

  const project = (x: number, y: number, z: number): [number, number, number] => {
    const nx = (x - xMid) / halfX;
    const ny = (y - yMid) / halfY;
    const nz = ((z - zMid) / halfZ) * scene.view.heightScale;
    const rx = nx * cosA - ny * sinA;
    const ry = nx * sinA + ny * cosA;
    return [
      W / 2 + rx * base,
      H / 2 + ry * base * sinE - nz * base * cosE,
      ry * cosE + nz * sinE,
    ];
  };

  const path = (points: [number, number][]) =>
    points.map((p, index) => `${index ? "L" : "M"}${p[0]},${p[1]}`).join(" ");

  const quads: {
    points: string;
    fill: string;
    depth: number;
    stroke: string;
  }[] = [];
  const n = Math.min(scene.resolution, grid.xs.length - 1);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const z00 = grid.values[j][i];
      const z10 = grid.values[j][i + 1];
      const z11 = grid.values[j + 1][i + 1];
      const z01 = grid.values[j + 1][i];
      if (
        ![z00, z10, z11, z01].every((value) => Number.isFinite(value)) ||
        Math.max(z00, z10, z11, z01) - Math.min(z00, z10, z11, z01) > halfZ * 2.5
      ) {
        continue;
      }
      const p00 = project(grid.xs[i], grid.ys[j], z00);
      const p10 = project(grid.xs[i + 1], grid.ys[j], z10);
      const p11 = project(grid.xs[i + 1], grid.ys[j + 1], z11);
      const p01 = project(grid.xs[i], grid.ys[j + 1], z01);
      const avgZ = (z00 + z10 + z11 + z01) / 4;
      const t = (avgZ - grid.zMin) / (grid.zMax - grid.zMin || 1);
      const depth = (p00[2] + p10[2] + p11[2] + p01[2]) / 4;
      quads.push({
        points: path([
          [p00[0], p00[1]],
          [p10[0], p10[1]],
          [p11[0], p11[1]],
          [p01[0], p01[1]],
        ]) + " Z",
        fill: interpolateColor(t, scene.display.palette, scene.display.opacity),
        depth,
        stroke: `hsla(${palettes[scene.display.palette].hue}, 34%, 78%, ${scene.display.wireframe ? 0.34 : 0})`,
      });
    }
  }
  quads.sort((left, right) => left.depth - right.depth);

  const zFloor = grid.zMin;
  const floor = [
    project(scene.xMin, scene.yMin, zFloor),
    project(scene.xMax, scene.yMin, zFloor),
    project(scene.xMax, scene.yMax, zFloor),
    project(scene.xMin, scene.yMax, zFloor),
  ];
  const origin = project(
    Math.max(scene.xMin, Math.min(0, scene.xMax)),
    Math.max(scene.yMin, Math.min(0, scene.yMax)),
    zFloor,
  );
  const xTip = project(scene.xMax, 0, zFloor);
  const yTip = project(0, scene.yMax, zFloor);
  const zTip = project(
    Math.max(scene.xMin, Math.min(0, scene.xMax)),
    Math.max(scene.yMin, Math.min(0, scene.yMax)),
    grid.zMax,
  );

  const beginDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      azimuth: scene.view.azimuth,
      elevation: scene.view.elevation,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    onViewChange({
      azimuth: (drag.current.azimuth + dx * 0.45 + 360) % 360,
      elevation: Math.max(
        5,
        Math.min(85, drag.current.elevation + dy * -0.28),
      ),
    });
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div className="surface-canvas">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`三维曲面 ${scene.expression}，可拖动旋转，滚轮缩放`}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onResetView}
        onWheel={(event) => {
          event.preventDefault();
          onViewChange({
            zoom: Math.max(
              0.5,
              Math.min(2, scene.view.zoom - event.deltaY * 0.0012),
            ),
          });
        }}
      >
        <defs>
          <radialGradient id="surface-glow" cx="50%" cy="48%" r="60%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#f5f3ff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="surface-floor" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#312e81" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill="url(#surface-glow)" />
        <path
          d={path(floor.map((p) => [p[0], p[1]])) + " Z"}
          fill="url(#surface-floor)"
          stroke="#ddd9f0"
          strokeWidth={1.2}
        />
        {scene.display.showAxes && (
          <g strokeWidth={1.4}>
            <path
              d={path([
                [origin[0], origin[1]],
                [xTip[0], xTip[1]],
              ])}
              stroke="#f59e0b"
            />
            <path
              d={path([
                [origin[0], origin[1]],
                [yTip[0], yTip[1]],
              ])}
              stroke="#0d9488"
            />
            <path
              d={path([
                [origin[0], origin[1]],
                [zTip[0], zTip[1]],
              ])}
              stroke="#6366f1"
            />
            <text x={xTip[0] + 8} y={xTip[1] + 4} fill="#b45309" fontSize="13">
              x
            </text>
            <text x={yTip[0] + 8} y={yTip[1] + 4} fill="#0f766e" fontSize="13">
              y
            </text>
            <text x={zTip[0] + 8} y={zTip[1] - 6} fill="#4f46e5" fontSize="13">
              z
            </text>
          </g>
        )}
        {quads.map((quad, index) => (
          <path
            key={index}
            d={quad.points}
            fill={quad.fill}
            stroke={quad.stroke}
            strokeWidth={0.75}
            strokeLinejoin="round"
          />
        ))}
        {scene.display.showAxes && (
          <g>
            <circle cx={origin[0]} cy={origin[1]} r={3} fill="#4338ca" />
            <text
              x={22}
              y={H - 22}
              fill="#8b8ba7"
              fontSize="12"
              fontFamily="var(--font-mono, monospace)"
            >
              z ∈ [{grid.zMin.toFixed(2)}, {grid.zMax.toFixed(2)}] · 拖动旋转 ·
              滚轮缩放
            </text>
          </g>
        )}
        {!grid.finiteCount && (
          <g>
            <rect
              x={W / 2 - 190}
              y={H / 2 - 40}
              width={380}
              height={80}
              rx={14}
              fill="#fff"
              stroke="#f0d5dd"
            />
            <text
              x={W / 2}
              y={H / 2}
              textAnchor="middle"
              fill="#b4234d"
              fontSize="14"
            >
              当前范围内没有可绘制的实数值
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
