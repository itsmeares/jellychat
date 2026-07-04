import { recordApiRequestDebug, recordApiResultDebug, resolveJellyfinUrl } from "../runtime/urls";

function getErrorStatus(error: unknown): number | null {
  if (error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number") {
    return (error as { status: number }).status;
  }

  return null;
}

export async function fetchJson(path: string): Promise<unknown> {
  if (!window.ApiClient) {
    const url = resolveJellyfinUrl(path);
    recordApiRequestDebug("GET", path, url);
    recordApiResultDebug("GET", path, url, null, "ApiClient missing");
    return null;
  }

  const url = resolveJellyfinUrl(path);
  recordApiRequestDebug("GET", path, url);

  try {
    if (typeof window.ApiClient.ajax === "function") {
      const response = await window.ApiClient.ajax({
        type: "GET",
        url,
        dataType: "json"
      });
      recordApiResultDebug("GET", path, url, null);
      return response;
    }

    if (typeof window.ApiClient.getJSON === "function") {
      const response = await window.ApiClient.getJSON(url);
      recordApiResultDebug("GET", path, url, null);
      return response;
    }
  } catch (err) {
    recordApiResultDebug("GET", path, url, getErrorStatus(err), err);
    throw err;
  }

  recordApiResultDebug("GET", path, url, null, "ApiClient JSON request method missing");
  return null;
}

export async function postJson(path: string, data: unknown, expectJsonResponse: boolean): Promise<unknown> {
  if (!window.ApiClient) {
    const url = resolveJellyfinUrl(path);
    recordApiRequestDebug("POST", path, url);
    recordApiResultDebug("POST", path, url, null, "ApiClient missing");
    return null;
  }

  const url = resolveJellyfinUrl(path);
  recordApiRequestDebug("POST", path, url);

  try {
    if (typeof window.ApiClient.ajax === "function") {
      const request: Record<string, unknown> = {
        type: "POST",
        url,
        contentType: "application/json; charset=utf-8",
        data: JSON.stringify(data || {})
      };

      if (expectJsonResponse) {
        request.dataType = "json";
      }

      const response = await window.ApiClient.ajax(request);
      recordApiResultDebug("POST", path, url, null);
      return response;
    }

    if (typeof window.fetch === "function") {
      const response = await window.fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        },
        body: JSON.stringify(data || {})
      });

      if (!response.ok) {
        const error = new Error("HTTP " + response.status) as Error & { status?: number };
        error.status = response.status;
        recordApiResultDebug("POST", path, url, response.status, error);
        throw error;
      }

      recordApiResultDebug("POST", path, url, response.status);
      if (expectJsonResponse) {
        return response.json();
      }
    }
  } catch (err) {
    recordApiResultDebug("POST", path, url, getErrorStatus(err), err);
    throw err;
  }

  recordApiResultDebug("POST", path, url, null, "API POST request method missing");
  return null;
}
