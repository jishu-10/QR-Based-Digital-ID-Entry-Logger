(function(global) {
  const config = global.APP_RUNTIME_CONFIG || {};
  const storageKeys = config.storageKeys || {};
  const sessionStorageKey = storageKeys.adminSessionToken || 'qr-entry-logger.admin-session-token';
  const legacyKeyStorageKey = storageKeys.adminAccessKey || 'qr-entry-logger.admin-access-key';

  function getSessionToken() {
    return global.sessionStorage.getItem(sessionStorageKey) || '';
  }

  function setSessionToken(token) {
    if (token) {
      global.sessionStorage.setItem(sessionStorageKey, token);
      global.localStorage.removeItem(legacyKeyStorageKey);
      return;
    }

    global.sessionStorage.removeItem(sessionStorageKey);
  }

  function getAuthParams() {
    const token = getSessionToken();

    return token
      ? {
          adminSessionToken: token,
        }
      : {};
  }

  function hasSession() {
    return Boolean(getSessionToken());
  }

  async function login(adminKey) {
    const session = await global.ApiClient.post('admin_login', {
      adminKey: adminKey,
    });

    setSessionToken(session.sessionToken);
    return session;
  }

  async function logout() {
    const authParams = getAuthParams();

    try {
      if (authParams.adminSessionToken) {
        await global.ApiClient.post('admin_logout', authParams);
      }
    } finally {
      setSessionToken('');
    }
  }

  async function requireStatus() {
    const status = await global.ApiClient.post('status', getAuthParams());

    if (!status.adminAuthorized) {
      setSessionToken('');
      throw new Error('Admin session expired. Unlock the admin page again.');
    }

    return status;
  }

  global.AdminAuth = Object.freeze({
    getAuthParams: getAuthParams,
    getSessionToken: getSessionToken,
    hasSession: hasSession,
    login: login,
    logout: logout,
    requireStatus: requireStatus,
    setSessionToken: setSessionToken,
  });
})(window);
