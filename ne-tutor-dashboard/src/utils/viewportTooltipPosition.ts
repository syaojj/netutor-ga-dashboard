/**
 * `position: fixed` 플로팅 툴팁을 포인터 근처에 두되,
 * `visualViewport`(브라우저 가시 영역) 밖으로 나가지 않게 좌표를 보정한다.
 */
export function clampTooltipToViewport(
  el: HTMLElement,
  clientX: number,
  clientY: number,
  options?: { gap?: number; pad?: number },
): { left: number; top: number } {
  const gap = options?.gap ?? 12;
  const pad = options?.pad ?? 8;

  const vv = window.visualViewport;
  const vx = vv?.offsetLeft ?? 0;
  const vy = vv?.offsetTop ?? 0;
  const vw = vv?.width ?? window.innerWidth;
  const vh = vv?.height ?? window.innerHeight;

  const w = el.offsetWidth;
  const h = el.offsetHeight;
  if (w <= 0 || h <= 0) {
    return { left: clientX + gap, top: clientY + gap };
  }

  let left = clientX + gap;
  let top = clientY + gap;

  if (left + w > vx + vw - pad) {
    left = clientX - w - gap;
  }
  if (left < vx + pad) left = vx + pad;
  if (left + w > vx + vw - pad) left = vx + vw - w - pad;

  if (top + h > vy + vh - pad) {
    top = clientY - h - gap;
  }
  if (top < vy + pad) top = vy + pad;
  if (top + h > vy + vh - pad) top = vy + vh - h - pad;

  return { left, top };
}
