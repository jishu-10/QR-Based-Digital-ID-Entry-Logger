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

  async function request(method, action, params = {}, options = {}) {
    const url = buildUrl(action, method === "GET" ? params : {});

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);

    try {
      const fetchOptions = {
        method,
        signal: controller.signal
      };

      if (method === "POST") {
        fetchOptions.headers = {
          "Content-Type": "application/json"
        };
        fetchOptions.body = JSON.stringify(params);
      }

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        throw new Error("HTTP error: " + response.status);
      }

      const data = await response.json();

      if (!data.success) {
        const errorMessage =
          data.error && typeof data.error === "object" ? data.error.message : data.error;
        throw new Error(errorMessage || "Request failed");
      }

      return data.data;

    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error("Request timed out. Please try again.");
      }

      throw new Error(err.message || "Network error");
    } finally {
      clearTimeout(timeout);
    }
  }

  function get(action, params, options) {
    return request("GET", action, params, options);
  }

  function post(action, params, options) {
    return request("POST", action, params, options);
  }

  global.ApiClient = Object.freeze({
    get,
    post
  });

})(window);
