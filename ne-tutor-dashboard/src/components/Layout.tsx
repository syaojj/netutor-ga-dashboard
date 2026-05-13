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
    padding: '20px 24px 8px',
    borderBottom: '1px solid var(--border)',
    background: 'linear-gradient(180deg, #0f172a 0%, var(--bg) 100%)',
  },
  title: {
    margin: 0,
    fontSize: '1.35rem',
    fontWeight: 700,
    letterSpacing: '-0.02em',
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
          <header style={styles.header}>
            <h1 style={styles.title}>NE Tutor GA data Dashboard</h1>
            {props.filters}
          </header>
        )}
        <main style={styles.content}>{props.children}</main>
      </div>
    </div>
  );
}
