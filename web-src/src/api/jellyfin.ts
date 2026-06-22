export async function fetchJson(path: string): Promise<unknown> {
  if (!window.ApiClient) {
    return null;
  }

  const normalizedPath = path.charAt(0) === "/" ? path.slice(1) : path;
  const url = typeof window.ApiClient.getUrl === "function"
    ? window.ApiClient.getUrl(normalizedPath)
    : normalizedPath;

  if (typeof window.ApiClient.ajax === "function") {
    return window.ApiClient.ajax({
      type: "GET",
      url,
      dataType: "json"
    });
  }

  if (typeof window.ApiClient.getJSON === "function") {
    return window.ApiClient.getJSON(url);
  }

  return null;
}

export async function postJson(path: string, data: unknown, expectJsonResponse: boolean): Promise<unknown> {
  if (!window.ApiClient) {
    return null;
  }

  const normalizedPath = path.charAt(0) === "/" ? path.slice(1) : path;
  const url = typeof window.ApiClient.getUrl === "function"
    ? window.ApiClient.getUrl(normalizedPath)
    : normalizedPath;

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

    return window.ApiClient.ajax(request);
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
      throw new Error("HTTP " + response.status);
    }

    if (expectJsonResponse) {
      return response.json();
    }
  }

  return null;
}
