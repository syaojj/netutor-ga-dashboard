import type { EcosystemEvent } from '../types';

/** 차트 annotation 및 이벤트 임팩트 분석 기준일 (name = 화면 표시용 단축명) */
export const ECOSYSTEM_EVENTS: EcosystemEvent[] = [
  { id: 'e1', date: '2022-09-29', anchorDate: '2022-09-29', type: 'open', name: '그래몬 문법 학습' },
  { id: 'e2', date: '2023-01-26', anchorDate: '2023-01-26', type: 'open', name: '학원용 NELT' },
  { id: 'e3', date: '2023-10-17', anchorDate: '2023-10-17', type: 'open', name: "'23 NELT 경진대회" },
  { id: 'e4', date: '2024-02-14', anchorDate: '2024-02-14', type: 'open', name: 'AI 출제 서비스' },
  { id: 'e5', date: '2024-05-16', anchorDate: '2024-05-16', type: 'open', name: "'24 NELT 경진대회" },
  { id: 'e6', date: '2024-09-24', anchorDate: '2024-09-24', type: 'end', name: '독해 문제뱅크' },
  {
    id: 'e7',
    date: '2024-10-21',
    anchorDate: '2024-10-21',
    type: 'end',
    name: '고등모평&(김)교과서 변형문제',
  },
  { id: 'e8', date: '2024-11-01', anchorDate: '2024-11-01', type: 'end', name: '문뱅 1,3개월' },
  { id: 'e9', date: '2024-12-12', anchorDate: '2024-12-12', type: 'launch', name: '문법없는 NELT' },
  { id: 'e10', date: '2025-11-06', anchorDate: '2025-11-06', type: 'end', name: '스마트클래스 어휘/문법' },
  {
    id: 'e11',
    date: '2025-11-06',
    anchorDate: '2025-11-06',
    type: 'reform',
    name: '사이트 개편/교재성취Test',
  },
  { id: 'e12', date: '2026-01-19', anchorDate: '2026-01-19', type: 'end', name: '중학교과서 문법문제' },
  { id: 'e13', date: '2026-03-12', anchorDate: '2026-03-12', type: 'end', name: 'AI중고등 내신문제뱅크' },
];
