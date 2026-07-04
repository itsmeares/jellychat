let injectedScriptSrc = "";
let cachedAssetBasePath = "";
let cachedAssetBasePathSource = "";
let cachedAssetBasePathError: string | null = null;

function normalizeBasePath(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed || trimmed === "/") {
    return "";
  }

  return trimmed.charAt(0) === "/" ? trimmed : "/" + trimmed;
}

function findInjectedScriptSrc(): string {
  if (injectedScriptSrc) {
    return injectedScriptSrc;
  }

  const script = document.querySelector<HTMLScriptElement>('script[data-jellychat-script="true"], script[src*="/JellyChat/Assets/jellychat.js"]');
  injectedScriptSrc = script?.src || "";
  return injectedScriptSrc;
}

export function recordInjectedAssetSource(scriptSrc: string): void {
  injectedScriptSrc = scriptSrc || findInjectedScriptSrc();
  cachedAssetBasePath = resolveAssetBasePath(injectedScriptSrc);
  updateAssetDebug();
}

export function resolveAssetBasePath(scriptSrc = findInjectedScriptSrc()): string {
  if (!scriptSrc) {
    cachedAssetBasePathSource = cachedAssetBasePath ? "cached" : "missing-script";
    cachedAssetBasePathError = cachedAssetBasePath ? null : "JellyChat injected script URL not found.";
    updateAssetDebug();
    return cachedAssetBasePath;
  }

  try {
    const url = new URL(scriptSrc, window.location.href);
    const pathname = url.pathname || "";
    const marker = "/jellychat/assets/";
    const markerIndex = pathname.toLowerCase().indexOf(marker);
    if (markerIndex < 0) {
      cachedAssetBasePathSource = cachedAssetBasePath ? "cached" : "marker-missing";
      cachedAssetBasePathError = "JellyChat asset marker not found in injected script URL.";
      updateAssetDebug();
      return cachedAssetBasePath;
    }

    cachedAssetBasePath = normalizeBasePath(pathname.slice(0, markerIndex));
    cachedAssetBasePathSource = "injected-script-url";
    cachedAssetBasePathError = null;
    updateAssetDebug();
    return cachedAssetBasePath;
  } catch (err) {
    cachedAssetBasePathSource = cachedAssetBasePath ? "cached" : "invalid-script-url";
    cachedAssetBasePathError = summarizeUrlError(err);
    updateAssetDebug();
    return cachedAssetBasePath;
  }
}

export function getAssetBasePath(): string {
  if (!cachedAssetBasePath) {
    cachedAssetBasePath = resolveAssetBasePath();
  }

  return cachedAssetBasePath;
}

export function getInjectedAssetBaseUrl(): string {
  return getAssetBasePath() + "/JellyChat/Assets";
}

function summarizeUrlError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error || "Unknown URL error");
}

function urlPathForDebug(url: string): string {
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}

function updateAssetDebug(): void {
  if (!window.JellyChatDebug) {
    return;
  }

  window.JellyChatDebug.injectedScriptSrc = injectedScriptSrc;
  window.JellyChatDebug.assetBasePath = cachedAssetBasePath;
  window.JellyChatDebug.assetBasePathSource = cachedAssetBasePathSource;
  window.JellyChatDebug.assetBasePathError = cachedAssetBasePathError;
  window.JellyChatDebug.injectedAssetBaseUrl = cachedAssetBasePath + "/JellyChat/Assets";
}

function recordApiUrl(path: string, url: string, source: string, error: string | null): void {
  if (!window.JellyChatDebug) {
    return;
  }

  window.JellyChatDebug.lastApiPath = path;
  window.JellyChatDebug.lastApiUrlPath = urlPathForDebug(url);
  window.JellyChatDebug.lastApiUrlSource = source;
  window.JellyChatDebug.lastApiUrlError = error;
}

export function recordApiRequestDebug(method: string, path: string, url: string): void {
  if (!window.JellyChatDebug) {
    return;
  }

  window.JellyChatDebug.lastApiMethod = method;
  window.JellyChatDebug.lastApiPath = path;
  window.JellyChatDebug.lastApiUrlPath = urlPathForDebug(url);
  window.JellyChatDebug.lastApiStatus = null;
  window.JellyChatDebug.lastApiError = null;
}

export function recordApiResultDebug(method: string, path: string, url: string, status: number | null, error: unknown = null): void {
  if (!window.JellyChatDebug) {
    return;
  }

  window.JellyChatDebug.lastApiMethod = method;
  window.JellyChatDebug.lastApiPath = path;
  window.JellyChatDebug.lastApiUrlPath = urlPathForDebug(url);
  window.JellyChatDebug.lastApiStatus = status;
  window.JellyChatDebug.lastApiError = error ? summarizeUrlError(error) : null;
}

export function resolveJellyfinUrl(path: string): string {
  const normalizedPath = path.charAt(0) === "/" ? path.slice(1) : path;
  if (/^https?:\/\//i.test(normalizedPath)) {
    recordApiUrl(normalizedPath, normalizedPath, "absolute-url", null);
    return normalizedPath;
  }

  if (window.ApiClient && typeof window.ApiClient.getUrl === "function") {
    try {
      const url = window.ApiClient.getUrl(normalizedPath);
      recordApiUrl(normalizedPath, url, "ApiClient.getUrl", null);
      return url;
    } catch (err) {
      const fallbackUrl = getAssetBasePath() + "/" + normalizedPath;
      recordApiUrl(normalizedPath, fallbackUrl, "asset-base-path-fallback", summarizeUrlError(err));
      return fallbackUrl;
    }
  }

  const fallbackUrl = getAssetBasePath() + "/" + normalizedPath;
  recordApiUrl(normalizedPath, fallbackUrl, "asset-base-path", null);
  return fallbackUrl;
}
