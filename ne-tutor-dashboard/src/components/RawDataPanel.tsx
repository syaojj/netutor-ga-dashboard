import { useEffect, useMemo, useState } from 'react';
import type { EbookMonthlyRow, MonthlyByDeviceRow, OrderRecord } from '../types';
import { EBOOK_RAW_KEY, ORDERS_RAW_KEY, RAW_MENU_ITEMS } from '../data/gaSources';

function fmtInt(n: number): string {
  return new Intl.NumberFormat('ko-KR').format(n);
}

const ALL = '전체';

function uniqSorted<T>(arr: T[], cmp?: (a: T, b: T) => number): T[] {
  return [...new Set(arr)].sort(cmp);
}

export function RawDataPanel(props: {
  /** 사이드 메뉴 displayName (예: 'NE Tutor', '문법문제뱅크', 'E-Book', '주문별현황') */
  sourceFile: string;
  monthlyByDevice: MonthlyByDeviceRow[];
  ebookMonthly: EbookMonthlyRow[];
  orders: OrderRecord[];
}) {
  const menu = useMemo(
    () => RAW_MENU_ITEMS.find((m) => m.displayName === props.sourceFile),
    [props.sourceFile],
  );
  const dataService = menu?.dataService ?? props.sourceFile;
  const isOrders = dataService === ORDERS_RAW_KEY;
  const isEbook = dataService === EBOOK_RAW_KEY;
  const isMember = dataService === '통합회원';

  // 필터: 년도(YYYY), 월(1-12), '전체' 옵션 지원
  const [year, setYear] = useState<string>(ALL);
  const [month, setMonth] = useState<string>(ALL);
  // 주문 전용 필터
  const [catSel, setCatSel] = useState<Set<string>>(new Set());
  const [prodSel, setProdSel] = useState<Set<string>>(new Set());

  // 메뉴 변경 시 필터 초기화
  useEffect(() => {
    setYear(ALL);
    setMonth(ALL);
    setCatSel(new Set());
    setProdSel(new Set());
  }, [props.sourceFile]);

  // 서비스별 월간 행
  const serviceRows = useMemo(() => {
    if (isOrders || isEbook) return [];
    return props.monthlyByDevice
      .filter((r) => r.service === dataService)
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [props.monthlyByDevice, dataService, isOrders, isEbook]);

  // E-Book 월별
  const ebookRows = useMemo(() => {
    if (!isEbook) return [];
    return [...props.ebookMonthly].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [props.ebookMonthly, isEbook]);

  // 주문별
  const orderAll = useMemo(() => {
    if (!isOrders) return [];
    return [...props.orders].sort((a, b) => a.orderDate.getTime() - b.orderDate.getTime());
  }, [props.orders, isOrders]);

  // 년도/월 옵션
  const yearOptions = useMemo(() => {
    if (isOrders) {
      return uniqSorted(orderAll.map((o) => String(o.orderDate.getFullYear())));
    }
    if (isEbook) {
      return uniqSorted(ebookRows.map((r) => String(r.year)));
    }
    return uniqSorted(serviceRows.map((r) => r.month.slice(0, 4)));
  }, [isOrders, isEbook, orderAll, ebookRows, serviceRows]);

  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')),
    [],
  );

  // 주문: 카테고리/상품 옵션
  const orderCategoryOptions = useMemo(
    () => uniqSorted(orderAll.map((o) => o.category).filter(Boolean)),
    [orderAll],
  );
  const orderProductOptions = useMemo(
    () => uniqSorted(orderAll.map((o) => o.product).filter(Boolean)),
    [orderAll],
  );

  // 필터 적용된 서비스 행
  const serviceFiltered = useMemo(() => {
    return serviceRows.filter((r) => {
      const [y, m] = r.month.split('-');
      if (year !== ALL && y !== year) return false;
      if (month !== ALL && m !== month) return false;
      return true;
    });
  }, [serviceRows, year, month]);

  // 필터 적용된 E-Book 행
  const ebookFiltered = useMemo(() => {
    return ebookRows.filter((r) => {
      const y = String(r.year);
      const m = String(r.month).padStart(2, '0');
      if (year !== ALL && y !== year) return false;
      if (month !== ALL && m !== month) return false;
      return true;
    });
  }, [ebookRows, year, month]);

  // 필터 적용된 주문 행
  const ordersFiltered = useMemo(() => {
    return orderAll.filter((o) => {
      const y = String(o.orderDate.getFullYear());
      const m = String(o.orderDate.getMonth() + 1).padStart(2, '0');
      if (year !== ALL && y !== year) return false;
      if (month !== ALL && m !== month) return false;
      if (catSel.size > 0 && !catSel.has(o.category)) return false;
      if (prodSel.size > 0 && !prodSel.has(o.product)) return false;
      return true;
    });
  }, [orderAll, year, month, catSel, prodSel]);

  /**
   * 주문 데이터는 상품명 기준으로 그룹핑하여 표시한다.
   * - 같은 상품(예: "(학생용) 격간지 워크부 상권")의 주문은 한 행으로 합산.
   * - 컬럼: 카테고리 | 상품명 | 주문 건수 | 사용자 수(중복 제외).
   */
  const orderGrouped = useMemo(() => {
    if (!isOrders) return [];
    const map = new Map<
      string,
      { product: string; category: string; count: number; users: Set<string> }
    >();
    for (const o of ordersFiltered) {
      const key = o.product || '(상품명 없음)';
      const prev = map.get(key) ?? {
        product: key,
        category: o.category || '',
        count: 0,
        users: new Set<string>(),
      };
      prev.count += 1;
      if (o.userId) prev.users.add(o.userId);
      map.set(key, prev);
    }
    return [...map.values()]
      .map((g) => ({ product: g.product, category: g.category, count: g.count, userCount: g.users.size }))
      .sort((a, b) => b.count - a.count || a.product.localeCompare(b.product));
  }, [ordersFiltered, isOrders]);

  const totalCount = isOrders
    ? orderGrouped.length
    : isEbook
      ? ebookFiltered.length
      : serviceFiltered.length;

  const maxShow = 15000;
  const serviceTrunc = serviceFiltered.length > maxShow;
  const ordersTrunc = orderGrouped.length > maxShow;
  const serviceDisplay = serviceTrunc ? serviceFiltered.slice(0, maxShow) : serviceFiltered;
  const orderDisplay = ordersTrunc ? orderGrouped.slice(0, maxShow) : orderGrouped;

  const toggleSet = (s: Set<string>, v: string): Set<string> => {
    const next = new Set(s);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  return (
    <section className="section raw-data-section">
      <h2 className="section-title">{props.sourceFile}</h2>

      <div className="raw-toolbar card-like" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="raw-toolbar-label">년도</span>
        <select value={year} onChange={(e) => setYear(e.target.value)}>
          <option value={ALL}>{ALL}</option>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <span className="raw-toolbar-label" style={{ marginLeft: 12 }}>
          월
        </span>
        <select value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value={ALL}>{ALL}</option>
          {monthOptions.map((m) => (
            <option key={m} value={m}>
              {Number(m)}월
            </option>
          ))}
        </select>
      </div>

      {isOrders && (
        <div className="raw-toolbar card-like" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <span className="raw-toolbar-label" style={{ minWidth: 70 }}>
              카테고리
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => setCatSel(new Set())}
              title="카테고리 전체 보기"
            >
              전체
            </button>
            {orderCategoryOptions.map((c) => (
              <label key={c} className="raw-checkbox">
                <input
                  type="checkbox"
                  checked={catSel.has(c)}
                  onChange={() => setCatSel((s) => toggleSet(s, c))}
                />
                <span>{c}</span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <span className="raw-toolbar-label" style={{ minWidth: 70 }}>
              상품
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => setProdSel(new Set())}
              title="상품 전체 보기"
            >
              전체
            </button>
            {orderProductOptions.map((p) => (
              <label key={p} className="raw-checkbox">
                <input
                  type="checkbox"
                  checked={prodSel.has(p)}
                  onChange={() => setProdSel((s) => toggleSet(s, p))}
                />
                <span>{p}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '12px 0 8px' }}>
        총 <strong style={{ color: 'var(--text)' }}>{fmtInt(totalCount)}</strong> 건
      </p>

      {!isOrders && !isEbook && !isMember && (
        <div className="table-wrap" style={{ maxHeight: 'min(72vh, 900px)' }}>
          <table className="data">
            <thead>
              <tr>
                <th rowSpan={2}>년/월</th>
                <th colSpan={2}>PC</th>
                <th colSpan={2}>MO</th>
              </tr>
              <tr>
                <th>MAU</th>
                <th>신규사용자</th>
                <th>MAU</th>
                <th>신규사용자</th>
              </tr>
            </thead>
            <tbody>
              {serviceDisplay.map((r) => (
                <tr key={r.month}>
                  <td>{r.month}</td>
                  <td>{fmtInt(r.pcMau)}</td>
                  <td>{fmtInt(r.pcNew)}</td>
                  <td>{fmtInt(r.moMau)}</td>
                  <td>{fmtInt(r.moNew)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {serviceFiltered.length === 0 && (
            <p className="muted-p" style={{ padding: 16 }}>
              선택한 기간에 데이터가 없습니다.
            </p>
          )}
          {serviceTrunc && (
            <p className="muted-p" style={{ padding: 12 }}>
              상위 {maxShow.toLocaleString('ko-KR')}행만 표시했습니다.
            </p>
          )}
        </div>
      )}

      {isMember && (
        <div className="table-wrap" style={{ maxHeight: 'min(72vh, 900px)' }}>
          <table className="data">
            <thead>
              <tr>
                <th>년/월</th>
                <th>PC</th>
                <th>MO</th>
              </tr>
            </thead>
            <tbody>
              {serviceDisplay.map((r) => (
                <tr key={r.month}>
                  <td>{r.month}</td>
                  <td>{fmtInt(r.pcNew)}</td>
                  <td>{fmtInt(r.moNew)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {serviceFiltered.length === 0 && (
            <p className="muted-p" style={{ padding: 16 }}>
              선택한 기간에 데이터가 없습니다.
            </p>
          )}
        </div>
      )}

      {isEbook && (
        <div className="table-wrap" style={{ maxHeight: 'min(72vh, 900px)' }}>
          <table className="data">
            <thead>
              <tr>
                <th>년/월</th>
                <th>클릭수</th>
              </tr>
            </thead>
            <tbody>
              {ebookFiltered.map((r) => (
                <tr key={r.monthKey}>
                  <td>{r.monthKey}</td>
                  <td>{fmtInt(r.clicks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {ebookFiltered.length === 0 && (
            <p className="muted-p" style={{ padding: 16 }}>
              선택한 기간에 E-Book 월별 데이터가 없습니다.
            </p>
          )}
        </div>
      )}

      {isOrders && (
        <div className="table-wrap" style={{ maxHeight: 'min(72vh, 900px)' }}>
          <table className="data">
            <thead>
              <tr>
                <th>카테고리</th>
                <th>상품명</th>
                <th>주문 건수</th>
                <th>사용자 수</th>
              </tr>
            </thead>
            <tbody>
              {orderDisplay.map((g) => (
                <tr key={g.product}>
                  <td style={{ whiteSpace: 'normal', maxWidth: 180 }}>{g.category}</td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 360 }}>{g.product}</td>
                  <td>{fmtInt(g.count)}</td>
                  <td>{fmtInt(g.userCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {orderGrouped.length === 0 && (
            <p className="muted-p" style={{ padding: 16 }}>
              선택한 조건에 주문 데이터가 없습니다.
            </p>
          )}
          {ordersTrunc && (
            <p className="muted-p" style={{ padding: 12 }}>
              상위 {maxShow.toLocaleString('ko-KR')}개 상품만 표시했습니다.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
