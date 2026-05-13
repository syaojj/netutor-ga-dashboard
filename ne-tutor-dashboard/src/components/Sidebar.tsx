import type { CSSProperties } from 'react';
import { GA_HTML_SOURCES, ORDERS_XLSX_NAME } from '../data/gaSources';

function sheetLabel(filename: string): string {
  const base = filename.replace(/\.html$/i, '').replace(/\.xlsx$/i, '');
  return base.replace(/\sM$/i, ' Mobile');
}

const styles: Record<string, CSSProperties> = {
  aside: {
    width: 240,
    flexShrink: 0,
    background: '#0b1220',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px 12px',
    gap: 6,
  },
  brand: {
    fontWeight: 700,
    fontSize: '0.95rem',
    padding: '0 8px 12px',
    color: '#e5e7eb',
    borderBottom: '1px solid var(--border)',
    marginBottom: 4,
  },
  navHead: {
    fontSize: '0.7rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--muted)',
    padding: '10px 8px 4px',
  },
  link: {
    display: 'block',
    padding: '10px 12px',
    borderRadius: 8,
    color: 'var(--muted)',
    fontSize: '0.85rem',
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    textAlign: 'left',
    width: '100%',
  },
  linkActive: {
    background: 'rgba(59,130,246,0.15)',
    color: '#93c5fd',
  },
  foot: {
    marginTop: 'auto',
    padding: '12px 8px',
    fontSize: '0.75rem',
    color: 'var(--muted)',
    lineHeight: 1.5,
  },
};

export function Sidebar(props: {
  mainView: 'dashboard' | 'raw';
  activeRawFile: string | null;
  onDashboard: () => void;
  onOpenRaw: (filename: string) => void;
}) {
  return (
    <aside style={styles.aside}>
      <div style={styles.brand}>NE Tutor GA</div>

      <div style={styles.navHead}>통합 화면</div>
      <button
        type="button"
        style={{
          ...styles.link,
          ...(props.mainView === 'dashboard' ? styles.linkActive : {}),
        }}
        onClick={props.onDashboard}
      >
        대시보드
      </button>

      <div style={styles.navHead}>GA 시트 · 원시 데이터</div>
      {GA_HTML_SOURCES.map((name) => (
        <button
          type="button"
          key={name}
          style={{
            ...styles.link,
            fontSize: '0.8rem',
            ...(props.mainView === 'raw' && props.activeRawFile === name ? styles.linkActive : {}),
          }}
          onClick={() => props.onOpenRaw(name)}
          title={name}
        >
          {sheetLabel(name)}
        </button>
      ))}

      <div style={styles.navHead}>주문</div>
      <button
        type="button"
        style={{
          ...styles.link,
          ...(props.mainView === 'raw' && props.activeRawFile === ORDERS_XLSX_NAME ? styles.linkActive : {}),
        }}
        onClick={() => props.onOpenRaw(ORDERS_XLSX_NAME)}
        title={ORDERS_XLSX_NAME}
      >
        {sheetLabel(ORDERS_XLSX_NAME)}
      </button>

      <div style={styles.foot}>
        왼쪽 메뉴는 섹션 이동이 아니라 파일 단위 원시 표입니다. 대시보드의 월별·년간 트렌드는 각 섹션 안의 검색
        영역에서 기간을 조정할 수 있습니다. 시트 이름의 M은 Mobile 데이터입니다.
      </div>
    </aside>
  );
}
