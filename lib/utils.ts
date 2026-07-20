import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines class names using clsx and tailwind-merge.
 * This ensures Tailwind classes are properly merged without conflicts.
 *
 * Usage:
 * ```tsx
 * cn("px-4 py-2", isActive && "bg-primary", className)
 * ```
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 웹에서 현재 포커스된 요소의 포커스를 뗀다.
 *
 * expo-router Stack 은 화면 전환 시 나가는 화면에 aria-hidden 을 거는데,
 * 방금 누른 버튼이 그 안에서 포커스를 유지하면 브라우저가
 * "Blocked aria-hidden ... descendant retained focus" 접근성 경고를 낸다.
 * 네비게이션(push/back) 직전에 호출해 포커스를 미리 떼서 방지한다.
 * 네이티브(document 없음)에선 아무 것도 하지 않는다.
 */
export function blurActive(): void {
  if (typeof document !== 'undefined') {
    (document.activeElement as HTMLElement | null)?.blur?.();
  }
}
