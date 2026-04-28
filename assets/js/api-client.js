(function(global) {
  const JSONP_URL_LIMIT = 1700;
  const REQUEST_TIMEOUT_MS = 25000;

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
    
    if (callbackName) {
    url.searchParams.set('callback', callbackName);
  }
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

  function buildApiError(payload) {
    const error = new Error(
      payload && payload.error && payload.error.message ? payload.error.message : 'Request failed.'
    );
    error.code = payload && payload.error && payload.error.code ? payload.error.code : 'REQUEST_FAILED';
    return error;
  }

  function get(action, params) {
    return jsonp(action, params);
  }

  function post(action, params, options) {
    const requestOptions = options || {};
    const jsonpUrl = buildUrl(action, params).toString();
    const forceIframe = requestOptions.transport === 'iframe';
    const preferJsonp = requestOptions.transport === 'jsonp';
    const allowJsonp = (preferJsonp || !forceIframe) && jsonpUrl.length <= JSONP_URL_LIMIT;

    if (!forceIframe && allowJsonp) {
      return jsonp(action, params);
    }

    return iframePost(action, params);
  }

  function jsonp(action, params) {
    return new Promise(function(resolve, reject) {
      const callbackName = '__qrEntryLoggerJsonp_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
      const url = buildUrl(action, params, callbackName);
      const script = document.createElement('script');
      const timeout = window.setTimeout(function() {
        cleanup();
        reject(
          new Error(
            'The backend request timed out. If you just changed the Apps Script code, redeploy the web app and try again.'
          )
        );
      }, REQUEST_TIMEOUT_MS);

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
        reject(
          new Error(
            'Unable to reach the Apps Script backend. Redeploy the Apps Script web app and confirm access is set to Anyone.'
          )
        );
      };
      document.head.appendChild(script);
    });
  }

  function iframePost(action, params) {
    return new Promise(function(resolve, reject) {
      const requestId = '__qrEntryLoggerPost_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
      const iframe = document.createElement('iframe');
      const form = document.createElement('form');
      const timeout = window.setTimeout(function() {
        cleanup();
        reject(
          new Error(
            'The backend request timed out. If you just changed the Apps Script code, redeploy the web app and try again.'
          )
        );
      }, REQUEST_TIMEOUT_MS);

      iframe.name = requestId;
      iframe.style.display = 'none';
      form.method = 'POST';
      form.action = getConfig().appsScriptWebAppUrl;
      form.target = requestId;
      form.style.display = 'none';

      appendHiddenField(form, 'api', '1');
      appendHiddenField(form, 'action', action);
      appendHiddenField(form, 'transport', 'iframe');
      appendHiddenField(form, 'requestId', requestId);

      Object.entries(params || {}).forEach(function(entry) {
        const key = entry[0];
        const value = entry[1];

        if (value === null || value === undefined || value === '') {
          return;
        }

        appendHiddenField(form, key, normalizeValue(value));
      });

      function onMessage(event) {
        const data = event.data;

        if (!data || data.source !== 'qr-entry-logger' || data.requestId !== requestId) {
          return;
        }

        cleanup();

        if (!data.payload || data.payload.success !== true) {
          reject(buildApiError(data.payload));
          return;
        }

        resolve(data.payload.data);
      }

      function cleanup() {
        window.clearTimeout(timeout);
        window.removeEventListener('message', onMessage);

        if (form.parentNode) {
          form.parentNode.removeChild(form);
        }

        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }

      window.addEventListener('message', onMessage);
      document.body.appendChild(iframe);
      document.body.appendChild(form);
      form.submit();
    });
  }

  function appendHiddenField(form, name, value) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  global.ApiClient = Object.freeze({
    buildUrl: buildUrl,
    get: get,
    post: post,
  });
})(window);
