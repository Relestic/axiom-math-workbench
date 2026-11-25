export type SurfacePalette = "violet" | "teal" | "amber" | "mono";

export type SurfaceScene = {
  expression: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  resolution: number;
  view: {
    azimuth: number;
    elevation: number;
    heightScale: number;
    zoom: number;
  };
  display: {
    opacity: number;
    wireframe: boolean;
    showAxes: boolean;
    palette: SurfacePalette;
  };
};

export const defaultSurfaceScene: SurfaceScene = {
  expression: "x^2 + y^2",
  xMin: -1.6,
  xMax: 1.6,
  yMin: -1.6,
  yMax: 1.6,
  resolution: 30,
  view: {
    azimuth: 45,
    elevation: 28,
    heightScale: 1,
    zoom: 1,
  },
  display: {
    opacity: 0.88,
    wireframe: true,
    showAxes: true,
    palette: "violet",
  },
};

export const surfacePresets: {
  id: string;
  label: string;
  expression: string;
  range?: number;
}[] = [
  { id: "paraboloid", label: "抛物面 z=x²+y²", expression: "x^2 + y^2" },
  { id: "saddle", label: "马鞍面 z=x²−y²", expression: "x^2 - y^2" },
  { id: "wave", label: "波浪 sin(x)cos(y)", expression: "sin(x)*cos(y)" },
  {
    id: "gaussian",
    label: "高斯钟形",
    expression: "exp(-(x^2 + y^2))",
  },
  {
    id: "ripple",
    label: "同心波纹",
    expression: "sin(3*sqrt(x^2 + y^2))",
  },
  {
    id: "cone",
    label: "锥面 sqrt(x²+y²)",
    expression: "sqrt(x^2 + y^2)",
  },
];
