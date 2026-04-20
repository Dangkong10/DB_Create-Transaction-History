# Transaction Record App - Development Changelog

> Full record of all design, feature, and architecture changes made during the development session (2026-04-17).

---

## Table of Contents

1. [Design System Overhaul](#1-design-system-overhaul)
2. [Tab Navigation Redesign](#2-tab-navigation-redesign)
3. [History Page - Table Format](#3-history-page---table-format)
4. [Input Page Redesign](#4-input-page-redesign)
5. [Receipt Page Redesign](#5-receipt-page-redesign)
6. [Manage Page Redesign](#6-manage-page-redesign)
7. [Return (Banpum) UI Overhaul](#7-return-banpum-ui-overhaul)
8. [PWA Conversion](#8-pwa-conversion)
9. [Offline-First with IndexedDB](#9-offline-first-with-indexeddb)
10. [Responsive Max-Width 720px](#10-responsive-max-width-720px)
11. [File Inventory](#11-file-inventory)

---

## 1. Design System Overhaul

### Color Palette (`theme.config.js`)

```js
const themeColors = {
  primary:      { light: '#1a9ca0', dark: '#1a9ca0' },   // teal (was #0a7ea4)
  primaryLight: { light: '#e6f5f5', dark: '#1a3536' },   // NEW
  background:   { light: '#ffffff', dark: '#151718' },
  surface:      { light: '#f5f5f5', dark: '#1e2022' },
  foreground:   { light: '#1a1a1a', dark: '#ECEDEE' },   // was #11181C
  muted:        { light: '#666666', dark: '#9BA1A6' },
  border:       { light: '#e0e0e0', dark: '#334155' },
  success:      { light: '#22C55E', dark: '#4ADE80' },
  warning:      { light: '#F59E0B', dark: '#FBBF24' },
  error:        { light: '#e74c3c', dark: '#F87171' },   // was #EF4444
};
```

### Font (`global.css`)

- Added **Pretendard Variable** web font via CDN
- Applied to `html, body` as primary font family

### Shared Styling Conventions

| Element | Style |
|---------|-------|
| Card radius | `borderRadius: 14` |
| Input radius | `borderRadius: 10-14` |
| Button radius | `borderRadius: 8-10` |
| Shadow (web) | `boxShadow: '0 2px 12px rgba(0,0,0,0.06)'` |
| Page background | `#f5f5f5` (surface) |
| Card background | `#ffffff` |

---

## 2. Tab Navigation Redesign

**File:** `app/(tabs)/_layout.tsx`

| Tab | Title | Icon (SF Symbol) | Material Fallback |
|-----|-------|-------------------|-------------------|
| index | 입력 | `pencil` | `edit` |
| history | 내역 | `clock.fill` | `history` |
| receipt | 영수증 출력 | `printer.fill` | `print` |
| manage | 관리 | `slider.horizontal.3` | `tune` |

Icon size: `24px` for all tabs.

**Icon Mapping** (`components/ui/icon-symbol.tsx`):

```ts
const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "pencil": "edit",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "list.bullet": "list",
  "clock.fill": "history",
  "doc.text": "description",
  "printer.fill": "print",
  "gearshape.fill": "settings",
  "slider.horizontal.3": "tune",
};
```

---

## 3. History Page - Table Format

**File:** `app/(tabs)/history.tsx`

### Table Column Layout

| Column | Width | Alignment | Font |
|--------|-------|-----------|------|
| 시간 | 80px fixed | left | 16px |
| 거래처 | 100px fixed | left | 17px bold |
| 품목 | 150px fixed | left | 16px |
| 수량 | 70px fixed | center | 16px bold, teal |
| 관리 | flex:1 | right | 14px buttons |

- **Table max-width:** 720px, centered with `alignSelf: 'center'`
- **Header:** `#1a1a1a` bg, white text, 15px font
- **Group merging:** Same `customerName + createdAt` share time/customer/action cells
- **Inline edit mode:** teal-light (`#e6f5f5`) background
- **Return badge:** Red `반품` badge when `quantity < 0`
- **Sync pending badge:** Orange `동기화 대기` badge for unsynced items

### Offline-First Data Loading

```
1. Load local IndexedDB data first (instant display)
2. If online → pull from Supabase server, merge with local
3. If offline → show local data + "오프라인 모드" banner with last sync time
```

---

## 4. Input Page Redesign

**File:** `app/(tabs)/index.tsx`

### Layout Structure

```
[로그아웃 영역]               ← full width, outside ResponsiveContainer
[거래내역 입력 (title)]
[SyncStatusBadge]
[거래처와 품목을 입력하세요]
[출고/반품 탭 선택]           ← NEW: replaces old checkbox
[반품 경고 배너]              ← shown only in 반품 mode
─── ScrollView ───
  [거래처 이름 입력]          ← white card, radius 14, shadow
  [품목 목록]
    [품목 N 카드]             ← #f8f9fa bg, radius 14
      [품목명 입력]
      [수량: - [count] +]    ← minus #e0e0e0, plus #1a9ca0
─── Footer (fixed) ───
  [+ 품목 추가]               ← dashed teal border, #e6f5f5 bg
  [수량 0 경고]               ← red, centered
  [저장하기 / 반품 저장하기]   ← full-width, mode-dependent color
```

### Save Flow (Offline-First)

```
Before: 저장 → Supabase 직접 저장
After:  저장 → IndexedDB 즉시 저장 → syncQueue 추가 → 온라인이면 자동 동기화
```

### Return Mode (출고/반품 Tab)

| Mode | Tab Color | Save Button Text | Save Button Color |
|------|-----------|------------------|-------------------|
| 출고 | teal active | 저장하기 | `#1a9ca0` |
| 반품 | red active | 🔄 반품 저장하기 | `#e74c3c` |

- Warning banner appears in 반품 mode: "↩️ 반품 거래를 입력합니다"
- Old checkbox completely removed from footer

### Footer Responsive Padding

```css
/* Web: responsive padding with clamp */
paddingHorizontal: clamp(4px, 3vw, 20px)

/* Native fallback */
paddingHorizontal: 12
```

### Mobile Keyboard Scroll

All `TextInput` fields have `onFocus={handleInputFocus}`:

```ts
const handleInputFocus = (event: any) => {
  if (Platform.OS === 'web') {
    setTimeout(() => {
      event?.target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }, 300);
  }
};
```

---

## 5. Receipt Page Redesign

**File:** `app/(tabs)/receipt.tsx`

- White cards with `borderRadius: 14`, shadow
- Teal action buttons
- Background `#f5f5f5`
- Consistent with design system

---

## 6. Manage Page Redesign

**File:** `app/(tabs)/manage.tsx`

- Tab bar with teal active indicator
- White card layout matching other pages
- Special price modal with updated styling

---

## 7. Return (Banpum) UI Overhaul

### What Changed

| Before | After |
|--------|-------|
| Checkbox + "반품" label in footer | 출고/반품 tab selector at top of page |
| Save button shares row with checkbox (flex 0.3/0.7) | Save button full-width, standalone |
| No visual feedback for return mode | Warning banner + red save button + tab highlight |

### Implementation

```tsx
{/* 출고/반품 탭 — placed after title, before ScrollView */}
<View style={{ flexDirection: 'row', borderRadius: 10, overflow: 'hidden',
  borderWidth: 2, borderColor: isCancellation ? '#e74c3c' : '#e0e0e0' }}>
  <TouchableOpacity /* 출고 tab */> 📦 출고 </TouchableOpacity>
  <TouchableOpacity /* 반품 tab */> ↩️ 반품 </TouchableOpacity>
</View>

{/* Warning banner (반품 mode only) */}
{isCancellation && <View>↩️ 반품 거래를 입력합니다</View>}
```

---

## 8. PWA Conversion

### New Files Created

| File | Purpose |
|------|---------|
| `public/manifest.json` | Web app manifest |
| `public/sw.js` | Service Worker (Network First + cache fallback) |
| `public/icon-192x192.png` | PWA icon (from logo.png) |
| `public/icon-512x512.png` | PWA icon (from logo.png) |
| `app/+html.tsx` | Custom HTML shell with PWA meta tags |

### manifest.json

```json
{
  "name": "거래내역 입력",
  "short_name": "거래 내역",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#ffffff",
  "theme_color": "#1a9ca0",
  "icons": [
    { "src": "/icon-192x192.png", "sizes": "192x192", "purpose": "any maskable" },
    { "src": "/icon-512x512.png", "sizes": "512x512", "purpose": "any maskable" }
  ]
}
```

### +html.tsx Meta Tags

```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#1a9ca0" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="거래 내역" />
<link rel="apple-touch-icon" href="/icon-192x192.png" />
```

### Service Worker Strategy

- **Install:** Pre-cache `/`, `/manifest.json`, icons
- **Fetch:** Network First — try network, cache successful responses, serve from cache on failure
- **Exclusions:** Supabase API requests (`/rest/`, `/auth/`) are never cached

---

## 9. Offline-First with IndexedDB

### Architecture

```
User saves transaction
  → 1) IndexedDB (instant, always succeeds)
  → 2) syncQueue gets "create" entry
  → 3) If online → processSyncQueue() immediately
  → 4) If offline → queue waits → auto-sync on reconnect
```

### New Files

| File | Purpose |
|------|---------|
| `lib/offline-db.ts` | Native IndexedDB wrapper (no external deps) |
| `lib/sync-manager.ts` | Sync queue processor + server pull/merge |
| `hooks/use-sync.ts` | React hook for online/offline + sync status |
| `components/sync-status-badge.tsx` | Visual sync status indicator |

### IndexedDB Schema (`transactionsDB`)

**transactions** store:
```
keyPath: localId (auto-increment)
indexes: serverId, date, syncStatus, createdAt
```

**syncQueue** store:
```
keyPath: id (auto-increment)
indexes: createdAt, localId
```

### LocalTransaction Type

```ts
interface LocalTransaction {
  localId?: number;          // IndexedDB auto-increment PK
  serverId?: string;         // Supabase ID (assigned after sync)
  customerName: string;
  productName: string;
  quantity: number;
  unitPrice?: number;
  date: string;              // YYYY-MM-DD
  createdAt: string;         // YYYY-MM-DD HH:mm:ss
  updatedAt: string;         // ISO 8601 (conflict resolution)
  syncStatus: 'synced' | 'pending' | 'failed';
}
```

### SyncQueueItem Type

```ts
interface SyncQueueItem {
  id?: number;
  action: 'create' | 'update' | 'delete';
  localId?: number;
  serverId?: string;
  data: Omit<LocalTransaction, 'localId' | 'syncStatus'>;
  createdAt: string;
  retryCount: number;        // max 5 retries
}
```

### Sync Status Badge States

| State | Dot Color | Label |
|-------|-----------|-------|
| idle + no pending | (hidden) | — |
| syncing | teal (pulsing) | 동기화 중... |
| offline | orange | 오프라인 — N건 동기화 대기 중 |
| error | red | 동기화 실패 — 재시도 중 |
| idle + complete | green | 동기화 완료 |

### Conflict Resolution

- **Strategy:** Last-Write-Wins using `updatedAt` timestamp
- Server pull compares `updatedAt`: if server is newer, overwrite local
- Synced items missing from server are deleted locally
- Single-user app — no complex merge needed

### Auto-Retry

- `processSyncQueue()` runs on: app start, online event, every 30 seconds
- Failed items retry up to 5 times before marked as `failed`

---

## 10. Responsive Max-Width 720px

### ResponsiveContainer (`components/responsive-container.tsx`)

```tsx
// Default changed from 1200px → 720px
// Added paddingHorizontal: 16
<View
  className={cn("w-full mx-auto", "max-w-[720px]", className)}
  style={[{ paddingHorizontal: 16 }, style]}
>
```

### Affected Pages

All 4 tab pages use `<ResponsiveContainer>`:

| Page | Previous maxWidth | New maxWidth |
|------|-------------------|--------------|
| index.tsx | 1200px (default) | 720px |
| history.tsx | 1200px + table 900px | 720px + table 720px |
| receipt.tsx | 1200px (default) | 720px |
| manage.tsx | 1200px (default) | 720px |

- Tab navigation bar: unchanged (full-width)
- Logout area: unchanged (full-width)

---

## 11. File Inventory

### New Files Created

| Path | Description |
|------|-------------|
| `app/+html.tsx` | Custom HTML shell with PWA tags + Service Worker registration |
| `public/manifest.json` | PWA web app manifest |
| `public/sw.js` | Service Worker |
| `public/icon-192x192.png` | PWA icon 192x192 |
| `public/icon-512x512.png` | PWA icon 512x512 |
| `lib/offline-db.ts` | IndexedDB wrapper (native API, no Dexie) |
| `lib/sync-manager.ts` | Offline sync queue manager |
| `hooks/use-sync.ts` | Online/offline + sync status hook |
| `components/sync-status-badge.tsx` | Sync status badge component |
| `.npmrc` | `node-linker=hoisted` for pnpm compatibility |

### Modified Files

| Path | Changes |
|------|---------|
| `theme.config.js` | New color palette (teal primary, new error/muted) |
| `global.css` | Pretendard font import |
| `lib/_core/theme.ts` | Added `primaryLight`, Pretendard font |
| `components/ui/icon-symbol.tsx` | Added icon mappings |
| `components/responsive-container.tsx` | 720px default, paddingHorizontal 16 |
| `app/(tabs)/_layout.tsx` | New tab icons (pencil, clock.fill, printer.fill, slider) |
| `app/(tabs)/index.tsx` | Full redesign + 출고/반품 tab + offline-first save + sync badge |
| `app/(tabs)/history.tsx` | Table format + fixed columns + offline-first loading + sync badge |
| `app/(tabs)/receipt.tsx` | Full redesign with new design system |
| `app/(tabs)/manage.tsx` | Full redesign with new design system |
| `metro.config.js` | Cleaned up (removed Dexie-related symlink config) |

### Dependencies

| Added | Removed |
|-------|---------|
| (none — IndexedDB is native) | `dexie` (was added then removed) |

### Deployment (Vercel)

| Setting | Value |
|---------|-------|
| Application Preset | Other |
| Build Command | `npx expo export --platform web --output-dir dist` |
| Output Directory | `dist` |
| Install Command | `pnpm install` |
| Env: `EXPO_PUBLIC_SUPABASE_URL` | (from Supabase dashboard) |
| Env: `EXPO_PUBLIC_SUPABASE_ANON_KEY` | (from Supabase dashboard) |
