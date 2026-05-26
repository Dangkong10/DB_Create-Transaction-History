/**
 * Custom environment loader.
 *
 * 우선순위(높음 → 낮음):
 *   1. 시스템 환경변수 (이미 process.env에 있는 값)
 *   2. .env.local   — 로컬 개발용 (gitignore됨, 보통 Supabase Dev 키)
 *   3. .env         — 기본값 (gitignore됨, 보통 Supabase Prod 키 / Vercel은 이 파일 안 씀)
 *
 * Vercel 배포에서는 .env 파일이 git에 없으므로 Vercel UI에서 설정한 Env Vars가 사용됨.
 */
const fs = require("fs");
const path = require("path");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const envContent = fs.readFileSync(filePath, "utf8");
  const lines = envContent.split("\n");

  lines.forEach((line) => {
    if (!line || line.trim().startsWith("#")) return;

    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, "");

      // 이미 정의된 값(시스템 env 또는 더 우선순위 높은 파일)은 덮어쓰지 않음
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

// .env.local 먼저 로드(우선) → 그 다음 .env(폴백)
loadEnvFile(path.resolve(process.cwd(), ".env.local"));
loadEnvFile(path.resolve(process.cwd(), ".env"));

// Map system variables to Expo public variables
const mappings = {
  VITE_APP_ID: "EXPO_PUBLIC_APP_ID",
  VITE_SUPABASE_URL: "EXPO_PUBLIC_SUPABASE_URL",
  VITE_SUPABASE_ANON_KEY: "EXPO_PUBLIC_SUPABASE_ANON_KEY",
};

for (const [systemVar, expoVar] of Object.entries(mappings)) {
  if (process.env[systemVar] && !process.env[expoVar]) {
    process.env[expoVar] = process.env[systemVar];
  }
}

// 디버그: 어느 Supabase 프로젝트에 연결되는지 표시 (URL의 host만)
if (process.env.EXPO_PUBLIC_SUPABASE_URL) {
  try {
    const host = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL).host;
    // Vercel 빌드 로그에서도 어느 프로젝트인지 식별 가능
    console.log(`[load-env] Supabase target: ${host}`);
  } catch {
    // ignore malformed URL
  }
}
