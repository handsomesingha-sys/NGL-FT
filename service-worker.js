
"use strict";

/*
 * ============================================================
 * ActiGallery Progressive Web App - Service Worker
 * ============================================================
 *
 * Website:
 *   https://actigallery.online/
 *
 * Repository:
 *   NGL-FT (GitHub Pages)
 *
 * Purpose:
 *   1. Cache selected public application pages.
 *   2. Cache selected public static assets.
 *   3. Use network-first for application page navigation.
 *   4. Provide an offline fallback when a page is unavailable.
 *   5. Keep API requests, uploads, and album images out of cache.
 *
 * Important:
 *   This Service Worker does not make dynamic data or image
 *   uploads work offline.
 *
 * Cache update:
 *   Change CACHE_VERSION when making a new cache strategy or
 *   intentionally replacing the cached application shell.
 * ============================================================
 */

const CACHE_PREFIX = "actigallery-pwa-";
const CACHE_VERSION = "v1";
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

/*
 * Only these page paths are handled as application navigations.
 * The root URL uses the cached index.html as its cache key.
 */

const APP_PAGE_PATHS = new Set([
  "/",
  "/index.html",
  "/dashboard.html"
]);

/*
 * Only these public static files may be cached by the fetch
 * handler. Album photos and arbitrary image URLs are excluded.
 *
 * These paths match the current repository structure described
 * for ActiGallery.
 */

const STATIC_ASSET_PATHS = new Set([
  "/manifest.json",
  "/icon/icon-192.png",
  "/icon/icon-512.png",
  "/favicon.png"
]);

/*
 * Public application files to attempt to cache during install.
 *
 * Each file is handled independently. If an optional file cannot
 * be downloaded, installation is not aborted solely because of
 * that file.
 */

const PRECACHE_PATHS = [
  "/index.html",
  "/dashboard.html",
  "/manifest.json",
  "/icon/icon-192.png",
  "/icon/icon-512.png",
  "/favicon.png"
];

/*
 * Produce a consistent cache key for application pages.
 */

function getPageCacheKey(pathname) {
  if (pathname === "/") {
    return new URL("/index.html", self.location.origin).href;
  }

  return new URL(pathname, self.location.origin).href;
}

/*
 * Produce a cache key for approved static assets.
 * Query strings are not included in the cache key.
 */

function getStaticCacheKey(pathname) {
  return new URL(pathname, self.location.origin).href;
}

/*
 * Build a standalone offline response.
 *
 * This page does not depend on external CSS, JavaScript, fonts,
 * images, APIs, or other network resources.
 */

function createOfflineResponse() {
  const offlineHtml = `<!doctype html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#3867e8">
  <meta name="robots" content="noindex, nofollow">
  <title>ไม่มีการเชื่อมต่ออินเทอร์เน็ต | ActiGallery</title>
  <style>
    :root {
      color-scheme: light;
      font-family:
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
      background: #f7f8fc;
      color: #172033;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      min-height: 100dvh;
      display: grid;
      place-items: center;
      padding: 24px;
    }

    main {
      width: 100%;
      max-width: 420px;
      padding: 30px 24px;
      text-align: center;
      background: #ffffff;
      border: 1px solid #e8ebf3;
      border-radius: 24px;
      box-shadow: 0 12px 36px rgba(23, 32, 51, 0.08);
    }

    .brand {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 64px;
      height: 64px;
      margin-bottom: 16px;
      border-radius: 18px;
      background: #3867e8;
      color: #ffffff;
      font-weight: 800;
      font-size: 19px;
      letter-spacing: -1px;
    }

    h1 {
      margin: 0 0 12px;
      font-size: 24px;
      line-height: 1.4;
    }

    p {
      margin: 0 0 24px;
      color: #667085;
      font-size: 15px;
      line-height: 1.8;
    }

    button {
      width: 100%;
      min-height: 48px;
      border: 0;
      border-radius: 12px;
      background: #3867e8;
      color: #ffffff;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }

    button:focus-visible {
      outline: 3px solid #9db7ff;
      outline-offset: 3px;
    }

    .note {
      display: block;
      margin-top: 18px;
      color: #7d8799;
      font-size: 12px;
      line-height: 1.7;
    }
  </style>
</head>
<body>
  <main>
    <div class="brand" aria-label="ActiGallery">AG</div>
    <h1>ไม่สามารถเชื่อมต่ออินเทอร์เน็ต</h1>
    <p>
      ขณะนี้คุณออฟไลน์ จึงไม่สามารถโหลดข้อมูลคลังภาพ
      หรือใช้งานฟังก์ชันที่ต้องเชื่อมต่อเซิร์ฟเวอร์ได้
    </p>
    <button type="button" id="retryButton">
      ลองเชื่อมต่ออีกครั้ง
    </button>
    <span class="note">
      เมื่ออินเทอร์เน็ตกลับมา โปรดลองโหลดหน้าเว็บใหม่อีกครั้ง
    </span>
  </main>

  <script>
    "use strict";

    document
      .getElementById("retryButton")
      .addEventListener("click", function () {
        window.location.reload();
      });
  </script>
</body>
</html>`;

  return new Response(offlineHtml, {
    status: 503,
    statusText: "Service Unavailable",
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

/*
 * Fetch one file and save it in the current cache.
 *
 * Each file is handled independently. Failed downloads are
 * reported to the console without aborting the entire install.
 */

async function precacheOneFile(pathname, cache) {
  const assetUrl = new URL(pathname, self.location.origin);

  try {
    const request = new Request(assetUrl.href, {
      method: "GET",
      credentials: "same-origin",
      cache: "reload"
    });

    const response = await fetch(request);

    if (!response.ok) {
      console.warn(
        "[ActiGallery PWA] ไม่สามารถแคชไฟล์ได้:",
        pathname,
        "HTTP",
        response.status
      );

      return;
    }

    if (response.type === "opaque") {
      console.warn(
        "[ActiGallery PWA] ข้ามไฟล์ที่มี response แบบ opaque:",
        pathname
      );

      return;
    }

    await cache.put(assetUrl.href, response.clone());

    console.info(
      "[ActiGallery PWA] แคชไฟล์สำเร็จ:",
      pathname
    );
  } catch (error) {
    console.warn(
      "[ActiGallery PWA] การแคชไฟล์ไม่สำเร็จ:",
      pathname,
      error
    );
  }
}

/*
 * INSTALL
 *
 * Create this version of the cache and attempt to cache only
 * the explicitly listed application files.
 */

self.addEventListener("install", function (event) {
  event.waitUntil(
    (async function () {
      const cache = await caches.open(CACHE_NAME);

      await Promise.all(
        PRECACHE_PATHS.map(function (pathname) {
          return precacheOneFile(pathname, cache);
        })
      );

      /*
       * Activate the new worker without waiting for all old
       * controlled pages to close.
       */

      await self.skipWaiting();
    })()
  );
});

/*
 * ACTIVATE
 *
 * Delete only older caches that use this Service Worker's
 * own naming prefix. Other unrelated browser caches are kept.
 */

self.addEventListener("activate", function (event) {
  event.waitUntil(
    (async function () {
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames.map(async function (cacheName) {
          const isOurOldCache =
            cacheName.startsWith(CACHE_PREFIX) &&
            cacheName !== CACHE_NAME;

          if (isOurOldCache) {
            await caches.delete(cacheName);

            console.info(
              "[ActiGallery PWA] ลบแคชเวอร์ชันเก่า:",
              cacheName
            );
          }
        })
      );

      await self.clients.claim();

      console.info(
        "[ActiGallery PWA] Service Worker พร้อมทำงาน:",
        CACHE_VERSION
      );
    })()
  );
});

/*
 * Handle a page navigation using network-first.
 *
 * Online:
 *   Request the latest HTML from the server.
 *   Save successful responses into the application cache.
 *
 * Offline:
 *   Return the cached page if available.
 *   Otherwise show a standalone offline message.
 *
 * Only the explicitly approved application page paths
 * are handled by this function.
 */

async function handlePageNavigation(request, pathname) {
  const cache = await caches.open(CACHE_NAME);
  const cacheKey = getPageCacheKey(pathname);

  try {
    const response = await fetch(request);

    /*
     * For server errors, use a cached page if one exists.
     * Do not replace a legitimate 404 response with an old page.
     */

    if (response.status >= 500) {
      const cachedResponse = await cache.match(cacheKey);

      if (cachedResponse) {
        return cachedResponse;
      }
    }

    /*
     * Cache only successful, non-opaque responses.
     */

    if (response.ok && response.type !== "opaque") {
      try {
        await cache.put(cacheKey, response.clone());
      } catch (cacheError) {
        console.warn(
          "[ActiGallery PWA] ไม่สามารถอัปเดตแคชหน้าเว็บได้:",
          pathname,
          cacheError
        );
      }
    }

    return response;
  } catch (networkError) {
    console.warn(
      "[ActiGallery PWA] เครือข่ายไม่พร้อมสำหรับหน้า:",
      pathname
    );

    const cachedResponse = await cache.match(cacheKey);

    if (cachedResponse) {
      return cachedResponse;
    }

    return createOfflineResponse();
  }
}

/*
 * Handle only the allowlisted public static assets.
 *
 * Network-first ensures an updated manifest or icon can be
 * fetched from the server while online.
 *
 * If the network is unavailable, a cached response is used.
 */

async function handleStaticAsset(request, pathname) {
  const cache = await caches.open(CACHE_NAME);
  const cacheKey = getStaticCacheKey(pathname);

  try {
    const response = await fetch(request);

    if (response.ok && response.type !== "opaque") {
      try {
        await cache.put(cacheKey, response.clone());
      } catch (cacheError) {
        console.warn(
          "[ActiGallery PWA] ไม่สามารถอัปเดตแคชไฟล์สาธารณะได้:",
          pathname,
          cacheError
        );
      }
    }

    return response;
  } catch (networkError) {
    const cachedResponse = await cache.match(cacheKey);

    if (cachedResponse) {
      return cachedResponse;
    }

    /*
     * Do not invent a replacement response for a missing image
     * or manifest. Let the browser handle the failed request.
     */

    return Response.error();
  }
}

/*
 * FETCH
 *
 * Security and compatibility rules:
 *
 * 1. Ignore non-GET requests.
 * 2. Ignore cross-origin requests.
 * 3. Handle only the approved application navigation paths.
 * 4. Handle only explicitly approved public static asset paths.
 * 5. Do not intercept uploads, API calls, or album image URLs.
 * 6. Do not cache arbitrary requests or responses.
 */

self.addEventListener("fetch", function (event) {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  let requestUrl;

  try {
    requestUrl = new URL(request.url);
  } catch (error) {
    return;
  }

  /*
   * This worker must not handle requests to external CDNs,
   * Google Fonts, Apps Script, or other external origins.
   */

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  /*
   * Navigation requests are handled only for the main app pages.
   */

  if (request.mode === "navigate") {
    if (!APP_PAGE_PATHS.has(requestUrl.pathname)) {
      return;
    }

    event.respondWith(
      handlePageNavigation(request, requestUrl.pathname)
    );

    return;
  }

  /*
   * Cache only the exact allowlisted static paths.
   *
   * Requests for uploaded photographs, gallery photos,
   * ZIP downloads, and other dynamic files are not included.
   */

  if (STATIC_ASSET_PATHS.has(requestUrl.pathname)) {
    event.respondWith(
      handleStaticAsset(request, requestUrl.pathname)
    );
  }
});

/*
 * MESSAGE
 *
 * Provide a harmless status response for diagnostic messages.
 * This does not expose private data or change application data.
 */

self.addEventListener("message", function (event) {
  if (!event.data || typeof event.data !== "object") {
    return;
  }

  if (event.data.type === "ACTIGALLERY_PWA_GET_VERSION") {
    const responseMessage = {
      type: "ACTIGALLERY_PWA_VERSION",
      version: CACHE_VERSION
    };

    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage(responseMessage);
      return;
    }

    if (event.source && typeof event.source.postMessage === "function") {
      event.source.postMessage(responseMessage);
    }
  }
});
