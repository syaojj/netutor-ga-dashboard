/// <reference types="vite/client" />

declare module 'plotly.js-dist-min' {
  import type { PlotlyHTMLElement } from 'plotly.js';
  const Plotly: {
    newPlot: (
      root: HTMLElement | string,
      data: object[],
      layout?: object,
      config?: object,
    ) => Promise<PlotlyHTMLElement>;
    purge: (root: HTMLElement | string) => void;
  };
  export default Plotly;
}

declare module 'plotly.js-dist-min' {
  import type { PlotlyStatic } from 'plotly.js';
  const Plotly: PlotlyStatic;
  export default Plotly;
}
