import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DailyMetricRow,
  DeviceFilter,
  EbookMonthlyRow,
  MonthlyByDeviceRow,
  OrderRecord,
} from './types';
import { buildSampleDaily } from './data/sampleFallback';
import {
  GA_DAILY_WORKBOOK_XLSX_NAME,
  GA_HTML_SOURCES,
  GA_MONTHLY_WORKBOOK_XLSX_NAME,
  ORDERS_XLSX_NAME,
  RAW_MENU_ITEMS,
} from './data/gaSources';
import { ECOSYSTEM_EVENTS } from './data/events';
import { parseHtmlSheets } from './utils/parseHtmlSheets';
import { mergeDailyPreferWorkbook, parseGaWorkbook } from './utils/parseGaWorkbook';
import { parseGaMonthlyWorkbook } from './utils/parseGaMonthlyWorkbook';
import {
  monthlyByDeviceBounds,
  monthlyByDeviceToMonthly,
} from './utils/monthlyTrend';
import { parseOrdersWorkbook } from './utils/parseOrders';
import { getDataDateBounds, TREND_SERVICES } from './utils/metrics';
import { clampRange, addDays } from './utils/dateUtil';
import { Layout } from './components/Layout';
import { Sidebar } from './components/Sidebar';
import { FiltersBar } from './components/FiltersBar';
import { TrendChart } from './components/TrendChart';
import { YoYCompareChartsGrid } from './components/YoYCompareChartsGrid';
import { MonthlyTrendControls, type MonthlyPresetKey } from './components/MonthlyTrendControls';
import { MonthlyTrendSummaryCards } from './components/MonthlyTrendSummaryCards';
import { ImpactSummary } from './components/ImpactSummary';
import { RawDataPanel } from './components/RawDataPanel';

function normalizeAssetBase(baseUrl: string): string {
  if (!baseUrl || baseUrl === '/') return '/';
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

async function fetchText(path: string): Promise<string> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
}

async function fetchBuf(path: string): Promise<ArrayBuffer> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.arrayBuffer();
}

export default function App() {
  const base = normalizeAssetBase(import.meta.env.BASE_URL);
  const [dailyRaw, setDailyRaw] = useState<DailyMetricRow[]>([]);
  const [monthlyByDevice, setMonthlyByDevice] = useState<MonthlyByDeviceRow[]>([]);
  const [ebookMonthly, setEbookMonthly] = useState<EbookMonthlyRow[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [usedSample, setUsedSample] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showPC, setShowPC] = useState(true);
  const [showMobile, setShowMobile] = useState(false);
  const device: DeviceFilter = showPC && showMobile ? 'all' : showPC ? 'PC' : 'M';
  const [rangeStart, setRangeStart] = useState('2024-01-01');
  const [rangeEnd, setRangeEnd] = useState('2026-04-30');
  const [fromYear, setFromYear] = useState<string>('2024');
  const [fromMonth, setFromMonth] = useState<string>('01');
  const [toYear, setToYear] = useState<string>('2026');
  const [toMonth, setToMonth] = useState<string>('04');
  const [logScale, setLogScale] = useState(true);
  const [mainView, setMainView] = useState<'dashboard' | 'raw'>('dashboard');
  const [activeRawFile, setActiveRawFile] = useState<string>(RAW_MENU_ITEMS[0].displayName);
  /** 전년 동기 비교(월 축) 구간 — 월별 섹션과 독립 */
  const [yoyFromYear, setYoyFromYear] = useState<string>('2024');
  const [yoyFromMonth, setYoyFromMonth] = useState<string>('01');
  const [yoyToYear, setYoyToYear] = useState<string>('2026');
  const [yoyToMonth, setYoyToMonth] = useState<string>('04');
  const [yoyRangeStart, setYoyRangeStart] = useState('2024-01-01');
  const [yoyRangeEnd, setYoyRangeEnd] = useState('2026-04-30');
  const [yoyLogScale, setYoyLogScale] = useState(true);
  const boundsSynced = useRef(false);

  const setDevice = useCallback((d: DeviceFilter) => {
    if (d === 'all') {
      setShowPC(true);
      setShowMobile(true);
    } else if (d === 'PC') {
      setShowPC(true);
      setShowMobile(false);
    } else {
      setShowPC(false);
      setShowMobile(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const htmlParts = await Promise.all(
          GA_HTML_SOURCES.map(async (name) => {
            const url = `${base}data/${encodeURIComponent(name)}`;
            try {
              const html = await fetchText(url);
              return { name, html };
            } catch {
              return null;
            }
          }),
        );
        const valid = htmlParts.filter(Boolean) as { name: string; html: string }[];
        const parsedHtml = parseHtmlSheets(valid);

        let fromWorkbook: DailyMetricRow[] = [];
        let parsedEbookMonthly: EbookMonthlyRow[] = [];
        try {
          const gaBuf = await fetchBuf(`${base}data/${encodeURIComponent(GA_DAILY_WORKBOOK_XLSX_NAME)}`);
          const pw = parseGaWorkbook(gaBuf);
          fromWorkbook = pw.daily;
          parsedEbookMonthly = pw.ebookMonthly;
        } catch {
          /* 일별 xlsx 없으면 HTML만 사용 */
        }

        let parsedMonthlyByDevice: MonthlyByDeviceRow[] = [];
        try {
          const monthlyBuf = await fetchBuf(
            `${base}data/${encodeURIComponent(GA_MONTHLY_WORKBOOK_XLSX_NAME)}`,
          );
          const pm = parseGaMonthlyWorkbook(monthlyBuf);
          parsedMonthlyByDevice = pm.monthlyByDevice;
          if (pm.ebookMonthly.length > 0) parsedEbookMonthly = pm.ebookMonthly;
        } catch {
          /* 월간 xlsx 없음 */
        }

        const mergedDaily =
          fromWorkbook.length > 0
            ? mergeDailyPreferWorkbook(fromWorkbook, parsedHtml.daily)
            : parsedHtml.daily;

        let orderList: OrderRecord[] = [];
        try {
          const buf = await fetchBuf(`${base}data/${encodeURIComponent(ORDERS_XLSX_NAME)}`);
          const po = parseOrdersWorkbook(buf);
          orderList = po.orders;
        } catch {
          /* 주문 엑셀 없음 */
        }

        if (cancelled) return;

        if (!mergedDaily.length) {
          setDailyRaw(buildSampleDaily());
          setUsedSample(true);
        } else {
          setDailyRaw(mergedDaily);
          setUsedSample(false);
        }
        setMonthlyByDevice(parsedMonthlyByDevice);
        setOrders(orderList);
        setEbookMonthly(parsedEbookMonthly);
        setLoadError(null);
      } catch (e) {
        if (!cancelled) {
          setDailyRaw(buildSampleDaily());
          setMonthlyByDevice([]);
          setOrders([]);
          setEbookMonthly([]);
          setUsedSample(true);
          setLoadError(e instanceof Error ? e.message : '로드 오류');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base]);

  const bounds = useMemo(() => {
    const monthlyB = monthlyByDeviceBounds(monthlyByDevice);
    const dailyB = getDataDateBounds(dailyRaw);
    if (!monthlyB) return dailyB;
    return {
      min: monthlyB.min < dailyB.min ? monthlyB.min : dailyB.min,
      max: monthlyB.max > dailyB.max ? monthlyB.max : dailyB.max,
    };
  }, [dailyRaw, monthlyByDevice]);

  useEffect(() => {
    if (boundsSynced.current) return;
    if (dailyRaw.length === 0 && monthlyByDevice.length === 0) return;
    boundsSynced.current = true;
    // 월간 차트·전년 동기 비교 기본 기간을 데이터 전체 범위로 동기화
    const minY = bounds.min.slice(0, 4);
    const minM = bounds.min.slice(5, 7);
    const maxY = bounds.max.slice(0, 4);
    const maxM = bounds.max.slice(5, 7);
    setFromYear(minY);
    setFromMonth(minM);
    setToYear(maxY);
    setToMonth(maxM);
    setRangeStart(bounds.min);
    setRangeEnd(bounds.max);
    setYoyFromYear(minY);
    setYoyFromMonth(minM);
    setYoyToYear(maxY);
    setYoyToMonth(maxM);
    setYoyRangeStart(bounds.min);
    setYoyRangeEnd(bounds.max);
  }, [dailyRaw.length, monthlyByDevice.length, bounds.min, bounds.max]);

  // rangeStart/End가 외부(프리셋 등)에 의해 바뀌면 from/to 드롭다운도 함께 동기화
  useEffect(() => {
    if (rangeStart.length >= 10) {
      setFromYear(rangeStart.slice(0, 4));
      setFromMonth(rangeStart.slice(5, 7));
    }
    if (rangeEnd.length >= 10) {
      setToYear(rangeEnd.slice(0, 4));
      setToMonth(rangeEnd.slice(5, 7));
    }
  }, [rangeStart, rangeEnd]);

  // yoyRangeStart/End가 프리셋 등으로 바뀌면 년·월 드롭다운 동기화
  useEffect(() => {
    if (yoyRangeStart.length >= 10) {
      setYoyFromYear(yoyRangeStart.slice(0, 4));
      setYoyFromMonth(yoyRangeStart.slice(5, 7));
    }
    if (yoyRangeEnd.length >= 10) {
      setYoyToYear(yoyRangeEnd.slice(0, 4));
      setYoyToMonth(yoyRangeEnd.slice(5, 7));
    }
  }, [yoyRangeStart, yoyRangeEnd]);

  const { start: rs, end: re } = clampRange(rangeStart, rangeEnd, bounds.min, bounds.max);
  const { start: yoyRs, end: yoyRe } = clampRange(yoyRangeStart, yoyRangeEnd, bounds.min, bounds.max);

  // 월간 트렌드 데이터는 새 월간 xlsx를 1순위 소스로 사용
  const monthly = useMemo(
    () => monthlyByDeviceToMonthly(monthlyByDevice, device),
    [monthlyByDevice, device],
  );

  const applyPreset = useCallback(
    (key: string) => {
      const end = bounds.max;
      const setRange = (offsetDays: number) => {
        setRangeEnd(end);
        setRangeStart(addDays(end, offsetDays));
      };
      if (key === 'all') {
        setRangeStart(bounds.min);
        setRangeEnd(bounds.max);
        return;
      }
      if (key === '30d') return setRange(-29);
      if (key === '3m') return setRange(-89);
      if (key === '1y') return setRange(-364);
      if (key === '2y') return setRange(-729);
      if (key === '3y') return setRange(-1094);
      if (key === '4y') return setRange(-1459);
    },
    [bounds],
  );

  /** 월간 트렌드의 년/월 드롭다운에서 사용할 연도 옵션 */
  const monthlyYearOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of monthlyByDevice) set.add(r.month.slice(0, 4));
    // 데이터가 비어 있어도 최소 4년치 옵션은 노출되도록 fallback
    if (set.size === 0) {
      const now = new Date().getFullYear();
      for (let y = now - 4; y <= now; y++) set.add(String(y));
    }
    return [...set].sort();
  }, [monthlyByDevice]);

  const lastDayOfMonth = useCallback(
    (y: number, m: number): number => new Date(y, m, 0).getDate(),
    [],
  );

  /** 시작/종료 (YYYY,MM) → rangeStart/End 동기화 */
  const applyFromTo = useCallback(
    (fy: string, fm: string, ty: string, tm: string) => {
      // 시작 > 종료면 시작 기준으로 종료를 보정
      let start = `${fy}-${fm}-01`;
      const lastTm = lastDayOfMonth(Number(ty), Number(tm));
      let end = `${ty}-${tm}-${String(lastTm).padStart(2, '0')}`;
      if (start > end) end = start.slice(0, 8) + String(lastDayOfMonth(Number(fy), Number(fm))).padStart(2, '0');
      setRangeStart(start);
      setRangeEnd(end);
    },
    [lastDayOfMonth],
  );

  const onFromYear = useCallback(
    (v: string) => {
      setFromYear(v);
      applyFromTo(v, fromMonth, toYear, toMonth);
    },
    [applyFromTo, fromMonth, toYear, toMonth],
  );
  const onFromMonth = useCallback(
    (v: string) => {
      setFromMonth(v);
      applyFromTo(fromYear, v, toYear, toMonth);
    },
    [applyFromTo, fromYear, toYear, toMonth],
  );
  const onToYear = useCallback(
    (v: string) => {
      setToYear(v);
      applyFromTo(fromYear, fromMonth, v, toMonth);
    },
    [applyFromTo, fromYear, fromMonth, toMonth],
  );
  const onToMonth = useCallback(
    (v: string) => {
      setToMonth(v);
      applyFromTo(fromYear, fromMonth, toYear, v);
    },
    [applyFromTo, fromYear, fromMonth, toYear],
  );

  const applyMonthlyPreset = useCallback(
    (key: MonthlyPresetKey) => {
      applyPreset(key);
    },
    [applyPreset],
  );

  const applyYoyPreset = useCallback(
    (key: MonthlyPresetKey) => {
      const end = bounds.max;
      const setRange = (offsetDays: number) => {
        setYoyRangeEnd(end);
        setYoyRangeStart(addDays(end, offsetDays));
      };
      if (key === 'all') {
        setYoyRangeStart(bounds.min);
        setYoyRangeEnd(bounds.max);
        return;
      }
      if (key === '30d') return setRange(-29);
      if (key === '3m') return setRange(-89);
      if (key === '1y') return setRange(-364);
      if (key === '2y') return setRange(-729);
      if (key === '3y') return setRange(-1094);
      if (key === '4y') return setRange(-1459);
    },
    [bounds],
  );

  /** 전년 동기 비교: 시작/종료 (YYYY,MM) → yoyRange 동기화 */
  const applyYoyFromTo = useCallback(
    (fy: string, fm: string, ty: string, tm: string) => {
      let start = `${fy}-${fm}-01`;
      const lastTm = lastDayOfMonth(Number(ty), Number(tm));
      let end = `${ty}-${tm}-${String(lastTm).padStart(2, '0')}`;
      if (start > end) end = start.slice(0, 8) + String(lastDayOfMonth(Number(fy), Number(fm))).padStart(2, '0');
      setYoyRangeStart(start);
      setYoyRangeEnd(end);
    },
    [lastDayOfMonth],
  );

  const onYoyFromYear = useCallback(
    (v: string) => {
      setYoyFromYear(v);
      applyYoyFromTo(v, yoyFromMonth, yoyToYear, yoyToMonth);
    },
    [applyYoyFromTo, yoyFromMonth, yoyToYear, yoyToMonth],
  );
  const onYoyFromMonth = useCallback(
    (v: string) => {
      setYoyFromMonth(v);
      applyYoyFromTo(yoyFromYear, v, yoyToYear, yoyToMonth);
    },
    [applyYoyFromTo, yoyFromYear, yoyToYear, yoyToMonth],
  );
  const onYoyToYear = useCallback(
    (v: string) => {
      setYoyToYear(v);
      applyYoyFromTo(yoyFromYear, yoyFromMonth, v, yoyToMonth);
    },
    [applyYoyFromTo, yoyFromYear, yoyFromMonth, yoyToMonth],
  );
  const onYoyToMonth = useCallback(
    (v: string) => {
      setYoyToMonth(v);
      applyYoyFromTo(yoyFromYear, yoyFromMonth, yoyToYear, v);
    },
    [applyYoyFromTo, yoyFromYear, yoyFromMonth, yoyToYear],
  );


  return (
    <Layout
      hideTopBar={mainView === 'raw'}
      sidebar={
        <Sidebar
          mainView={mainView}
          activeRawFile={activeRawFile}
          onDashboard={() => setMainView('dashboard')}
          onOpenRaw={(filename) => {
            setActiveRawFile(filename);
            setMainView('raw');
          }}
        />
      }
      filters={
        <FiltersBar
          usedSample={usedSample}
          loadError={loadError}
          onRefresh={() => window.location.reload()}
        />
      }
    >
      {mainView === 'raw' && (
        <RawDataPanel
          sourceFile={activeRawFile}
          monthlyByDevice={monthlyByDevice}
          ebookMonthly={ebookMonthly}
          orders={orders}
        />
      )}

      {mainView === 'dashboard' && (
        <>
      <section id="trend" className="section">
        <h2 className="section-title">월별 데이터 현황</h2>
        <MonthlyTrendControls
          showPC={showPC}
          showMobile={showMobile}
          onShowPC={setShowPC}
          onShowMobile={setShowMobile}
          yearOptions={monthlyYearOptions}
          fromYear={fromYear}
          fromMonth={fromMonth}
          toYear={toYear}
          toMonth={toMonth}
          onFromYear={onFromYear}
          onFromMonth={onFromMonth}
          onToYear={onToYear}
          onToMonth={onToMonth}
          onPreset={applyMonthlyPreset}
          logScale={logScale}
          onLogScale={setLogScale}
        />
        <MonthlyTrendSummaryCards
          monthlyByDevice={monthlyByDevice}
          rangeStart={rs}
          rangeEnd={re}
          showPC={showPC}
          showMobile={showMobile}
        />
        <div className="trend-impact-grid">
          <TrendChart
            monthly={monthly}
            monthlyByDevice={monthlyByDevice}
            rangeStart={rs}
            rangeEnd={re}
            showPC={showPC}
            showMobile={showMobile}
            logScale={logScale}
            events={ECOSYSTEM_EVENTS}
            services={[...TREND_SERVICES]}
          />
          <ImpactSummary monthlyByDevice={monthlyByDevice} events={ECOSYSTEM_EVENTS} />
        </div>
      </section>

      <section id="yoy-compare" className="section">
        <h2 className="section-title">전년 동기 비교</h2>
        <MonthlyTrendControls
          ariaLabel="전년 동기 비교 검색"
          hideDeviceToggles
          allowedPresets={['30d', '3m', '1y', '2y', '3y', '4y']}
          showPC
          showMobile={false}
          onShowPC={() => {}}
          onShowMobile={() => {}}
          yearOptions={monthlyYearOptions}
          fromYear={yoyFromYear}
          fromMonth={yoyFromMonth}
          toYear={yoyToYear}
          toMonth={yoyToMonth}
          onFromYear={onYoyFromYear}
          onFromMonth={onYoyFromMonth}
          onToYear={onYoyToYear}
          onToMonth={onYoyToMonth}
          onPreset={applyYoyPreset}
          logScale={yoyLogScale}
          onLogScale={setYoyLogScale}
        />
        <YoYCompareChartsGrid
          monthlyByDevice={monthlyByDevice}
          rangeStart={yoyRs}
          rangeEnd={yoyRe}
          logScale={yoyLogScale}
        />
      </section>

        </>
      )}
    </Layout>
  );
}
