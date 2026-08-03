#!/usr/bin/env node
/**
 * 접미사 정규화 충돌 점검 (읽기 전용 — 아무것도 바꾸지 않음)
 *
 * 은행 입금 문자의 입금자명을 거래처에 매칭할 때, 완전 일치로 못 찾으면
 * 알려진 접미사(모사/섬유/사)만 떼고 비교한다 (고려사→고려, 우진모사→우진, 성남섬유→성남).
 * 이 완화가 오매칭을 일으킬 수 있는 지점을 **켜기 전에** 실측한다.
 *
 * 점검 항목:
 *   A. 접미사를 뗐을 때 서로 같아지는 거래처  → 그 이름으로 입금되면 여러 곳이 걸림
 *   B. 같은 입금자명이 여러 거래처에 등록  → 완전 일치 단계에서 이미 모호
 *   C. 입금자명이 다른 거래처의 이름과 겹침  → 완전 일치 단계에서 모호
 *
 * A/B/C 에 걸리는 건 "자동 처리 안 함"으로 사람에게 넘어가므로 **틀리지는 않는다.**
 * 다만 그런 케이스가 많으면 자동화 효과가 떨어지므로 규모를 미리 본다.
 *
 * 사용법:
 *   node scripts/check-prefix-collisions.mjs
 *   → 거래처 목록을 scripts/_customers.json 으로도 저장한다 (후속 시뮬레이션용).
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

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
if (!URL_ || !ANON) { console.error("❌ Supabase 환경변수를 찾을 수 없습니다."); process.exit(1); }

const supabase = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

function ask(q) {
  return new Promise((r) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (v) => { rl.close(); r(v.trim()); });
  });
}
function askHidden(q) {
  return new Promise((r) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = (c) => {
      const s = String(c);
      if (s === "\n" || s === "\r" || s === "") { process.stdin.removeListener("data", onData); return; }
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(q + "*".repeat(rl.line.length));
    };
    process.stdin.on("data", onData);
    rl.question(q, (v) => { rl.close(); process.stdout.write("\n"); r(v.trim()); });
  });
}

/**
 * 접미사 화이트리스트 — 거래처가 상호에서 흔히 생략하는 꼬리말.
 * 임의 접두사 매칭(고려물산 → 고려)은 하지 않고, **이 목록만** 떼고 비교한다.
 * 긴 것부터 검사해야 "모사"가 "사"보다 먼저 잡힌다.
 */
const SUFFIXES = ["모사", "섬유", "사"];
const MIN_CORE = 2; // 접미사를 뗀 결과가 2자 미만이면 인정하지 않음

/** 끝에 붙은 접미사를 1회 제거. 뗄 게 없거나 너무 짧아지면 원본 그대로. */
function stripSuffix(s) {
  for (const suf of SUFFIXES) {
    if (s.length > suf.length && s.endsWith(suf)) {
      const core = s.slice(0, -suf.length);
      if (core.length >= MIN_CORE) return core;
    }
  }
  return s;
}

async function main() {
  const email = process.env.VERIFY_EMAIL || (await ask("앱 로그인 이메일: "));
  const password = process.env.VERIFY_PASSWORD || (await askHidden("비밀번호 (표시되지 않습니다): "));
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
  if (authErr) { console.error("❌ 로그인 실패:", authErr.message); process.exit(1); }
  const userId = auth.user.id;

  const { data, error } = await supabase
    .from("customers").select("name, payer_names").eq("user_id", userId).order("name");
  if (error) { console.error("❌ 거래처 조회 실패:", error.message); process.exit(1); }

  const customers = (data ?? []).map((c) => ({
    name: c.name,
    payerNames: Array.isArray(c.payer_names) ? c.payer_names : [],
  }));
  console.log(`\n거래처 ${customers.length}곳, 등록된 입금자명 ${customers.reduce((s, c) => s + c.payerNames.length, 0)}개\n`);

  fs.writeFileSync(path.resolve(__dirname, "_customers.json"), JSON.stringify(customers, null, 2), "utf8");

  // ---- A. 접미사를 뗐을 때 서로 같아지는 거래처 쌍 ----
  const coreMap = new Map();
  for (const c of customers) {
    const core = stripSuffix(c.name);
    if (!coreMap.has(core)) coreMap.set(core, []);
    coreMap.get(core).push(c.name);
  }
  const pairs = [...coreMap.entries()].filter(([, names]) => names.length > 1);

  console.log(`── A. 접미사(${SUFFIXES.join(", ")})를 뗐을 때 겹치는 거래처 ──`);
  if (pairs.length === 0) console.log("   ✅ 없음 — 접미사 정규화가 안전합니다\n");
  else {
    console.log(`   ⚠️  ${pairs.length}건 — 이 이름으로 입금되면 자동 처리되지 않고 사람에게 넘어갑니다`);
    for (const [core, names] of pairs) console.log(`      "${core}"  ←  ${names.join(" / ")}`);
    console.log("");
  }

  // ---- A-2. 거래처명 접미사 분포 (다른 접미사도 목록에 넣을지 판단용) ----
  const tailCount = new Map();
  const CANDIDATES = ["모사", "섬유", "상회", "상사", "니트", "실", "사"];
  for (const c of customers) {
    for (const t of CANDIDATES) {
      if (c.name.length > t.length && c.name.endsWith(t)) {
        if (!tailCount.has(t)) tailCount.set(t, []);
        tailCount.get(t).push(c.name);
        break; // 긴 것 우선, 하나만 집계
      }
    }
  }
  console.log("── A-2. 거래처명 꼬리말 분포 (접미사 목록 확장 판단용) ──");
  if (tailCount.size === 0) console.log("   (해당 없음)\n");
  else {
    for (const [t, names] of [...tailCount.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const mark = SUFFIXES.includes(t) ? "✅ 목록에 있음" : "⬜ 목록에 없음";
      console.log(`   "${t}" ${String(names.length).padStart(3)}곳  ${mark}`);
      console.log(`        ${names.slice(0, 8).join(", ")}${names.length > 8 ? ` … 외 ${names.length - 8}곳` : ""}`);
    }
    console.log("");
  }

  // ---- B. 같은 입금자명이 여러 거래처에 ----
  const payerMap = new Map();
  for (const c of customers) for (const p of c.payerNames) {
    if (!payerMap.has(p)) payerMap.set(p, []);
    payerMap.get(p).push(c.name);
  }
  const dupPayers = [...payerMap.entries()].filter(([, v]) => v.length > 1);
  console.log("── B. 같은 입금자명이 여러 거래처에 등록 ──");
  if (dupPayers.length === 0) console.log("   ✅ 없음\n");
  else {
    console.log(`   ⚠️  ${dupPayers.length}건 — 이 이름으로 입금되면 자동 처리되지 않습니다`);
    for (const [p, names] of dupPayers) console.log(`      "${p}" → ${names.join(", ")}`);
    console.log("");
  }

  // ---- C. 입금자명이 다른 거래처의 이름과 겹침 ----
  const nameSet = new Map(customers.map((c) => [c.name, c.name]));
  const cross = [];
  for (const c of customers) for (const p of c.payerNames) {
    if (nameSet.has(p) && nameSet.get(p) !== c.name) cross.push({ payer: p, registeredAt: c.name, alsoCustomer: p });
  }
  console.log("── C. 입금자명이 다른 거래처명과 동일 ──");
  if (cross.length === 0) console.log("   ✅ 없음\n");
  else {
    console.log(`   ⚠️  ${cross.length}건`);
    for (const x of cross) console.log(`      "${x.payer}" — ${x.registeredAt} 의 입금자명인데, 거래처명이기도 함`);
    console.log("");
  }

  console.log("═".repeat(56));
  const risky = pairs.length + dupPayers.length + cross.length;
  if (risky === 0) console.log("✅ 충돌 없음 — 접미사 정규화를 켜도 안전합니다.");
  else console.log(`⚠️  모호 케이스 ${risky}건 — 자동 처리되지 않고 사람에게 넘어갑니다 (틀리게 잡히지는 않음).`);
  console.log("═".repeat(56));
  console.log("\n거래처 목록을 scripts/_customers.json 에 저장했습니다.\n");

  await supabase.auth.signOut();
}

main().catch((e) => { console.error("❌ 예외:", e); process.exit(1); });
