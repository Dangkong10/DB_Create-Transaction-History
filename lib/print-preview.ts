/**
 * 프린트 미리보기 모달 유틸리티
 *
 * DOM 기반 풀스크린 오버레이를 생성하고,
 * 수정 가능한 A4 미리보기 + 프린트 기능을 제공합니다.
 */

const MODAL_ID = 'print-preview-modal';

/** 공통 CSS 스타일 */
const BASE_STYLES = `
  /* ===== 모달 오버레이 ===== */
  #${MODAL_ID} {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    z-index: 99999; background: rgba(0,0,0,0.5);
    display: flex; flex-direction: column;
    font-family: 'Pretendard Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  /* ===== 툴바 ===== */
  .ppm-toolbar {
    background: #1B365D; color: #fff; padding: 12px 20px;
    display: flex; align-items: center; justify-content: space-between;
    flex-shrink: 0; gap: 12px;
  }
  .ppm-toolbar-left { display: flex; flex-direction: column; gap: 2px; }
  .ppm-toolbar-title { font-size: 15px; font-weight: 700; }
  .ppm-toolbar-sub { font-size: 12px; opacity: 0.7; }
  .ppm-toolbar-right { display: flex; gap: 8px; align-items: center; }
  .ppm-btn {
    border: none; border-radius: 8px; padding: 10px 20px;
    font-size: 14px; font-weight: 600; cursor: pointer;
    font-family: inherit; transition: opacity 0.15s;
  }
  .ppm-btn:hover { opacity: 0.85; }
  .ppm-btn-close { background: rgba(255,255,255,0.15); color: #fff; }
  .ppm-btn-print { background: #fff; color: #1B365D; }

  /* ===== 안내 바 ===== */
  .ppm-info {
    background: #EDF1F7; text-align: center; padding: 8px 16px;
    font-size: 12px; color: #1B365D; flex-shrink: 0;
  }

  /* ===== 콘텐츠 영역 ===== */
  .ppm-content {
    flex: 1; overflow-y: auto; overflow-x: auto;
    background: #d0d0d0; padding: 24px 16px 60px;
    display: flex; flex-direction: column; align-items: center; gap: 24px;
    -webkit-overflow-scrolling: touch;
  }

  /* ===== A4 페이지 ===== */
  .a4-page {
    width: 210mm; background: #fff; position: relative;
    box-shadow: 0 4px 30px rgba(0,0,0,0.15);
    padding: 12mm 10mm;
  }
  .a4-page.half { min-height: 148.5mm; }
  .a4-page.full { min-height: 297mm; }
  .a4-label {
    position: absolute; top: 4mm; right: 6mm;
    font-size: 10pt; color: #999; font-style: italic;
  }

  /* ===== 수정 가능 셀 ===== */
  [contenteditable="true"] {
    outline: none; cursor: text;
    transition: background 0.15s, box-shadow 0.15s;
  }
  [contenteditable="true"]:hover { background: #fffbe6 !important; }
  [contenteditable="true"]:focus {
    background: #fffbe6 !important;
    box-shadow: 0 0 0 2px #f0c040;
  }

  /* ===== 테이블 공통 ===== */
  .ppm-table { width: 100%; border-collapse: collapse; }
  .ppm-table th, .ppm-table td {
    border: 1px solid #000; padding: 0 4px;
    height: 17pt; line-height: 17pt; font-size: 13pt;
  }
  .ppm-table th {
    background: #e8e8e8; font-weight: 700; text-align: center;
  }

  /* ===== 영수증 테이블 (12pt) ===== */
  .receipt-table { width: 100%; border-collapse: collapse; }
  .receipt-table th, .receipt-table td {
    border: 1px solid #000; padding: 0 2px;
    height: 17pt; line-height: 17pt; font-size: 12pt;
  }
  .rh { text-align: center; font-weight: 800; font-size: 13pt; background: #e8e8e8; }
  .rc { text-align: right; font-weight: 700; }
  .rl { font-weight: 700; background: #f5f5f5; text-align: center; width: 35%; }
  .rv { text-align: center; }
  .ri th { font-weight: 700; background: #f0f0f0; text-align: center; font-size: 11pt; }
  .ri td:nth-child(1) { text-align: left; }
  .ri td:nth-child(2) { text-align: center; }
  .ri td:nth-child(3) { text-align: right; }
  .rt td { font-weight: 800; }
  .rt td:first-child { text-align: left; }
  .rt td:last-child { text-align: right; }

  /* ===== 영수증 2x3 그리드 ===== */
  .r-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
  .r-block { padding: 2.5mm 2mm; border: 0.5px solid #ddd; }
  .empty-slot {
    display: flex; align-items: center; justify-content: center;
    min-height: 60mm; background: #fafafa;
  }
  .empty-slot-inner { text-align: center; color: #ccc; font-size: 11pt; }

  /* ===== 초과 영수증 배치 ===== */
  .over-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
  .over-grid-1 { display: grid; grid-template-columns: 1fr; gap: 4mm; max-width: 50%; }

  /* ===== 페이지 구분선 ===== */
  .page-divider {
    width: 210mm; text-align: center; padding: 10px 0;
    font-size: 13px; color: #fff; border-radius: 8px; font-weight: 700;
  }
  .page-divider.normal { background: #1B365D; }
  .page-divider.over { background: #e67e22; }

  /* ===== 모바일 대응 ===== */
  @media (max-width: 800px) {
    .a4-page { width: 100%; min-height: auto !important; padding: 6mm 4mm; }
    .page-divider { width: 100%; }
    .ppm-table th, .ppm-table td { font-size: 10pt; height: 14pt; line-height: 14pt; }
    .receipt-table th, .receipt-table td { font-size: 9pt; height: 13pt; line-height: 13pt; }
    .over-grid-1 { max-width: 100%; }
  }

  /* ===== 프린트 스타일 ===== */
  @media print {
    body > *:not(#${MODAL_ID}) { display: none !important; }
    #${MODAL_ID} { position: static; background: none; }
    .ppm-toolbar, .ppm-info { display: none !important; }
    .ppm-content {
      padding: 0; overflow: visible; background: #fff;
      display: block;
    }
    .a4-page {
      box-shadow: none; margin: 0; width: 100%;
      page-break-after: always;
    }
    .a4-page:last-child { page-break-after: avoid; }
    .page-divider { display: none !important; }
    [contenteditable] {
      background: transparent !important;
      box-shadow: none !important;
    }
  }
`;

/**
 * 프린트 미리보기 모달 열기
 */
export function openPrintModal(options: {
  title: string;
  subtitle: string;
  contentHtml: string;
}): void {
  closePrintModal();

  const overlay = document.createElement('div');
  overlay.id = MODAL_ID;
  overlay.innerHTML = `
    <style>${BASE_STYLES}</style>
    <div class="ppm-toolbar">
      <div class="ppm-toolbar-left">
        <div class="ppm-toolbar-title">${options.title}</div>
        <div class="ppm-toolbar-sub">${options.subtitle}</div>
      </div>
      <div class="ppm-toolbar-right">
        <button class="ppm-btn ppm-btn-close" id="ppm-close-btn">닫기</button>
        <button class="ppm-btn ppm-btn-print" id="ppm-print-btn">🖨️ 프린트</button>
      </div>
    </div>
    <div class="ppm-info">✏️ 셀을 클릭해 수정 가능</div>
    <div class="ppm-content">${options.contentHtml}</div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  // 이벤트 바인딩
  overlay.querySelector('#ppm-close-btn')?.addEventListener('click', closePrintModal);
  overlay.querySelector('#ppm-print-btn')?.addEventListener('click', () => window.print());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePrintModal();
  });

  // ESC 키로 닫기
  const handleEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { closePrintModal(); document.removeEventListener('keydown', handleEsc); }
  };
  document.addEventListener('keydown', handleEsc);
}

/**
 * 프린트 미리보기 모달 닫기
 */
export function closePrintModal(): void {
  const existing = document.getElementById(MODAL_ID);
  if (existing) {
    existing.remove();
    document.body.style.overflow = '';
  }
}

/**
 * 날짜 포맷: YYYY-MM-DD → YYYY-MM-DD(요일)
 */
export function formatDateWithDay(dateString: string): string {
  try {
    const date = new Date(dateString);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const dayName = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
    return `${y}-${m}-${d}(${dayName})`;
  } catch {
    return dateString;
  }
}

/**
 * 숫자 → 콤마 포맷
 */
export function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR');
}
