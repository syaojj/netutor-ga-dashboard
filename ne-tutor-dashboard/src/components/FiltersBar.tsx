import type { CSSProperties } from 'react';

const row: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  alignItems: 'center',
};

const label: CSSProperties = { fontSize: '0.8rem', color: 'var(--muted)' };

function formatYmdHm(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 빌드 시 주입된 시각(로컬 표시). 개발 서버는 기동 시각에 가깝게 바뀔 수 있음 */
function buildDisplayStamp(): string {
  const raw = typeof __BUILD_STAMP__ !== 'undefined' ? __BUILD_STAMP__ : '';
  const d = raw ? new Date(raw) : new Date();
  return Number.isNaN(d.getTime()) ? formatYmdHm(new Date()) : formatYmdHm(d);
}

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
  const updated = buildDisplayStamp();

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
        <span className="filters-bar-loading" style={{ ...label, color: 'var(--text)' }} aria-live="polite">
          <span className="filters-bar-loading__label">데이터를 불러오는 중</span>
          <span className="filters-bar-loading__dots" aria-hidden>
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </span>
      )}
      <span style={label} title="앱을 빌드한 시각입니다. 소스를 반영하려면 배포 전 `npm run build`를 다시 실행하세요.">
        최종 업데이트 {updated}
      </span>
      {props.usedSample && <span className="tag-warn">샘플 데이터</span>}
      {props.loadError && <span className="tag-warn">{props.loadError}</span>}
    </div>
  );
}
