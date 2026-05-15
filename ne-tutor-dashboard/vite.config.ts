import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** GitHub Pages: 프로젝트 사이트는 /repo/, 사용자 사이트(*.github.io)는 / */
function normalizeBase(raw: string | undefined): string {
  const v = (raw ?? '/').trim();
  if (v === '' || v === '/') return '/';
  const withSlash = v.endsWith('/') ? v : `${v}/`;
  return withSlash.startsWith('/') ? withSlash : `/${withSlash}`;
}

const base = normalizeBase(process.env.VITE_BASE);

/** 배포·빌드 시점 — UI「최종 업데이트」에 사용 (페이지 소스 반영 시 `npm run build` 재실행으로 갱신) */
const buildStampIso = new Date().toISOString();

export default defineConfig({
  plugins: [react()],
  base,
  define: {
    __BUILD_STAMP__: JSON.stringify(buildStampIso),
  },
  server: {
    /** LAN·다른 기기에서 http://<PC IP>:5173 접속 (Windows 방화벽에서 Node 허용 필요할 수 있음) */
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          plotly: ['plotly.js-dist-min'],
          xlsx: ['xlsx'],
        },
      },
    },
  },
});
