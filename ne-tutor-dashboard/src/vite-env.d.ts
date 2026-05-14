/// <reference types="vite/client" />

declare module 'plotly.js-dist-min' {
  import type { PlotlyStatic } from 'plotly.js';
  const Plotly: PlotlyStatic;
  export default Plotly;
}
