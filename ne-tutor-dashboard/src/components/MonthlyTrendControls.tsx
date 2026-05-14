import { useMemo, type CSSProperties } from 'react';

const labelSt: CSSProperties = { fontSize: '0.8rem', color: 'var(--muted)' };

const divider: CSSProperties = {
  width: 1,
  alignSelf: 'stretch',
  background: 'var(--border)',
  margin: '0 4px',
};

export type MonthlyPresetKey = '1y' | '2y' | '3y' | 'all';

const PRESETS: { key: MonthlyPresetKey; label: string }[] = [
  { key: '1y', label: '최근 1년' },
  { key: '2y', label: '최근 2년' },
  { key: '3y', label: '최근 3년' },
  { key: 'all', label: '전체 기간' },
];

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

export function MonthlyTrendControls(props: {
  /** PC/Mobile 체크박스 숨김 (숨길 때에도 showPC 등은 더미로 넘겨도 됨) */
  hideDeviceToggles?: boolean;
  /** 표시할 프리셋만 제한 (미지정 시 전체) */
  allowedPresets?: readonly MonthlyPresetKey[];
  /** 프리셋 버튼 문구 덮어쓰기 (예: 전년 동월에서 all → '전체') */
  presetLabelOverrides?: Partial<Record<MonthlyPresetKey, string>>;
  /** 접근성 라벨 */
  ariaLabel?: string;
  /** PC/Mobile 표시 ON/OFF (두 개 모두 OFF는 허용하지 않음) */
  showPC: boolean;
  showMobile: boolean;
  onShowPC: (v: boolean) => void;
  onShowMobile: (v: boolean) => void;
  /** 데이터에 존재하는 연도 옵션 (예: ['2022','2023', ...]) */
  yearOptions: readonly string[];
  /** 시작 년/월 (예: '2022', '01') */
  fromYear: string;
  fromMonth: string;
  /** 종료 년/월 */
  toYear: string;
  toMonth: string;
  onFromYear: (v: string) => void;
  onFromMonth: (v: string) => void;
  onToYear: (v: string) => void;
  onToMonth: (v: string) => void;
  onPreset: (key: MonthlyPresetKey) => void;
  logScale: boolean;
  onLogScale: (v: boolean) => void;
}) {
  const monthOptions = useMemo(() => MONTHS, []);

  const togglePC = (v: boolean) => {
    if (!v && !props.showMobile) return;
    props.onShowPC(v);
  };
  const toggleMobile = (v: boolean) => {
    if (!v && !props.showPC) return;
    props.onShowMobile(v);
  };

  const YearMonth = ({
    year,
    month,
    onYear,
    onMonth,
  }: {
    year: string;
    month: string;
    onYear: (v: string) => void;
    onMonth: (v: string) => void;
  }) => (
    <>
      <select value={year} onChange={(e) => onYear(e.target.value)}>
        {props.yearOptions.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <select value={month} onChange={(e) => onMonth(e.target.value)}>
        {monthOptions.map((m) => (
          <option key={m} value={m}>
            {Number(m)}월
          </option>
        ))}
      </select>
    </>
  );

  const presetButtons = (props.allowedPresets?.length
    ? PRESETS.filter((p) => props.allowedPresets!.includes(p.key))
    : PRESETS
  ).map((p) => (
    <button key={p.key} type="button" className="btn" onClick={() => props.onPreset(p.key)}>
      {props.presetLabelOverrides?.[p.key] ?? p.label}
    </button>
  ));

  return (
    <div className="trend-range-controls" aria-label={props.ariaLabel ?? '월별 구간 검색'}>
      {!props.hideDeviceToggles && (
        <>
          <label style={{ ...labelSt, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={props.showPC}
              onChange={(e) => togglePC(e.target.checked)}
            />
            PC
          </label>
          <label style={{ ...labelSt, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={props.showMobile}
              onChange={(e) => toggleMobile(e.target.checked)}
            />
            Mobile
          </label>

          <span style={divider} />
        </>
      )}

      <span style={labelSt}>기간</span>
      <YearMonth
        year={props.fromYear}
        month={props.fromMonth}
        onYear={props.onFromYear}
        onMonth={props.onFromMonth}
      />
      <span style={{ color: 'var(--muted)' }}>~</span>
      <YearMonth
        year={props.toYear}
        month={props.toMonth}
        onYear={props.onToYear}
        onMonth={props.onToMonth}
      />

      <span style={divider} />

      {presetButtons}

      <span style={divider} />

      <label style={{ ...labelSt, display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={props.logScale}
          onChange={(e) => props.onLogScale(e.target.checked)}
        />
        Y축 로그 스케일
      </label>
    </div>
  );
}
