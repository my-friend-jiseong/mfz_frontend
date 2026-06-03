// heatmap.js(h337) v2.0.5 모듈 선언 — 패키지에 타입이 없어 우리가 쓰는 API 만 최소 선언.
// 웹(KakaoMapWebView.web.tsx)에서 `import h337 from 'heatmap.js'` 용. 네이티브는 vendored 소스(heatmapLib.ts) 사용.

declare module 'heatmap.js' {
  export interface HeatmapGradient {
    [offset: number]: string;
  }

  export interface HeatmapConfig {
    container: HTMLElement;
    radius?: number;
    maxOpacity?: number;
    minOpacity?: number;
    blur?: number;
    gradient?: HeatmapGradient;
    backgroundColor?: string;
    width?: number;
    height?: number;
  }

  export interface HeatmapDataPoint {
    x: number;
    y: number;
    value: number;
    radius?: number;
  }

  export interface HeatmapData {
    max?: number;
    min?: number;
    data: HeatmapDataPoint[];
  }

  export interface HeatmapInstance {
    setData(data: HeatmapData): HeatmapInstance;
    addData(point: HeatmapDataPoint | HeatmapDataPoint[]): HeatmapInstance;
    configure(config: Partial<HeatmapConfig>): HeatmapInstance;
    repaint(): HeatmapInstance;
    getData(): HeatmapData;
    getDataURL(): string;
  }

  export interface H337 {
    create(config: HeatmapConfig): HeatmapInstance;
    register(name: string, plugin: unknown): void;
  }

  const h337: H337;
  export default h337;
}
