/// <reference types="vite/client" />

/** `vite.config` define — 앱 빌드 시각(ISO 8601) */
declare const __BUILD_STAMP__: string;

declare module 'plotly.js-dist-min' {
  import type { PlotlyStatic } from 'plotly.js';
  const Plotly: PlotlyStatic;
  export default Plotly;
}
