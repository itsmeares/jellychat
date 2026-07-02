let injectedScriptSrc = "";
let cachedAssetBasePath = "";

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
  return script?.src || "";
}

export function recordInjectedAssetSource(scriptSrc: string): void {
  injectedScriptSrc = scriptSrc || findInjectedScriptSrc();
  cachedAssetBasePath = resolveAssetBasePath(injectedScriptSrc);
}

export function resolveAssetBasePath(scriptSrc = findInjectedScriptSrc()): string {
  if (!scriptSrc) {
    return cachedAssetBasePath;
  }

  try {
    const url = new URL(scriptSrc, window.location.href);
    const pathname = url.pathname || "";
    const marker = "/jellychat/assets/";
    const markerIndex = pathname.toLowerCase().indexOf(marker);
    if (markerIndex < 0) {
      return cachedAssetBasePath;
    }

    return normalizeBasePath(pathname.slice(0, markerIndex));
  } catch {
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

export function resolveJellyfinUrl(path: string): string {
  const normalizedPath = path.charAt(0) === "/" ? path.slice(1) : path;
  if (/^https?:\/\//i.test(normalizedPath)) {
    return normalizedPath;
  }

  if (window.ApiClient && typeof window.ApiClient.getUrl === "function") {
    return window.ApiClient.getUrl(normalizedPath);
  }

  return getAssetBasePath() + "/" + normalizedPath;
}
