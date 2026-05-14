import { useState, type CSSProperties } from 'react';
import { LAW_DATA_SUBMENU_ITEMS } from '../data/gaSources';

const styles: Record<string, CSSProperties> = {
  aside: {
    width: 240,
    flexShrink: 0,
    background: 'var(--panel)',
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
    color: 'var(--text)',
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
  linkSubNested: {
    padding: '8px 12px 8px 32px',
    fontSize: '0.8rem',
  },
  linkActive: {
    background: 'var(--sidebar-active-bg)',
    color: 'var(--sidebar-active-fg)',
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
      <div style={styles.brand}>NE Tutor 이용 분석</div>

      <button
        type="button"
        style={{
          ...styles.link,
          ...(props.mainView === 'dashboard' ? styles.linkActive : {}),
        }}
        onClick={props.onDashboard}
      >
        통합 대시보드
      </button>

      <button
        type="button"
        style={styles.navHeadButton}
        onClick={() => setRawOpen((v) => !v)}
        aria-expanded={rawOpen}
        aria-controls="law-data-list"
      >
        <span>LAW DATA</span>
        <span style={styles.caret}>{rawOpen ? '▾' : '▸'}</span>
      </button>
      {rawOpen && (
        <div id="law-data-list">
          {LAW_DATA_SUBMENU_ITEMS.map((item) => (
            <button
              type="button"
              key={item.displayName}
              style={{
                ...styles.link,
                ...styles.linkSubNested,
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

    </aside>
  );
}
