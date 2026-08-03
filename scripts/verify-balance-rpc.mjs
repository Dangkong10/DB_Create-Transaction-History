#!/usr/bin/env node
/**
 * 잔고 RPC 교체 전 대조 검증 스크립트.
 *
 * lib/payments.ts 의 **현재 JS 계산**과 새로 만든 **RPC 결과**를 거래처별로
 * 1원 단위 비교한다. 불일치 0건을 확인하기 전에는 payments.ts 를 교체하지 않는다.
 *
 * 선행 조건:
 *   supabase/migrations/supabase-migration-2026-08-balance-rpc.sql 을
 *   Supabase SQL Editor 에서 먼저 실행해 둘 것.
 *
 * 사용법 (터미널에서 실행 — Supabase SQL Editor 가 아님):
 *   node scripts/verify-balance-rpc.mjs
 *   → 앱 로그인 이메일/비밀번호를 물어본다 (비밀번호는 화면에 표시되지 않음).
 *     RLS 를 통과해야 데이터를 읽을 수 있어 로그인이 필요하다.
 *     CI 등 자동화에서는 VERIFY_EMAIL / VERIFY_PASSWORD 환경변수로 대체 가능.
 *
 *   특정 날짜만 검사하려면 인자로 전달:
 *   ... node scripts/verify-balance-rpc.mjs 2026-07-31 2026-07-30
 *
 * 검사 항목:
 *   1. outstanding_balances()            ↔ getAllOutstandings()
 *   2. outstanding_balances_as_of(D)     ↔ getPendingCustomersAsOfDate(D)
 *   3. receipt_balances_for_date(D)      ↔ getReceiptBalancesForDate(D)
 *
 * 비교는 **필터/정렬 이전의 raw 계산값**으로 한다.
 * (0/음수 필터와 localeCompare 정렬은 클라이언트 정책이라 계산 정확성과 무관)
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// ==================== env 로드 ====================

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

// ==================== 로그인 정보 입력 ====================
// 환경변수가 있으면 그걸 쓰고(자동화용), 없으면 물어본다.
// 비밀번호는 화면에 표시하지 않고 셸 히스토리에도 남기지 않는다.

function ask(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(query, (v) => {
      rl.close();
      resolve(v.trim());
    });
  });
}

function askHidden(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = (char) => {
      const s = String(char);
      if (s === "\n" || s === "\r" || s === "") {
        process.stdin.removeListener("data", onData);
        return;
      }
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(query + "*".repeat(rl.line.length));
    };
    process.stdin.on("data", onData);
    rl.question(query, (v) => {
      rl.close();
      process.stdout.write("\n");
      resolve(v.trim());
    });
  });
}

async function getCredentials() {
  const email = process.env.VERIFY_EMAIL || (await ask("앱 로그인 이메일: "));
  const password = process.env.VERIFY_PASSWORD || (await askHidden("비밀번호 (입력해도 표시되지 않습니다): "));
  if (!email || !password) {
    console.error("❌ 이메일/비밀번호가 비어 있습니다.");
    process.exit(1);
  }
  return { email, password };
}

// ==================== payments.ts 의 fetchAllRows 재현 ====================

/** lib/payments.ts 와 동일: 1000건씩, 최대 50페이지(=5만 건) */
async function fetchAllRows(buildQuery) {
  const PAGE = 1000;
  const all = [];
  let from = 0;
  let truncated = false;
  for (let i = 0; i < 50; i++) {
    const { data, error } = await buildQuery(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
    if (i === 49) truncated = true; // 상한에 걸렸을 가능성
  }
  return { rows: all, truncated };
}

// ==================== JS 계산 재현 (현재 payments.ts 로직) ====================

async function jsAllOutstandings(userId) {
  const tx = await fetchAllRows((f, t) =>
    supabase.from("transactions").select("customer_name, quantity, unit_price").eq("user_id", userId).range(f, t),
  );
  const pay = await fetchAllRows((f, t) =>
    supabase.from("payments").select("customer_name, amount").eq("user_id", userId).range(f, t),
  );
  const adj = await fetchAllRows((f, t) =>
    supabase.from("adjustments").select("customer_name, amount").eq("user_id", userId).range(f, t),
  );

  const map = new Map();
  for (const r of tx.rows) {
    const amount = (r.quantity ?? 0) * (r.unit_price ?? 0);
    map.set(r.customer_name, (map.get(r.customer_name) ?? 0) + amount);
  }
  for (const r of pay.rows) map.set(r.customer_name, (map.get(r.customer_name) ?? 0) - (r.amount ?? 0));
  for (const r of adj.rows) map.set(r.customer_name, (map.get(r.customer_name) ?? 0) + (r.amount ?? 0));
  return { map, truncated: tx.truncated || pay.truncated || adj.truncated, counts: { tx: tx.rows.length, pay: pay.rows.length, adj: adj.rows.length } };
}

async function jsOutstandingsAsOf(userId, date) {
  const tx = await fetchAllRows((f, t) =>
    supabase.from("transactions").select("customer_name, quantity, unit_price").eq("user_id", userId).lte("date", date).range(f, t),
  );
  const pay = await fetchAllRows((f, t) =>
    supabase.from("payments").select("customer_name, amount").eq("user_id", userId).lte("payment_date", date).range(f, t),
  );
  const adj = await fetchAllRows((f, t) =>
    supabase.from("adjustments").select("customer_name, amount").eq("user_id", userId).lte("adjustment_date", date).range(f, t),
  );

  const map = new Map();
  for (const r of tx.rows) {
    const amount = (r.quantity ?? 0) * (r.unit_price ?? 0);
    map.set(r.customer_name, (map.get(r.customer_name) ?? 0) + amount);
  }
  for (const r of pay.rows) map.set(r.customer_name, (map.get(r.customer_name) ?? 0) - (r.amount ?? 0));
  for (const r of adj.rows) map.set(r.customer_name, (map.get(r.customer_name) ?? 0) + (r.amount ?? 0));
  return map;
}

async function jsReceiptBalances(userId, date) {
  const tx = await fetchAllRows((f, t) =>
    supabase.from("transactions").select("customer_name, quantity, unit_price, date").eq("user_id", userId).lte("date", date).range(f, t),
  );
  const pay = await fetchAllRows((f, t) =>
    supabase.from("payments").select("customer_name, amount, payment_date").eq("user_id", userId).lte("payment_date", date).range(f, t),
  );
  const adj = await fetchAllRows((f, t) =>
    supabase.from("adjustments").select("customer_name, amount, adjustment_date").eq("user_id", userId).lte("adjustment_date", date).range(f, t),
  );

  const result = new Map();
  const getOrInit = (name) => {
    let r = result.get(name);
    if (!r) {
      r = { previousBalance: 0, dailyRevenue: 0, dailyPayment: 0 };
      result.set(name, r);
    }
    return r;
  };

  for (const r of tx.rows) {
    const amount = (r.quantity ?? 0) * (r.unit_price ?? 0);
    const e = getOrInit(r.customer_name);
    if (r.date < date) e.previousBalance += amount;
    else if (r.date === date) e.dailyRevenue += amount;
  }
  for (const r of pay.rows) {
    const e = getOrInit(r.customer_name);
    const amt = r.amount ?? 0;
    if (r.payment_date < date) e.previousBalance -= amt;
    else if (r.payment_date === date) e.dailyPayment += amt;
  }
  for (const r of adj.rows) {
    getOrInit(r.customer_name).previousBalance += r.amount ?? 0;
  }
  return result;
}

// ==================== 비교 ====================

let totalMismatch = 0;

function compareMaps(label, jsMap, rpcMap, fields) {
  const names = new Set([...jsMap.keys(), ...rpcMap.keys()]);
  const bad = [];
  for (const name of names) {
    const a = jsMap.get(name);
    const b = rpcMap.get(name);
    for (const f of fields) {
      const av = (typeof a === "object" && a !== null ? a[f] : a) ?? 0;
      const bv = (typeof b === "object" && b !== null ? b[f] : b) ?? 0;
      if (Number(av) !== Number(bv)) {
        bad.push({ name, field: f ?? "balance", js: Number(av), rpc: Number(bv), diff: Number(bv) - Number(av) });
      }
    }
  }
  totalMismatch += bad.length;
  if (bad.length === 0) {
    console.log(`   ✅ ${label} — 거래처 ${names.size}곳, 불일치 0건`);
  } else {
    console.log(`   ❌ ${label} — 거래처 ${names.size}곳, 불일치 ${bad.length}건`);
    for (const b of bad.slice(0, 15)) {
      console.log(`      · ${b.name} [${b.field}] JS=${b.js.toLocaleString()} RPC=${b.rpc.toLocaleString()} 차액=${b.diff.toLocaleString()}`);
    }
    if (bad.length > 15) console.log(`      … 외 ${bad.length - 15}건`);
  }
}

// ==================== main ====================

async function main() {
  console.log(`[verify] Supabase: ${new NodeURL(URL_).host}\n`);

  const { email, password } = await getCredentials();
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
  if (authErr) {
    console.error("❌ 로그인 실패:", authErr.message);
    process.exit(1);
  }
  const userId = auth.user.id;
  console.log(`[verify] 로그인 성공 (user ${userId.slice(0, 8)}…)\n`);

  // ---- 현재 데이터 규모 ----
  const counts = {};
  for (const t of ["transactions", "payments", "adjustments"]) {
    const { count } = await supabase.from(t).select("*", { count: "exact", head: true }).eq("user_id", userId);
    counts[t] = count ?? 0;
  }
  console.log("── 현재 데이터 규모 ──");
  console.log(`   transactions ${counts.transactions.toLocaleString()}건  (5만 건 상한까지 ${(50000 - counts.transactions).toLocaleString()}건 남음)`);
  console.log(`   payments     ${counts.payments.toLocaleString()}건`);
  console.log(`   adjustments  ${counts.adjustments.toLocaleString()}건\n`);

  // ---- 검사 날짜 선정 ----
  let dates = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

  if (dates.length === 0) {
    const set = new Set();
    const today = new Date();
    const toStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    set.add(toStr(today));
    const y = new Date(today); y.setDate(y.getDate() - 1); set.add(toStr(y));

    // 반품(음수 수량) 있는 날짜 — 반드시 포함해야 하는 케이스
    const { data: refundRows } = await supabase
      .from("transactions").select("date").eq("user_id", userId).lt("quantity", 0)
      .order("date", { ascending: false }).limit(300);
    const refundDates = [...new Set((refundRows ?? []).map((r) => r.date))];
    refundDates.slice(0, 5).forEach((d) => set.add(d));
    console.log(`── 반품(음수 수량) 있는 날짜: ${refundDates.length}일 발견 ${refundDates.length ? `(상위 ${Math.min(5, refundDates.length)}일 검사에 포함)` : "— ⚠️ 반품 케이스를 검증하지 못함"} ──\n`);

    // 최근 거래일 몇 개
    const { data: recent } = await supabase
      .from("transactions").select("date").eq("user_id", userId)
      .order("date", { ascending: false }).limit(500);
    [...new Set((recent ?? []).map((r) => r.date))].slice(0, 5).forEach((d) => set.add(d));

    dates = [...set].sort().reverse();
  }

  console.log(`── 검사 날짜 ${dates.length}일: ${dates.join(", ")} ──\n`);

  // ---- 1. 전체 미수금 (날짜 무관) ----
  console.log("[1] outstanding_balances() ↔ getAllOutstandings()");
  const js1 = await jsAllOutstandings(userId);
  if (js1.truncated) {
    console.log("   ⚠️ 경고: JS 계산이 5만 건 상한에 걸렸을 수 있습니다 (이미 잘린 데이터일 가능성)");
  }
  const { data: rpc1, error: e1 } = await supabase.rpc("outstanding_balances");
  if (e1) { console.error("   ❌ RPC 실패:", e1.message); process.exit(1); }
  compareMaps("전체 미수금", js1.map, new Map((rpc1 ?? []).map((r) => [r.customer_name, Number(r.balance)])), [null]);
  console.log("");

  // ---- 2 & 3. 날짜별 ----
  for (const d of dates) {
    console.log(`[날짜 ${d}]`);

    const js2 = await jsOutstandingsAsOf(userId, d);
    const { data: rpc2, error: e2 } = await supabase.rpc("outstanding_balances_as_of", { p_date: d });
    if (e2) { console.error("   ❌ outstanding_balances_as_of 실패:", e2.message); process.exit(1); }
    compareMaps("D시점 누적 미수금", js2, new Map((rpc2 ?? []).map((r) => [r.customer_name, Number(r.balance)])), [null]);

    const js3 = await jsReceiptBalances(userId, d);
    const { data: rpc3, error: e3 } = await supabase.rpc("receipt_balances_for_date", { p_date: d });
    if (e3) { console.error("   ❌ receipt_balances_for_date 실패:", e3.message); process.exit(1); }
    const rpc3Map = new Map(
      (rpc3 ?? []).map((r) => [r.customer_name, {
        previousBalance: Number(r.previous_balance),
        dailyRevenue: Number(r.daily_revenue),
        dailyPayment: Number(r.daily_payment),
      }]),
    );
    compareMaps("영수증 잔고", js3, rpc3Map, ["previousBalance", "dailyRevenue", "dailyPayment"]);
    console.log("");
  }

  // ---- 결과 ----
  console.log("═".repeat(60));
  if (totalMismatch === 0) {
    console.log("✅ 불일치 0건 — payments.ts 교체를 진행해도 안전합니다.");
  } else {
    console.log(`❌ 불일치 총 ${totalMismatch}건 — 교체하지 마세요. RPC 로직을 먼저 수정해야 합니다.`);
  }
  console.log("═".repeat(60));

  await supabase.auth.signOut();
  process.exit(totalMismatch === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("❌ 예외:", err);
  process.exit(1);
});
