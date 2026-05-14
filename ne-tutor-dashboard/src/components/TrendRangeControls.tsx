import type { CSSProperties } from 'react';
import type { DeviceFilter } from '../types';

const row: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  alignItems: 'center',
  marginBottom: 14,
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--panel)',
};

const label: CSSProperties = { fontSize: '0.8rem', color: 'var(--muted)' };

export function TrendRangeControls(props: {
  title: string;
  rangeStart: string;
  rangeEnd: string;
  onRangeStart: (v: string) => void;
  onRangeEnd: (v: string) => void;
  onApply: () => void;
  onPreset: (k: string) => void;
  logScale: boolean;
  onLogScale: (v: boolean) => void;
  bounds: { min: string; max: string };
  /** 월별: 일 단위 프리셋 / 년간: 연 단위 프리셋 */
  presetMode: 'monthly' | 'yearly';
  /** 월별 트렌드에서만 디바이스 선택을 함께 노출 */
  device?: DeviceFilter;
  onDevice?: (d: DeviceFilter) => void;
}) {
  return (
    <div className="trend-range-controls" style={row} aria-label={props.title}>
      <strong style={{ fontSize: '0.85rem', width: '100%', marginBottom: 2 }}>{props.title}</strong>
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

      {props.presetMode === 'monthly' ? (
        <>
          <button type="button" className="btn" onClick={() => props.onPreset('1y')}>
            최근 1년
          </button>
          <button type="button" className="btn" onClick={() => props.onPreset('all')}>
            전체 기간
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn" onClick={() => props.onPreset('3y')}>
            최근 3년
          </button>
          <button type="button" className="btn" onClick={() => props.onPreset('5y')}>
            최근 5년
          </button>
          <button type="button" className="btn" onClick={() => props.onPreset('all')}>
            전체 기간
          </button>
        </>
      )}

      <label style={{ ...label, display: 'flex', gap: 6, alignItems: 'center', marginLeft: 4 }}>
        <input type="checkbox" checked={props.logScale} onChange={(e) => props.onLogScale(e.target.checked)} />
        Y축 로그 스케일
      </label>

      {props.device !== undefined && props.onDevice && (
        <>
          <span style={{ ...label, marginLeft: 8 }}>디바이스</span>
          <select
            value={props.device}
            onChange={(e) => props.onDevice!(e.target.value as DeviceFilter)}
          >
            <option value="all">전체 (Mobile+PC 합산)</option>
            <option value="M">Mobile</option>
            <option value="PC">PC</option>
          </select>
        </>
      )}
    </div>
  );
}
