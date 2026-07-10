/**
 * 알약 토글용 라인(스트로크) 아이콘 — 목업과 동일한 SVG 패스
 * 전부 fill 없음, stroke 전용 (아이콘은 무조건 라인 — 사용자 요구)
 */

import Svg, { Path, Rect, Circle } from "react-native-svg";

const P = { strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };

/** 출고 — 상자에서 나가는 화살표 */
export const ShipIcon = (color: string) => (
  <Svg width={20} height={20} viewBox="0 0 24 24">
    <Path d="M21 8v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8" stroke={color} {...P} />
    <Path d="M7 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" stroke={color} {...P} />
    <Path d="M12 17V11" stroke={color} {...P} />
    <Path d="M9 13.5 12 10.5l3 3" stroke={color} {...P} />
  </Svg>
);

/** 반품 — 되돌아오는 화살표 */
export const ReturnIcon = (color: string) => (
  <Svg width={20} height={20} viewBox="0 0 24 24">
    <Path d="M9 14 4 9l5-5" stroke={color} {...P} />
    <Path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" stroke={color} {...P} />
  </Svg>
);

/** 당일 — 달력에 점 하나 */
export const DayIcon = (color: string) => (
  <Svg width={20} height={20} viewBox="0 0 24 24">
    <Rect x={3} y={5} width={18} height={16} rx={2} stroke={color} {...P} />
    <Path d="M8 3v4M16 3v4M3 10h18" stroke={color} {...P} />
    <Circle cx={12} cy={15.5} r={1.6} stroke={color} {...P} />
  </Svg>
);

/** 기간 — 달력에 범위 바 */
export const RangeIcon = (color: string) => (
  <Svg width={20} height={20} viewBox="0 0 24 24">
    <Rect x={3} y={5} width={18} height={16} rx={2} stroke={color} {...P} />
    <Path d="M8 3v4M16 3v4M3 10h18" stroke={color} {...P} />
    <Path d="M7.5 15.5h9" stroke={color} {...P} />
    <Circle cx={7.5} cy={15.5} r={1.4} stroke={color} {...P} />
    <Circle cx={16.5} cy={15.5} r={1.4} stroke={color} {...P} />
  </Svg>
);
