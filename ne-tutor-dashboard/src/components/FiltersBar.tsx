import type { CSSProperties } from 'react';

const row: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  alignItems: 'center',
};

const label: CSSProperties = { fontSize: '0.8rem', color: 'var(--muted)' };

export function FiltersBar(props: {
  usedSample: boolean;
  loadError: string | null;
  /** GA/HTML·월간 데이터를 아직 불러오는 중 */
  isInitialLoad?: boolean;
  /** true면 빈 호환 영역만 노출 (호환용) */
  compact?: boolean;
  /** 클릭 시 브라우저 페이지 자체를 새로고침 */
  onRefresh?: () => void;
}) {
  void props.compact;
  const now = new Date();
  const updated = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <div style={row}>
      {props.onRefresh && (
        <button
          type="button"
          className="btn"
          onClick={props.onRefresh}
          title="현재 페이지를 새로고침 합니다"
        >
          새로고침
        </button>
      )}
      {props.isInitialLoad && (
        <span style={{ ...label, color: 'var(--text)' }} aria-live="polite">
          데이터 로드 중…
        </span>
      )}
      <span style={label}>최종 업데이트 {updated}</span>
      {props.usedSample && <span className="tag-warn">샘플 데이터</span>}
      {props.loadError && <span className="tag-warn">{props.loadError}</span>}
    </div>
  );
}
