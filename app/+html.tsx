import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        {/* PWA 메타 태그 */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1B365D" />
        <meta name="application-name" content="거래내역 입력" />

        {/* iOS 홈 화면 지원 */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="거래 내역" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />

        {/* 파비콘 */}
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192x192.png" />

        {/* Pretendard 폰트 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />

        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: `
          html, body { font-family: 'Pretendard Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
          #root, body, html { height: 100%; }
          body { overflow: hidden; }
          #root { display: flex; }
        `}} />
      </head>
      <body>
        {children}

        {/* Service Worker 정리: 기존에 등록된 SW가 있으면 모두 언레지스터 + 캐시 정리 */}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', async function() {
              try {
                // 모든 등록된 SW 언레지스터
                var regs = await navigator.serviceWorker.getRegistrations();
                for (var i = 0; i < regs.length; i++) {
                  await regs[i].unregister();
                  console.log('[PWA] Service Worker 언레지스터 완료');
                }
                // 모든 캐시 삭제
                if (window.caches) {
                  var keys = await caches.keys();
                  for (var j = 0; j < keys.length; j++) {
                    await caches.delete(keys[j]);
                  }
                  console.log('[PWA] 모든 캐시 삭제 완료');
                }
              } catch (err) {
                console.log('[PWA] SW 정리 실패:', err);
              }
            });
          }
        `}} />
      </body>
    </html>
  );
}
