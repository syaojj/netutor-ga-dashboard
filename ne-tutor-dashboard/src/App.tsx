import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DailyMetricRow, DeviceFilter, OrderRecord } from './types';
import { buildSampleDaily } from './data/sampleFallback';
import { GA_HTML_SOURCES, ORDERS_XLSX_NAME } from './data/gaSources';
import { ECOSYSTEM_EVENTS } from './data/events';
import { parseHtmlSheets } from './utils/parseHtmlSheets';
import { parseOrdersWorkbook } from './utils/parseOrders';
import {
  aggregateGrammarOrdersByMonth,
  buildCategoryComboSummary,
  buildEventImpactTable,
  buildExecutiveKpis,
  correlationHeatmap,
  dailyToMonthly,
  dailyToYearly,
  filterAndMergeDevice,
  getDataDateBounds,
  grammarTerminationBeforeAfter,
  TREND_SERVICES,
} from './utils/metrics';
import { clampRange, addDays } from './utils/dateUtil';
import { Layout } from './components/Layout';
import { Sidebar } from './components/Sidebar';
import { FiltersBar } from './components/FiltersBar';
import { KpiRow } from './components/KpiRow';
import { TrendChart } from './components/TrendChart';
import { TrendChartYearly } from './components/TrendChartYearly';
import { TrendRangeControls } from './components/TrendRangeControls';
import { EventImpactTable } from './components/EventImpactTable';
import { GrammarSection } from './components/GrammarSection';
import { CorrelationPanel } from './components/CorrelationPanel';
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
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [usedSample, setUsedSample] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceFilter>('all');
  const [rangeStart, setRangeStart] = useState('2024-01-01');
  const [rangeEnd, setRangeEnd] = useState('2026-04-30');
  const [logScale, setLogScale] = useState(true);
  const [showAllImpactRows, setShowAllImpactRows] = useState(false);
  const [mainView, setMainView] = useState<'dashboard' | 'raw'>('dashboard');
  const [activeRawFile, setActiveRawFile] = useState<string>(GA_HTML_SOURCES[0]);
  const [yearRangeStart, setYearRangeStart] = useState('2022-01-01');
  const [yearRangeEnd, setYearRangeEnd] = useState('2026-12-31');
  const [yearLogScale, setYearLogScale] = useState(true);
  const yearBoundsSynced = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const w: string[] = [];
      try {
        const htmlParts = await Promise.all(
          GA_HTML_SOURCES.map(async (name) => {
            const url = `${base}data/${encodeURIComponent(name)}`;
            try {
              const html = await fetchText(url);
              return { name, html };
            } catch {
              w.push(`HTML 로드 실패: ${name}`);
              return null;
            }
          }),
        );
        const valid = htmlParts.filter(Boolean) as { name: string; html: string }[];
        const parsed = parseHtmlSheets(valid);
        w.push(...parsed.warnings);

        let orderList: OrderRecord[] = [];
        try {
          const buf = await fetchBuf(`${base}data/${encodeURIComponent(ORDERS_XLSX_NAME)}`);
          const po = parseOrdersWorkbook(buf);
          orderList = po.orders;
          w.push(...po.warnings);
        } catch {
          w.push('주문 엑셀 로드 실패 — 주문 기반 위젯은 샘플/빈 데이터');
        }

        if (cancelled) return;

        if (!parsed.daily.length) {
          setDailyRaw(buildSampleDaily());
          setUsedSample(true);
          w.push('GA HTML 데이터 없음 — 샘플 데이터로 대체');
        } else {
          setDailyRaw(parsed.daily);
          setUsedSample(false);
        }
        setOrders(orderList);
        setWarnings(w);
        setLoadError(null);
      } catch (e) {
        if (!cancelled) {
          setDailyRaw(buildSampleDaily());
          setOrders([]);
          setUsedSample(true);
          setLoadError(e instanceof Error ? e.message : '로드 오류');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base]);

  const bounds = useMemo(() => getDataDateBounds(dailyRaw), [dailyRaw]);

  useEffect(() => {
    if (yearBoundsSynced.current || dailyRaw.length === 0) return;
    yearBoundsSynced.current = true;
    setYearRangeStart(bounds.min);
    setYearRangeEnd(bounds.max);
  }, [dailyRaw.length, bounds.min, bounds.max]);
  const { start: rs, end: re } = clampRange(rangeStart, rangeEnd, bounds.min, bounds.max);

  const dailyMerged = useMemo(() => filterAndMergeDevice(dailyRaw, device), [dailyRaw, device]);
  const dailyInRange = useMemo(
    () => dailyMerged.filter((r) => r.date >= rs && r.date <= re),
    [dailyMerged, rs, re],
  );
  const monthly = useMemo(() => dailyToMonthly(dailyInRange), [dailyInRange]);

  const { start: yrs, end: yre } = clampRange(yearRangeStart, yearRangeEnd, bounds.min, bounds.max);
  const dailyYearInRange = useMemo(
    () => dailyMerged.filter((r) => r.date >= yrs && r.date <= yre),
    [dailyMerged, yrs, yre],
  );
  const yearly = useMemo(() => dailyToYearly(dailyYearInRange), [dailyYearInRange]);

  const { kpis } = useMemo(() => buildExecutiveKpis(dailyMerged, rs, re), [dailyMerged, rs, re]);
  const impactRows = useMemo(() => buildEventImpactTable(dailyMerged, 30), [dailyMerged]);
  const impactDisplay = useMemo(
    () =>
      showAllImpactRows
        ? impactRows
        : impactRows.filter((r) =>
            ['NE Tutor', '문법문제뱅크', 'NELT'].includes(r.impactedService),
          ),
    [impactRows, showAllImpactRows],
  );
  const grammarBars = useMemo(() => grammarTerminationBeforeAfter(dailyMerged), [dailyMerged]);
  const orderMonthly = useMemo(() => aggregateGrammarOrdersByMonth(orders), [orders]);
  const categoryComboSummary = useMemo(() => buildCategoryComboSummary(orders), [orders]);
  const heatServices = useMemo(
    () => ['NE Tutor', '문법문제뱅크', 'NELT', '교재자료', '클래스카드', '어휘출제마법사'],
    [],
  );
  const heat = useMemo(
    () => correlationHeatmap(monthly, heatServices),
    [monthly, heatServices],
  );

  const applyRange = useCallback(() => {
    const c = clampRange(rangeStart, rangeEnd, bounds.min, bounds.max);
    setRangeStart(c.start);
    setRangeEnd(c.end);
  }, [rangeStart, rangeEnd, bounds.min, bounds.max]);

  const applyPreset = useCallback(
    (key: string) => {
      const end = bounds.max;
      if (key === 'all') {
        setRangeStart(bounds.min);
        setRangeEnd(bounds.max);
        return;
      }
      if (key === '30d') {
        setRangeEnd(end);
        setRangeStart(addDays(end, -29));
        return;
      }
      if (key === '3m') {
        setRangeEnd(end);
        setRangeStart(addDays(end, -89));
        return;
      }
      if (key === '1y') {
        setRangeEnd(end);
        setRangeStart(addDays(end, -364));
        return;
      }
    },
    [bounds],
  );

  const applyYearRange = useCallback(() => {
    const c = clampRange(yearRangeStart, yearRangeEnd, bounds.min, bounds.max);
    setYearRangeStart(c.start);
    setYearRangeEnd(c.end);
  }, [yearRangeStart, yearRangeEnd, bounds.min, bounds.max]);

  const applyYearPreset = useCallback(
    (key: string) => {
      if (key === 'all') {
        setYearRangeStart(bounds.min);
        setYearRangeEnd(bounds.max);
        return;
      }
      const maxY = Number(bounds.max.slice(0, 4));
      const minY = Number(bounds.min.slice(0, 4));
      const spanYears = key === '5y' ? 4 : 2;
      const startY = Math.max(minY, maxY - spanYears);
      setYearRangeStart(`${startY}-01-01`);
      setYearRangeEnd(bounds.max);
    },
    [bounds.min, bounds.max],
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
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onRangeStart={setRangeStart}
          onRangeEnd={setRangeEnd}
          onApply={applyRange}
          onPreset={applyPreset}
          device={device}
          onDevice={setDevice}
          logScale={logScale}
          onLogScale={setLogScale}
          bounds={bounds}
          usedSample={usedSample}
          loadError={loadError}
          compact
        />
      }
    >
      {mainView === 'raw' && (
        <RawDataPanel
          sourceFile={activeRawFile}
          dailyRaw={dailyRaw}
          orders={orders}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onRangeStart={setRangeStart}
          onRangeEnd={setRangeEnd}
          onApplyRange={applyRange}
          bounds={bounds}
          assetBase={base}
        />
      )}

      {mainView === 'dashboard' && (
        <>
      <section id="summary" className="section">
        <h2 className="section-title">Summary</h2>
        <p className="section-desc">
          ※ GA4 일별 데이터 기반 집계이며, Mobile/PC 합산 과정에서 일부 중복 가능성이 있습니다.
          Summary KPI·상관관계 등 대부분의 지표는 아래 <strong>전체 서비스 트렌드 (월별)</strong>에 있는 기간 검색과 같은
          범위를 사용합니다. 디바이스는 화면 상단에서 선택합니다.
          {usedSample && (
            <span className="tag-warn"> 샘플 데이터 표시 중 — public/data 파일을 확인하세요.</span>
          )}
        </p>
        <KpiRow kpis={kpis} />
      </section>

      <section id="trend" className="section">
        <h2 className="section-title">전체 서비스 트렌드 (월별)</h2>
        <p className="section-desc">
          기간·Y축 로그는 이 섹션의 검색 영역에서만 조정합니다. 디바이스는 상단 바에서 선택합니다.
        </p>
        <TrendRangeControls
          title="검색 — 월별 트렌드"
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onRangeStart={setRangeStart}
          onRangeEnd={setRangeEnd}
          onApply={applyRange}
          onPreset={applyPreset}
          logScale={logScale}
          onLogScale={setLogScale}
          bounds={bounds}
          presetMode="monthly"
        />
        <div className="trend-impact-grid">
          <TrendChart
            monthly={monthly}
            rangeStart={rs}
            rangeEnd={re}
            logScale={logScale}
            events={ECOSYSTEM_EVENTS}
            services={[...TREND_SERVICES]}
          />
          <ImpactSummary rows={impactRows.filter((r) => r.impactedService === 'NE Tutor')} />
        </div>
      </section>

      <section id="trend-yearly" className="section">
        <h2 className="section-title">전체 서비스 트렌드 (년간)</h2>
        <p className="section-desc">
          일별 데이터를 연도 단위로 합산한 추세입니다. 월별 차트와 별도의 기간·Y축 설정을 둡니다. 이벤트 말풍선은
          기준일이 속한 연도에 표시됩니다.
        </p>
        <TrendRangeControls
          title="검색 — 년간 트렌드"
          rangeStart={yearRangeStart}
          rangeEnd={yearRangeEnd}
          onRangeStart={setYearRangeStart}
          onRangeEnd={setYearRangeEnd}
          onApply={applyYearRange}
          onPreset={applyYearPreset}
          logScale={yearLogScale}
          onLogScale={setYearLogScale}
          bounds={bounds}
          presetMode="yearly"
        />
        <TrendChartYearly
          yearly={yearly}
          rangeStart={yrs}
          rangeEnd={yre}
          logScale={yearLogScale}
          events={ECOSYSTEM_EVENTS}
          services={[...TREND_SERVICES]}
        />
      </section>

      <section id="impact" className="section">
        <h2 className="section-title">이벤트 영향 분석 (전후 30일)</h2>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={showAllImpactRows}
            onChange={(e) => setShowAllImpactRows(e.target.checked)}
          />
          전체 서비스 행 표시
        </label>
        <EventImpactTable rows={impactDisplay} />
      </section>

      <section id="grammar" className="section">
        <h2 className="section-title">문법문제뱅크 단기 상품 주문 분석</h2>
        <GrammarSection
          beforeAfter={grammarBars}
          orderMonthly={orderMonthly}
          categoryComboSummary={categoryComboSummary}
          hasOrders={orders.length > 0}
        />
      </section>

      <section id="synergy" className="section">
        <h2 className="section-title">서비스 사용 추세 상관관계</h2>
        <p className="section-desc">
          월별 이용(MAU) 그래프가 서로 비슷하게 움직였는지 색으로 보여 줍니다. 같은 사람인지는 알 수 없고, 학기·방학
          같은 <strong>계절</strong>이나 캠페인 영향도 함께 생각해 주세요.
        </p>
        <CorrelationPanel labels={heatServices} z={heat.z} months={heat.months} />
      </section>

        </>
      )}

      {warnings.length > 0 && (
        <footer className="footer-warn">
          <strong>데이터 경고</strong>
          <ul>
            {warnings.slice(0, 12).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {warnings.length > 12 && <li>… 외 {warnings.length - 12}건</li>}
          </ul>
        </footer>
      )}
    </Layout>
  );
}
