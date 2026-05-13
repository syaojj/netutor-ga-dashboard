import { useState, type CSSProperties } from 'react';
import { RAW_MENU_ITEMS } from '../data/gaSources';

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
  navHeadButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    border: 'none',
    background: 'transparent',
    color: 'var(--muted)',
    padding: '10px 8px 4px',
    cursor: 'pointer',
    font: 'inherit',
    fontSize: '0.7rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    textAlign: 'left',
  },
  caret: { fontSize: '0.65rem', opacity: 0.8 },
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
  linkSub: {
    padding: '8px 12px 8px 22px',
    fontSize: '0.82rem',
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
  onOpenRaw: (key: string) => void;
}) {
  const [rawOpen, setRawOpen] = useState(false);
  return (
    <aside style={styles.aside}>
      <div style={styles.brand}>NE Tutor GA</div>

      <button
        type="button"
        style={{
          ...styles.link,
          ...(props.mainView === 'dashboard' ? styles.linkActive : {}),
        }}
        onClick={props.onDashboard}
      >
        통합화면 대시보드
      </button>

      <button
        type="button"
        style={styles.navHeadButton}
        onClick={() => setRawOpen((v) => !v)}
        aria-expanded={rawOpen}
        aria-controls="raw-data-list"
      >
        <span>Raw Data</span>
        <span style={styles.caret}>{rawOpen ? '▾' : '▸'}</span>
      </button>
      {rawOpen && (
        <div id="raw-data-list">
          {RAW_MENU_ITEMS.map((item) => (
            <button
              type="button"
              key={item.displayName}
              style={{
                ...styles.link,
                ...styles.linkSub,
                ...(props.mainView === 'raw' && props.activeRawFile === item.displayName
                  ? styles.linkActive
                  : {}),
              }}
              onClick={() => props.onOpenRaw(item.displayName)}
              title={item.displayName}
            >
              ㄴ {item.displayName}
            </button>
          ))}
        </div>
      )}

      <div style={styles.foot}>
        대시보드와 Raw Data는 동일한 월간 통합 데이터 소스를 사용합니다. 좌측 메뉴에서 서비스를 선택하면 해당
        서비스의 월별 원시 데이터(MAU·신규사용자)를 표로 확인할 수 있습니다.
      </div>
    </aside>
  );
}
