(function(global) {
  function getConfig() {
    const config = global.APP_RUNTIME_CONFIG || {};

    if (!config.appsScriptWebAppUrl) {
      throw new Error('Missing Apps Script web app URL. Update assets/js/runtime-config.js.');
    }

    return config;
  }

  function normalizeValue(value) {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  }

  function buildUrl(action, params) {
    const url = new URL(getConfig().appsScriptWebAppUrl);
    url.searchParams.set('api', '1');
    url.searchParams.set('action', action);

    Object.entries(params || {}).forEach(function(entry) {
      const key = entry[0];
      const value = entry[1];

      if (value === null || value === undefined || value === '') {
        return;
      }

      url.searchParams.set(key, normalizeValue(value));
    });

    return url;
  }

  async function parseFetchResponse(response) {
    const text = await response.text();
    let payload;

    try {
      payload = JSON.parse(text);
    } catch (error) {
      throw new Error(
        'Backend returned a non-JSON response. Confirm the Apps Script deployment URL is correct and deployed with public access.'
      );
    }

    if (!payload || payload.success !== true) {
      throw buildApiError(payload);
    }

    return payload.data;
  }

  function buildApiError(payload) {
    const error = new Error(
      payload && payload.error && payload.error.message ? payload.error.message : 'Request failed.'
    );
    error.code = payload && payload.error && payload.error.code ? payload.error.code : 'REQUEST_FAILED';
    return error;
  }

  function shouldAttemptJsonpFallback(error, urlString) {
    if (!urlString || urlString.length > 1800) {
      return false;
    }

    if (error instanceof TypeError) {
      return true;
    }

    const message = String(error && error.message ? error.message : '').toLowerCase();
    return message.indexOf('failed to fetch') !== -1 || message.indexOf('cors') !== -1;
  }

  async function get(action, params, options) {
    const requestOptions = options || {};
    const url = buildUrl(action, params);

    try {
      return await parseFetchResponse(
        await fetch(url.toString(), {
          method: 'GET',
          redirect: 'follow',
          credentials: 'omit',
        })
      );
    } catch (error) {
      if (requestOptions.allowJsonpFallback === false || !shouldAttemptJsonpFallback(error, url.toString())) {
        throw error;
      }

      return jsonp(action, params);
    }
  }

  async function post(action, params, options) {
    const requestOptions = options || {};
    const url = buildUrl(action, {});
    const body = new URLSearchParams();

    Object.entries(params || {}).forEach(function(entry) {
      const key = entry[0];
      const value = entry[1];

      if (value === null || value === undefined || value === '') {
        return;
      }

      body.set(key, normalizeValue(value));
    });

    try {
      return await parseFetchResponse(
        await fetch(url.toString(), {
          method: 'POST',
          body: body,
          redirect: 'follow',
          credentials: 'omit',
        })
      );
    } catch (error) {
      const fallbackUrl = buildUrl(action, params).toString();

      if (requestOptions.allowJsonpFallback === false || !shouldAttemptJsonpFallback(error, fallbackUrl)) {
        throw error;
      }

      return jsonp(action, params);
    }
  }

  function jsonp(action, params) {
    return new Promise(function(resolve, reject) {
      const callbackName = '__qrEntryLoggerJsonp_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
      const url = buildUrl(action, params);
      const script = document.createElement('script');
      const timeout = window.setTimeout(function() {
        cleanup();
        reject(new Error('The backend request timed out.'));
      }, 20000);

      function cleanup() {
        window.clearTimeout(timeout);
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
        delete global[callbackName];
      }

      global[callbackName] = function(payload) {
        cleanup();

        if (!payload || payload.success !== true) {
          reject(buildApiError(payload));
          return;
        }

        resolve(payload.data);
      };

      script.async = true;
      script.src = url.toString() + '&prefix=' + encodeURIComponent(callbackName);
      script.onerror = function() {
        cleanup();
        reject(new Error('Unable to reach the Apps Script backend.'));
      };
      document.head.appendChild(script);
    });
  }

  global.ApiClient = Object.freeze({
    buildUrl: buildUrl,
    get: get,
    post: post,
  });
})(window);
