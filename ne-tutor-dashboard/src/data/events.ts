import type { EcosystemEvent } from '../types';

/** 차트 annotation 및 이벤트 임팩트 분석 기준일 */
export const ECOSYSTEM_EVENTS: EcosystemEvent[] = [
  { id: 'e1', date: '2022-09-29', anchorDate: '2022-09-29', type: 'open', name: '그래몬 온라인 문법 학습' },
  { id: 'e2', date: '2023-01-26', anchorDate: '2023-01-26', type: 'open', name: '학원용 NELT' },
  { id: 'e3', date: '2023-10-17', anchorDate: '2023-10-17', type: 'open', name: '2023 NELT 경진대회' },
  { id: 'e4', date: '2024-02-14', anchorDate: '2024-02-14', type: 'open', name: 'AI 출제 서비스' },
  { id: 'e5', date: '2024-05-16', anchorDate: '2024-05-16', type: 'open', name: '2024 NELT 경진대회' },
  { id: 'e6', date: '2024-09-24', anchorDate: '2024-09-24', type: 'end', name: '독해 문제뱅크 서비스' },
  {
    id: 'e7',
    date: '2024-10-21',
    anchorDate: '2024-10-21',
    type: 'end',
    name: '고등학교 모의평가 변형 문제 & NE능률(김) 교과서 변형 문제',
  },
  { id: 'e8', date: '2024-11-01', anchorDate: '2024-11-01', type: 'end', name: '문뱅 1, 3개월 종료' },
  { id: 'e9', date: '2024-12-12', anchorDate: '2024-12-12', type: 'launch', name: '문법 없는 NELT' },
  { id: 'e10', date: '2025-11-06', anchorDate: '2025-11-06', type: 'end', name: '스마트클래스 어휘, 문법 학습' },
  {
    id: 'e11',
    date: '2025-11-06',
    anchorDate: '2025-11-06',
    type: 'reform',
    name: 'NE Tutor 사이트 개편 / 교재성취Test 오픈',
  },
  { id: 'e12', date: '2026-01-19', anchorDate: '2026-01-19', type: 'end', name: '중학교 교과서 문법 문제' },
  { id: 'e13', date: '2026-03-12', anchorDate: '2026-03-12', type: 'end', name: 'AI 중고등 내신 문제뱅크' },
];
