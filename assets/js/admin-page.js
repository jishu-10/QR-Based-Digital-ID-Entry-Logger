(function() {
  const adminGate = document.getElementById('adminGate');
  const adminContent = document.getElementById('adminContent');
  const gateStatus = document.getElementById('gateStatus');
  const gateAdminKeyInput = document.getElementById('gateAdminKeyInput');
  const unlockAdminButton = document.getElementById('unlockAdminButton');
  const lockAdminButton = document.getElementById('lockAdminButton');
  const statusBar = document.getElementById('statusBar');
  const bootstrapButton = document.getElementById('bootstrapButton');
  const refreshButton = document.getElementById('refreshButton');
  const generateButton = document.getElementById('generateButton');
  const loadUsersButton = document.getElementById('loadUsersButton');
  const loadReportsButton = document.getElementById('loadReportsButton');
  const saveGeoButton = document.getElementById('saveGeoButton');
  const csvInput = document.getElementById('csvInput');
  const resourceLinks = document.getElementById('resourceLinks');
  const resultContainer = document.getElementById('resultContainer');
  const usersContainer = document.getElementById('usersContainer');
  const reportsContainer = document.getElementById('reportsContainer');
  const adminKeyInput = document.getElementById('adminKeyInput');
  const backendUrl = document.getElementById('backendUrl');
  const adminKeyHint = document.getElementById('adminKeyHint');
  const geoEnabledInput = document.getElementById('geoEnabledInput');
  const geoLatitudeInput = document.getElementById('geoLatitudeInput');
  const geoLongitudeInput = document.getElementById('geoLongitudeInput');
  const geoRadiusInput = document.getElementById('geoRadiusInput');
  const adminKeyStorageKey =
    (window.APP_RUNTIME_CONFIG &&
      window.APP_RUNTIME_CONFIG.storageKeys &&
      window.APP_RUNTIME_CONFIG.storageKeys.adminAccessKey) ||
    'qr-entry-logger.admin-access-key';

  document.addEventListener('DOMContentLoaded', function() {
    backendUrl.textContent = window.APP_RUNTIME_CONFIG.appsScriptWebAppUrl;

    const storedKey = window.localStorage.getItem(adminKeyStorageKey) || '';
    gateAdminKeyInput.value = storedKey;
    adminKeyInput.value = storedKey;

    bindEvents();

    if (storedKey) {
      unlockAdmin(true);
    }
  });

  function bindEvents() {
    unlockAdminButton.addEventListener('click', function() {
      unlockAdmin(false);
    });
    gateAdminKeyInput.addEventListener('keydown', function(event) {
      if (event.key === 'Enter') {
        unlockAdmin(false);
      }
    });
    bootstrapButton.addEventListener('click', bootstrapProject);
    refreshButton.addEventListener('click', refreshAll);
    generateButton.addEventListener('click', generateUsers);
    loadUsersButton.addEventListener('click', loadRecentUsers);
    loadReportsButton.addEventListener('click', loadReports);
    saveGeoButton.addEventListener('click', saveGeolocationSettings);
    lockAdminButton.addEventListener('click', lockAdmin);
    usersContainer.addEventListener('click', handleUserAction);
    adminKeyInput.addEventListener('input', function() {
      const key = adminKeyInput.value.trim();
      gateAdminKeyInput.value = key;
      window.localStorage.setItem(adminKeyStorageKey, key);
    });
  }

  function getAdminKey() {
    return (adminKeyInput.value || gateAdminKeyInput.value || '').trim();
  }

  async function unlockAdmin(isAutomatic) {
    const key = gateAdminKeyInput.value.trim();

    if (!key) {
      setGateStatus('Enter the Admin Access Key to unlock this console.');
      return;
    }

    setBusy(unlockAdminButton, true);
    setGateStatus('Checking admin access...');

    try {
      adminKeyInput.value = key;
      window.localStorage.setItem(adminKeyStorageKey, key);

      const status = await window.ApiClient.get('status', { adminKey: key });

      if (!status.adminAccessEnabled) {
        throw new Error('ADMIN_ACCESS_KEY is not configured in Apps Script Script Properties.');
      }

      if (!status.adminAuthorized) {
        throw new Error('Admin access denied. Check the key and try again.');
      }

      adminGate.hidden = true;
      adminContent.hidden = false;
      renderStatus(status);
      await Promise.all([loadDashboard(), loadRecentUsers(), loadReports()]);
    } catch (error) {
      if (!isAutomatic) {
        setGateStatus(error.message || 'Unable to unlock admin console.');
      } else {
        window.localStorage.removeItem(adminKeyStorageKey);
        setGateStatus('Stored key could not unlock admin access. Enter the key again.');
      }
      lockAdmin(false);
    } finally {
      setBusy(unlockAdminButton, false);
    }
  }

  function lockAdmin(clearStoredKey) {
    adminContent.hidden = true;
    adminGate.hidden = false;

    if (clearStoredKey !== false) {
      window.localStorage.removeItem(adminKeyStorageKey);
      gateAdminKeyInput.value = '';
      adminKeyInput.value = '';
      setGateStatus('Admin console locked.');
    }
  }

  async function refreshAll() {
    try {
      await loadStatus();
      await Promise.all([loadDashboard(), loadRecentUsers(), loadReports()]);
    } catch (error) {
      // loadStatus already displays the useful message.
    }
  }

  async function bootstrapProject() {
    setBusy(bootstrapButton, true);
    setStatus('Creating project resources...');

    try {
      await window.ApiClient.post('bootstrap_project', {
        adminKey: getAdminKey(),
      });
      setStatus('Project resources are ready.');
      await refreshAll();
    } catch (error) {
      setStatus(error.message || 'Unable to bootstrap project.');
    } finally {
      setBusy(bootstrapButton, false);
    }
  }

  async function loadStatus() {
    try {
      const status = await window.ApiClient.get('status', {
        adminKey: getAdminKey(),
      });

      if (!status.adminAuthorized) {
        throw new Error('Admin access expired or the key is invalid.');
      }

      renderStatus(status);
      return status;
    } catch (error) {
      setStatus(error.message || 'Unable to load project status.');
      throw error;
    }
  }

  function renderStatus(status) {
    if (!status.ready) {
      setStatus('Setup pending. Click Bootstrap Project to create the Google Sheet and Drive folder.');
      resourceLinks.innerHTML = '';
    } else {
      setStatus(
        'Ready. Duplicate window: ' +
          status.duplicateWindowSeconds +
          ' seconds. QR size: ' +
          status.qrImageSizePx +
          'px. Time zone: ' +
          status.timeZone +
          '.'
      );

      const links = [];

      if (status.spreadsheetUrl) {
        links.push(
          '<a class="resource-link" target="_blank" href="' + escapeHtml(status.spreadsheetUrl) + '">Open Google Sheet</a>'
        );
      }

      if (status.qrFolderUrl) {
        links.push(
          '<a class="resource-link" target="_blank" href="' + escapeHtml(status.qrFolderUrl) + '">Open QR Drive Folder</a>'
        );
      }

      resourceLinks.innerHTML =
        links.join('') || '<div class="empty-state">Resources are configured but links are not available yet.</div>';
    }

    adminKeyHint.textContent =
      'Protected mode is required. Use the same ADMIN_ACCESS_KEY stored in Apps Script Script Properties.';
    renderGeolocationSettings(status.geolocation || {});
  }

  function renderGeolocationSettings(settings) {
    geoEnabledInput.checked = Boolean(settings.enabled);
    geoLatitudeInput.value = settings.latitude === null || settings.latitude === undefined ? '' : settings.latitude;
    geoLongitudeInput.value = settings.longitude === null || settings.longitude === undefined ? '' : settings.longitude;
    geoRadiusInput.value = settings.radiusMeters || 100;
  }

  async function loadDashboard() {
    try {
      const summary = await window.ApiClient.get('dashboard_summary', {
        adminKey: getAdminKey(),
      });
      document.getElementById('statUsers').textContent = summary.totalUsers || 0;
      document.getElementById('statInside').textContent = summary.currentlyInside || 0;
      document.getElementById('statToday').textContent = summary.scansToday || 0;
      document.getElementById('statWeek').textContent = summary.scansThisWeek || 0;
    } catch (error) {
      // Keep the page usable even if the summary call fails.
    }
  }

  async function saveGeolocationSettings() {
    setBusy(saveGeoButton, true);
    setStatus('Saving geolocation rules...');

    try {
      const settings = await window.ApiClient.post('update_geolocation_settings', {
        adminKey: getAdminKey(),
        enabled: geoEnabledInput.checked,
        latitude: geoLatitudeInput.value.trim(),
        longitude: geoLongitudeInput.value.trim(),
        radiusMeters: geoRadiusInput.value.trim(),
      });
      renderGeolocationSettings(settings);
      setStatus('Geolocation rules saved.');
    } catch (error) {
      setStatus(error.message || 'Unable to save geolocation rules.');
    } finally {
      setBusy(saveGeoButton, false);
    }
  }

  async function generateUsers() {
    const csv = csvInput.value.trim();

    if (!csv) {
      setStatus('Paste at least one CSV row before generating QR IDs.');
      return;
    }

    setBusy(generateButton, true);
    setStatus('Generating user IDs, QR payloads, Drive files, and Sheet records...');

    try {
      const result = await window.ApiClient.post(
        'register_users_from_csv',
        {
          csvText: csv,
          adminKey: getAdminKey(),
        },
        {
          timeoutMs: 120000,
        }
      );
      renderResults(result);
      await Promise.all([loadDashboard(), loadRecentUsers(), loadReports(), loadStatus()]);
      setStatus('QR generation completed. Created: ' + result.createdCount + '.');
    } catch (error) {
      setStatus(error.message || 'Unable to generate QR IDs.');
    } finally {
      setBusy(generateButton, false);
    }
  }

  function renderResults(result) {
    if (!result || !result.results || result.results.length === 0) {
      resultContainer.innerHTML = '<div class="empty-state">No result rows were returned.</div>';
      return;
    }

    const rows = result.results
      .map(function(item) {
        const badgeClass = item.action === 'created' ? 'badge-created' : 'badge-skipped';
        const linkCell = item.qrFileUrl
          ? '<a class="resource-link" target="_blank" href="' + escapeHtml(item.qrFileUrl) + '">Open QR file</a>'
          : '-';

        return (
          '<tr>' +
          '<td><span class="result-badge ' +
          badgeClass +
          '">' +
          escapeHtml(item.action) +
          '</span></td>' +
          '<td>' +
          escapeHtml(item.userId || '-') +
          '</td>' +
          '<td>' +
          escapeHtml(item.name || '-') +
          '</td>' +
          '<td>' +
          escapeHtml(item.email || '-') +
          '</td>' +
          '<td>' +
          escapeHtml(item.message || '-') +
          '</td>' +
          '<td>' +
          linkCell +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    resultContainer.innerHTML =
      '<table>' +
      '<thead>' +
      '<tr>' +
      '<th>Result</th>' +
      '<th>User ID</th>' +
      '<th>Name</th>' +
      '<th>Email</th>' +
      '<th>Message</th>' +
      '<th>QR File</th>' +
      '</tr>' +
      '</thead>' +
      '<tbody>' +
      rows +
      '</tbody>' +
      '</table>';
  }

  async function loadRecentUsers() {
    setBusy(loadUsersButton, true);

    try {
      const users = await window.ApiClient.get('recent_users', {
        limit: 20,
        adminKey: getAdminKey(),
      });
      renderRecentUsers(users);
    } catch (error) {
      usersContainer.innerHTML = '<div class="empty-state">' + escapeHtml(error.message || 'Unable to load users.') + '</div>';
    } finally {
      setBusy(loadUsersButton, false);
    }
  }

  function renderRecentUsers(users) {
    if (!users || users.length === 0) {
      usersContainer.innerHTML = '<div class="empty-state">No user records found yet.</div>';
      return;
    }

    const rows = users
      .map(function(user) {
        const qrCell = user.qrFileUrl
          ? '<a class="resource-link" target="_blank" href="' + escapeHtml(user.qrFileUrl) + '">Drive link</a>'
          : '-';
        const isActive = user.isActive !== false;
        const nextActiveValue = isActive ? 'false' : 'true';

        return (
          '<tr>' +
          '<td>' +
          escapeHtml(user.userId) +
          '</td>' +
          '<td>' +
          escapeHtml(user.name) +
          '</td>' +
          '<td>' +
          escapeHtml(user.email || '-') +
          '</td>' +
          '<td><span class="status-pill ' +
          (isActive ? 'pill-active' : 'pill-inactive') +
          '">' +
          (isActive ? 'Active' : 'Inactive') +
          '</span></td>' +
          '<td>' +
          escapeHtml(user.createdAt || '-') +
          '</td>' +
          '<td>' +
          qrCell +
          '</td>' +
          '<td><div class="table-actions">' +
          '<button class="secondary-btn" data-action="set-active" data-active="' +
          nextActiveValue +
          '" data-user-id="' +
          escapeHtml(user.userId) +
          '">' +
          (isActive ? 'Disable' : 'Enable') +
          '</button>' +
          '<button class="danger-btn" data-action="delete-user" data-user-id="' +
          escapeHtml(user.userId) +
          '">Remove</button>' +
          '</div></td>' +
          '</tr>'
        );
      })
      .join('');

    usersContainer.innerHTML =
      '<table>' +
      '<thead>' +
      '<tr>' +
      '<th>User ID</th>' +
      '<th>Name</th>' +
      '<th>Email</th>' +
      '<th>Status</th>' +
      '<th>Created At</th>' +
      '<th>QR File</th>' +
      '<th>Actions</th>' +
      '</tr>' +
      '</thead>' +
      '<tbody>' +
      rows +
      '</tbody>' +
      '</table>';
  }

  async function handleUserAction(event) {
    const button = event.target.closest('button[data-action]');

    if (!button) {
      return;
    }

    const userId = button.getAttribute('data-user-id');
    const action = button.getAttribute('data-action');

    if (action === 'delete-user' && !window.confirm('Remove user ' + userId + '? Existing attendance logs will be kept.')) {
      return;
    }

    setBusy(button, true);

    try {
      if (action === 'set-active') {
        await window.ApiClient.post('set_user_active', {
          adminKey: getAdminKey(),
          userId: userId,
          isActive: button.getAttribute('data-active') === 'true',
        });
      } else if (action === 'delete-user') {
        await window.ApiClient.post('delete_user', {
          adminKey: getAdminKey(),
          userId: userId,
        });
      }

      await Promise.all([loadRecentUsers(), loadDashboard(), loadReports()]);
      setStatus('User moderation updated.');
    } catch (error) {
      setStatus(error.message || 'Unable to update user.');
    } finally {
      setBusy(button, false);
    }
  }

  async function loadReports() {
    setBusy(loadReportsButton, true);

    try {
      const report = await window.ApiClient.get('attendance_report', {
        adminKey: getAdminKey(),
      });
      renderReports(report);
    } catch (error) {
      reportsContainer.innerHTML =
        '<div class="empty-state">' + escapeHtml(error.message || 'Unable to load reports.') + '</div>';
    } finally {
      setBusy(loadReportsButton, false);
    }
  }

  function renderReports(report) {
    if (!report || !report.ready) {
      reportsContainer.innerHTML = '<div class="empty-state">Reports will appear after project setup.</div>';
      return;
    }

    reportsContainer.innerHTML =
      renderReportTable('Today', report.daily) + renderReportTable('Last 7 Days', report.weekly);
  }

  function renderReportTable(title, report) {
    const users = report && report.users ? report.users : [];

    if (users.length === 0) {
      return '<h2 style="margin-top: 18px;">' + escapeHtml(title) + '</h2><div class="empty-state">No report rows yet.</div>';
    }

    const rows = users
      .map(function(user) {
        return (
          '<tr>' +
          '<td>' +
          escapeHtml(user.userId) +
          '</td>' +
          '<td>' +
          escapeHtml(user.name || '-') +
          '</td>' +
          '<td>' +
          escapeHtml(user.scans || 0) +
          '</td>' +
          '<td>' +
          escapeHtml(user.inScans || 0) +
          '</td>' +
          '<td>' +
          escapeHtml(user.outScans || 0) +
          '</td>' +
          '<td>' +
          escapeHtml(user.lastStatus || '-') +
          '</td>' +
          '<td>' +
          escapeHtml(user.lastSeenIso || '-') +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    return (
      '<h2 style="margin-top: 18px;">' +
      escapeHtml(title) +
      ' - ' +
      escapeHtml(report.totalScans || 0) +
      ' scans</h2>' +
      '<table>' +
      '<thead>' +
      '<tr>' +
      '<th>User ID</th>' +
      '<th>Name</th>' +
      '<th>Scans</th>' +
      '<th>IN</th>' +
      '<th>OUT</th>' +
      '<th>Last Status</th>' +
      '<th>Last Seen</th>' +
      '</tr>' +
      '</thead>' +
      '<tbody>' +
      rows +
      '</tbody>' +
      '</table>'
    );
  }

  function setBusy(button, busy) {
    if (button) {
      button.disabled = busy;
    }
  }

  function setStatus(message) {
    statusBar.textContent = message;
  }

  function setGateStatus(message) {
    gateStatus.textContent = message;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
