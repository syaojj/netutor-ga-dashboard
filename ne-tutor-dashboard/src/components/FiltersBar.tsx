import type { DeviceFilter } from '../types';

import type { CSSProperties } from 'react';

const row: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  alignItems: 'center',
  marginTop: 14,
};

const label: CSSProperties = { fontSize: '0.8rem', color: 'var(--muted)' };

export function FiltersBar(props: {
  rangeStart: string;
  rangeEnd: string;
  onRangeStart: (v: string) => void;
  onRangeEnd: (v: string) => void;
  onApply: () => void;
  onPreset: (k: string) => void;
  device: DeviceFilter;
  onDevice: (d: DeviceFilter) => void;
  logScale: boolean;
  onLogScale: (v: boolean) => void;
  bounds: { min: string; max: string };
  usedSample: boolean;
  loadError: string | null;
  /** true면 기간·프리셋·조회·Y축 로그 숨김(트렌드 섹션 전용 컨트롤 사용 시) */
  compact?: boolean;
}) {
  const now = new Date();
  const updated = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <div style={row}>
      {!props.compact && (
        <>
          <span style={label}>기간</span>
          <input
            type="date"
            value={props.rangeStart}
            min={props.bounds.min}
            max={props.bounds.max}
            onChange={(e) => props.onRangeStart(e.target.value)}
          />
          <span style={{ color: 'var(--muted)' }}>~</span>
          <input
            type="date"
            value={props.rangeEnd}
            min={props.bounds.min}
            max={props.bounds.max}
            onChange={(e) => props.onRangeEnd(e.target.value)}
          />
          <button type="button" className="btn primary" onClick={props.onApply}>
            조회
          </button>
          <button type="button" className="btn" onClick={() => props.onPreset('30d')}>
            최근 30일
          </button>
          <button type="button" className="btn" onClick={() => props.onPreset('3m')}>
            최근 3개월
          </button>
          <button type="button" className="btn" onClick={() => props.onPreset('1y')}>
            최근 1년
          </button>
          <button type="button" className="btn" onClick={() => props.onPreset('all')}>
            전체 기간
          </button>
        </>
      )}

      <span style={{ ...label, marginLeft: props.compact ? 0 : 8 }}>디바이스</span>
      <select value={props.device} onChange={(e) => props.onDevice(e.target.value as DeviceFilter)}>
        <option value="all">전체 (Mobile+PC 합산)</option>
        <option value="M">Mobile</option>
        <option value="PC">PC</option>
      </select>

      {!props.compact && (
        <label style={{ ...label, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={props.logScale} onChange={(e) => props.onLogScale(e.target.checked)} />
          Y축 로그 스케일
        </label>
      )}

      <span style={{ ...label, marginLeft: 'auto' }}>최종 업데이트 {updated}</span>
      {props.usedSample && <span className="tag-warn">샘플 데이터</span>}
      {props.loadError && <span className="tag-warn">{props.loadError}</span>}
    </div>
  );
}
