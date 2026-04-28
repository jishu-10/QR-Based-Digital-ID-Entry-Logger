(function(global) {

  const REQUEST_TIMEOUT_MS = 20000;

  function getConfig() {
    const config = global.APP_RUNTIME_CONFIG || {};

    if (!config.appsScriptWebAppUrl) {
      throw new Error("Missing Apps Script web app URL.");
    }

    return config;
  }

  function buildUrl(action, params) {
    const url = new URL(getConfig().appsScriptWebAppUrl);

    url.searchParams.set("api", "1");
    url.searchParams.set("action", action);

    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== "") {
        url.searchParams.set(key, typeof value === "object" ? JSON.stringify(value) : value);
      }
    });

    return url.toString();
  }

  async function request(method, action, params = {}) {
    const url = buildUrl(action, method === "GET" ? params : {});

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json"
        },
        body: method === "POST" ? JSON.stringify(params) : null,
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error("HTTP error: " + response.status);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || "Request failed");
      }

      return data.data;

    } catch (err) {
      throw new Error(err.message || "Network error");
    }
  }

  function get(action, params) {
    return request("GET", action, params);
  }

  function post(action, params) {
    return request("POST", action, params);
  }

  global.ApiClient = Object.freeze({
    get,
    post
  });

})(window);
