import { useMemo } from 'react';
import type { DailyMetricRow, OrderRecord } from '../types';
import { ORDERS_XLSX_NAME } from '../data/gaSources';
import { clampRange } from '../utils/dateUtil';
import { deviceDisplay } from '../utils/deviceDisplay';

function fmtInt(n: number): string {
  return new Intl.NumberFormat('ko-KR').format(n);
}

function orderDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** GA 시트 값이 비율(0~1)인지 이미 %(>1)인지에 맞춰 % 문자열 */
function formatDauMauPct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const pct = Math.abs(v) > 1 ? v : v * 100;
  return `${pct.toLocaleString('ko-KR', { maximumFractionDigits: 2, minimumFractionDigits: 0 })}%`;
}

export function RawDataPanel(props: {
  /** GA HTML 파일명 또는 주문 엑셀 파일명 */
  sourceFile: string;
  dailyRaw: DailyMetricRow[];
  orders: OrderRecord[];
  rangeStart: string;
  rangeEnd: string;
  onRangeStart: (v: string) => void;
  onRangeEnd: (v: string) => void;
  onApplyRange: () => void;
  bounds: { min: string; max: string };
  assetBase: string;
}) {
  const { start: rs, end: re } = clampRange(
    props.rangeStart,
    props.rangeEnd,
    props.bounds.min,
    props.bounds.max,
  );

  const isOrders = props.sourceFile === ORDERS_XLSX_NAME;

  const gaRows = useMemo(() => {
    if (isOrders) return [];
    return props.dailyRaw
      .filter((r) => r.sourceFile === props.sourceFile && r.date >= rs && r.date <= re)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [props.dailyRaw, props.sourceFile, rs, re, isOrders]);

  const orderRows = useMemo(() => {
    if (!isOrders) return [];
    return props.orders
      .filter((o) => {
        const k = orderDateKey(o.orderDate);
        return k >= rs && k <= re;
      })
      .sort((a, b) => a.orderDate.getTime() - b.orderDate.getTime());
  }, [props.orders, rs, re, isOrders]);

  const dataUrl = `${props.assetBase}data/${encodeURIComponent(props.sourceFile)}`;
  const maxShow = 15000;
  const gaTruncated = gaRows.length > maxShow;
  const orderTruncated = orderRows.length > maxShow;
  const gaDisplay = gaTruncated ? gaRows.slice(0, maxShow) : gaRows;
  const orderDisplay = orderTruncated ? orderRows.slice(0, maxShow) : orderRows;

  return (
    <section className="section raw-data-section">
      <h2 className="section-title">원시 데이터</h2>
      <p className="section-desc">
        시트(파일) 단위 GA4 일별 행 또는 주문 행입니다. 아래 기간을 조정한 뒤 <strong>조회</strong>를 누르면 표가
        갱신됩니다.
      </p>

      <div className="raw-toolbar card-like">
        <span className="raw-toolbar-label">시트 내 기간</span>
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
        <button type="button" className="btn primary" onClick={props.onApplyRange}>
          조회
        </button>
        <a className="btn" href={dataUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto' }}>
          파일 열기 / 다운로드
        </a>
      </div>

      <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '10px 0' }}>
        현재 파일: <strong style={{ color: 'var(--text)' }}>{props.sourceFile}</strong> · 표시 범위 {rs} ~ {re}{' '}
        {isOrders ? `(${fmtInt(orderRows.length)}건)` : `(${fmtInt(gaRows.length)}행)`}
      </p>

      {!isOrders && (
        <div className="table-wrap" style={{ maxHeight: 'min(72vh, 900px)' }}>
          <table className="data">
            <thead>
              <tr>
                <th>날짜</th>
                <th>서비스</th>
                <th>디바이스</th>
                <th>신규 사용자</th>
                <th>활성 사용자</th>
                <th>총 사용자</th>
                <th>조회수</th>
                <th>재방문자 수</th>
                <th>DAU/MAU (%)</th>
              </tr>
            </thead>
            <tbody>
              {gaDisplay.map((r, i) => (
                <tr key={`${r.date}-${i}`}>
                  <td>{r.date}</td>
                  <td>{r.service}</td>
                  <td>{deviceDisplay(r.device)}</td>
                  <td>{fmtInt(r.newUsers)}</td>
                  <td>{fmtInt(r.activeUsers)}</td>
                  <td>{fmtInt(r.totalUsers)}</td>
                  <td>{fmtInt(r.views)}</td>
                  <td>{fmtInt(r.returningUsers)}</td>
                  <td>{formatDauMauPct(r.dauMau)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {gaRows.length === 0 && (
            <p className="muted-p" style={{ padding: 16 }}>
              이 기간·파일에 해당하는 행이 없습니다. 상단 전체 기간 필터와 동일한 값이 적용됩니다.
            </p>
          )}
          {gaTruncated && (
            <p className="muted-p" style={{ padding: 12 }}>
              상위 {maxShow.toLocaleString('ko-KR')}행만 표시했습니다. 기간을 나누어 조회하세요.
            </p>
          )}
        </div>
      )}

      {isOrders && (
        <div className="table-wrap" style={{ maxHeight: 'min(72vh, 900px)' }}>
          <table className="data">
            <thead>
              <tr>
                <th>주문일</th>
                <th>사용자 ID</th>
                <th>카테고리</th>
                <th>상품</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {orderDisplay.map((o, i) => (
                <tr key={`${o.userId}-${o.orderDate.getTime()}-${i}`}>
                  <td>{orderDateKey(o.orderDate)}</td>
                  <td>{o.userId}</td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 160 }}>{o.category}</td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 220 }}>{o.product}</td>
                  <td>{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {orderRows.length === 0 && (
            <p className="muted-p" style={{ padding: 16 }}>
              이 기간에 주문 데이터가 없거나 엑셀을 불러오지 못했습니다.
            </p>
          )}
          {orderTruncated && (
            <p className="muted-p" style={{ padding: 12 }}>
              상위 {maxShow.toLocaleString('ko-KR')}건만 표시했습니다. 기간을 나누어 조회하세요.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
