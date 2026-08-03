#!/usr/bin/env node
/**
 * 입금자명(payer_names) 일괄 등록 — 초기 데이터 채우기용 일회성 스크립트.
 *
 * 선행 조건:
 *   supabase/migrations/supabase-migration-2026-08-payer-names.sql 을
 *   Supabase SQL Editor 에서 먼저 실행해 둘 것.
 *
 * 사용법 (터미널):
 *   node scripts/register-payer-names.mjs           ← 미리보기만 (아무것도 바꾸지 않음)
 *   node scripts/register-payer-names.mjs --apply   ← 실제 등록
 *
 * 동작:
 *   · 기존 payer_names 를 **덮어쓰지 않고 병합**한다 (이미 있는 이름은 건너뜀).
 *   · 거래처명이 DB 에 없으면 건너뛰고 경고만 남긴다 (임의로 만들지 않는다).
 *   · 기본은 dry-run. --apply 를 줘야 실제로 쓴다.
 *
 * 이후 수정은 앱에서: 관리 탭 → 거래처 목록 → [거래처 설정] → 입금자명
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// ==================== 등록 대상 (2026-08-03 사용자 확정) ====================
// 태흥상회·하나상사는 상호 그대로 입금되므로 등록 불필요 (거래처명과 일치 → 자동 매칭).
// 니터스(윤덕규)·필립섬유(쎄비)는 사용자 요청으로 제외.
const MAPPING = [
  { customer: "대풍",     payers: ["박심순"] },
  { customer: "고려",     payers: ["박태상"] },
  { customer: "실바구니", payers: ["장시경"] },
  { customer: "해비치",   payers: ["유현수"] },
  { customer: "장미모사", payers: ["김채원"] },
  { customer: "뜨개세상", payers: ["김주희"] },
  { customer: "혜원",     payers: ["문명회"] },
  { customer: "삼성토탈", payers: ["박정만"] },
  { customer: "형제",     payers: ["이규녀"] },
  { customer: "영화모사", payers: ["최문자", "영화"] },
];

// ==================== env ====================

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile(path.resolve(projectRoot, ".env.local"));
loadEnvFile(path.resolve(projectRoot, ".env"));

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_ || !ANON) {
  console.error("❌ EXPO_PUBLIC_SUPABASE_URL / ANON_KEY 를 찾을 수 없습니다.");
  process.exit(1);
}

const supabase = createClient(URL_, ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const APPLY = process.argv.includes("--apply");

// ==================== 로그인 입력 ====================

function ask(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(query, (v) => { rl.close(); resolve(v.trim()); });
  });
}

function askHidden(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = (char) => {
      const s = String(char);
      if (s === "\n" || s === "\r" || s === "") { process.stdin.removeListener("data", onData); return; }
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(query + "*".repeat(rl.line.length));
    };
    process.stdin.on("data", onData);
    rl.question(query, (v) => { rl.close(); process.stdout.write("\n"); resolve(v.trim()); });
  });
}

// ==================== main ====================

async function main() {
  console.log(APPLY ? "\n⚠️  실제 등록 모드 (--apply)\n" : "\n🔍 미리보기 모드 — 아무것도 바꾸지 않습니다. 실제 등록은 --apply\n");

  const email = process.env.VERIFY_EMAIL || (await ask("앱 로그인 이메일: "));
  const password = process.env.VERIFY_PASSWORD || (await askHidden("비밀번호 (입력해도 표시되지 않습니다): "));

  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
  if (authErr) { console.error("❌ 로그인 실패:", authErr.message); process.exit(1); }
  const userId = auth.user.id;
  console.log(`\n[등록] 로그인 성공 (user ${userId.slice(0, 8)}…)\n`);

  const { data: customers, error: cErr } = await supabase
    .from("customers").select("id, name, payer_names").eq("user_id", userId);
  if (cErr) {
    console.error("❌ 거래처 조회 실패:", cErr.message);
    if (String(cErr.message).includes("payer_names")) {
      console.error("   → payer_names 컬럼이 없습니다. 마이그레이션을 먼저 실행하세요:");
      console.error("     supabase/migrations/supabase-migration-2026-08-payer-names.sql");
    }
    process.exit(1);
  }

  const byName = new Map((customers ?? []).map((c) => [c.name, c]));
  const plan = [];
  const missing = [];

  for (const { customer, payers } of MAPPING) {
    const rec = byName.get(customer);
    if (!rec) { missing.push(customer); continue; }
    const existing = Array.isArray(rec.payer_names) ? rec.payer_names : [];
    const toAdd = payers.filter((p) => !existing.includes(p));
    if (toAdd.length === 0) {
      console.log(`   ⏭️  ${customer} — 이미 등록됨 [${existing.join(", ")}]`);
      continue;
    }
    plan.push({ id: rec.id, customer, merged: [...existing, ...toAdd], added: toAdd, existing });
  }

  if (missing.length) {
    console.log(`\n⚠️  거래처를 찾지 못해 건너뜁니다 (${missing.length}곳): ${missing.join(", ")}`);
    console.log("   → 거래처명이 정확한지 확인하세요. 임의로 만들지 않습니다.\n");
  }

  if (plan.length === 0) {
    console.log("\n등록할 것이 없습니다.");
    await supabase.auth.signOut();
    return;
  }

  console.log("── 등록 예정 ──");
  for (const p of plan) {
    const before = p.existing.length ? `[${p.existing.join(", ")}] → ` : "";
    console.log(`   ${p.customer.padEnd(10)} ${before}[${p.merged.join(", ")}]   (+${p.added.join(", ")})`);
  }
  console.log("");

  if (!APPLY) {
    console.log("🔍 미리보기였습니다. 실제로 등록하려면:");
    console.log("   node scripts/register-payer-names.mjs --apply\n");
    await supabase.auth.signOut();
    return;
  }

  let ok = 0;
  for (const p of plan) {
    const { error } = await supabase
      .from("customers").update({ payer_names: p.merged }).eq("id", p.id).eq("user_id", userId);
    if (error) console.error(`   ❌ ${p.customer}: ${error.message}`);
    else { console.log(`   ✅ ${p.customer}`); ok++; }
  }

  console.log(`\n═ 완료: ${ok}/${plan.length}건 등록 ═\n`);
  await supabase.auth.signOut();
}

main().catch((err) => { console.error("❌ 예외:", err); process.exit(1); });
