import type { CSSProperties, ReactNode } from 'react';

const styles: Record<string, CSSProperties> = {
  root: {
    display: 'flex',
    minHeight: '100vh',
    background: 'var(--bg)',
    color: 'var(--text)',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  header: {
    padding: '14px 24px',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  title: {
    margin: 0,
    fontSize: '1.35rem',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    flex: '0 1 auto',
  },
  filtersWrap: {
    flex: '0 1 auto',
    display: 'flex',
    alignItems: 'center',
  },
  content: {
    padding: '16px 24px 48px',
    flex: 1,
    overflow: 'auto',
  },
};

export function Layout(props: {
  sidebar: ReactNode;
  filters: ReactNode;
  children: ReactNode;
  /** true면 상단 대시보드 제목·필터 바를 숨김(원시 데이터 화면용) */
  hideTopBar?: boolean;
}) {
  return (
    <div style={styles.root} className="dashboard-scroll app-root">
      {props.sidebar}
      <div style={styles.main}>
        {!props.hideTopBar && (
          <header className="app-header-bar" style={styles.header}>
            <div style={styles.headerRow}>
              <h1 style={styles.title}>NE Tutor 이용 분석 대시보드</h1>
              <div style={styles.filtersWrap}>{props.filters}</div>
            </div>
          </header>
        )}
        <main style={styles.content}>{props.children}</main>
      </div>
    </div>
  );
}
