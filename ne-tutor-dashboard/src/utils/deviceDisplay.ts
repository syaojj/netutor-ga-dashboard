/** 데이터는 `M`으로 유지하고, 화면 표기만 Mobile로 통일 */
export function deviceDisplay(device: 'M' | 'PC'): string {
  return device === 'M' ? 'Mobile' : 'PC';
}
