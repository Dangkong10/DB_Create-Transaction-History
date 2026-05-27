#!/usr/bin/env node
/**
 * Dev Supabase 프로젝트 초기 셋업용 통합 SQL 빌더.
 *
 * 사용법:
 *   node scripts/build-dev-init-sql.mjs
 *
 * 출력:
 *   ./scripts/_generated-dev-init.sql
 *   → Supabase Dashboard → SQL Editor 에 통째로 붙여넣고 Run.
 *
 * 적용 순서 (schema → migrations, 시간순):
 *   1. supabase-schema.sql                                  (베이스 4개 테이블)
 *   2. supabase-migration-2026-04-customers-products.sql    (idempotent, schema와 중복이지만 IF NOT EXISTS로 안전)
 *   3. supabase-migration-2026-04-client-id.sql             (transactions에 client_id 컬럼 추가)
 *   4. supabase-migration-2026-05-payments.sql              (payments 테이블)
 *   5. supabase-migration-2026-05-payments-upsert.sql       (payments 유니크 + RPC)
 *   6. supabase-migration-2026-05-adjustments.sql           (adjustments 테이블)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const migrationsDir = path.join(projectRoot, "supabase", "migrations");

const files = [
  "supabase-schema.sql",
  "supabase-migration-2026-04-customers-products.sql",
  "supabase-migration-2026-04-client-id.sql",
  "supabase-migration-2026-05-payments.sql",
  "supabase-migration-2026-05-payments-upsert.sql",
  "supabase-migration-2026-05-adjustments.sql",
];

const parts = [
  "-- =============================================================================",
  "-- ⚠️  DANGER: 이 SQL은 신규(빈) Supabase 프로젝트 전용입니다.",
  "-- =============================================================================",
  "-- supabase-schema.sql 에 DROP TABLE IF EXISTS 가 포함되어 있어",
  "-- 기존 prod DB 에 실행하면 transactions, customers, products, special_prices,",
  "-- payments, adjustments 데이터가 전부 삭제됩니다.",
  "--",
  "-- 실행 전 반드시 확인:",
  "--   1. Supabase Dashboard 좌상단 프로젝트 셀렉터에서 'Dev' 프로젝트가 선택돼 있는지",
  "--   2. 해당 프로젝트의 Database 탭이 비어 있는지",
  "-- =============================================================================",
  `-- Generated: ${new Date().toISOString()}`,
  "-- =============================================================================",
  "",
];

for (const file of files) {
  const fullPath = path.join(migrationsDir, file);
  if (!fs.existsSync(fullPath)) {
    console.error(`[build-dev-init-sql] MISSING: ${file}`);
    process.exit(1);
  }
  parts.push("");
  parts.push(`-- >>> ${file} <<<`);
  parts.push("");
  parts.push(fs.readFileSync(fullPath, "utf8").trimEnd());
  parts.push("");
}

const outPath = path.join(__dirname, "_generated-dev-init.sql");
fs.writeFileSync(outPath, parts.join("\n"));
console.log(`[build-dev-init-sql] Wrote ${outPath} (${parts.length} blocks, ${files.length} SQL files)`);
console.log(`[build-dev-init-sql] Next: Supabase Dashboard → SQL Editor → 붙여넣기 → Run`);
