(function() {
  const statusBar = document.getElementById('statusBar');
  const bootstrapButton = document.getElementById('bootstrapButton');
  const refreshButton = document.getElementById('refreshButton');
  const generateButton = document.getElementById('generateButton');
  const loadUsersButton = document.getElementById('loadUsersButton');
  const csvInput = document.getElementById('csvInput');
  const resourceLinks = document.getElementById('resourceLinks');
  const resultContainer = document.getElementById('resultContainer');
  const usersContainer = document.getElementById('usersContainer');
  const adminKeyInput = document.getElementById('adminKeyInput');
  const backendUrl = document.getElementById('backendUrl');
  const adminKeyHint = document.getElementById('adminKeyHint');
  const adminKeyStorageKey =
    (window.APP_RUNTIME_CONFIG &&
      window.APP_RUNTIME_CONFIG.storageKeys &&
      window.APP_RUNTIME_CONFIG.storageKeys.adminAccessKey) ||
    'qr-entry-logger.admin-access-key';

  document.addEventListener('DOMContentLoaded', function() {
    backendUrl.textContent = window.APP_RUNTIME_CONFIG.appsScriptWebAppUrl;
    adminKeyInput.value = window.localStorage.getItem(adminKeyStorageKey) || '';
    bindEvents();
    refreshAll();
  });

  function bindEvents() {
    bootstrapButton.addEventListener('click', bootstrapProject);
    refreshButton.addEventListener('click', refreshAll);
    generateButton.addEventListener('click', generateUsers);
    loadUsersButton.addEventListener('click', loadRecentUsers);
    adminKeyInput.addEventListener('input', function() {
      window.localStorage.setItem(adminKeyStorageKey, adminKeyInput.value.trim());
    });
  }

  function getAdminKey() {
    return adminKeyInput.value.trim();
  }

  async function refreshAll() {
    await loadStatus();
    await Promise.all([loadDashboard(), loadRecentUsers()]);
  }

  async function bootstrapProject() {
    setBusy(bootstrapButton, true);
    setStatus('Creating project resources...');

    try {
      await window.ApiClient.post(
        'bootstrap_project',
        {
          adminKey: getAdminKey(),
        },
        {
          allowJsonpFallback: true,
        }
      );
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
      const status = await window.ApiClient.get('status');
      renderStatus(status);
    } catch (error) {
      setStatus(error.message || 'Unable to load project status.');
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

    if (status.adminAccessEnabled) {
      adminKeyHint.textContent =
        'Protected mode is enabled. Enter the same ADMIN_ACCESS_KEY that you stored in Apps Script Script Properties.';
    } else {
      adminKeyHint.textContent =
        'Optional: leave this blank unless you choose to protect admin actions with an ADMIN_ACCESS_KEY in Apps Script.';
    }
  }

  async function loadDashboard() {
    try {
      const summary = await window.ApiClient.get('dashboard_summary');
      document.getElementById('statUsers').textContent = summary.totalUsers || 0;
      document.getElementById('statInside').textContent = summary.currentlyInside || 0;
      document.getElementById('statToday').textContent = summary.scansToday || 0;
      document.getElementById('statWeek').textContent = summary.scansThisWeek || 0;
    } catch (error) {
      // Keep the page usable even if the summary call fails.
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
          allowJsonpFallback: true,
        }
      );
      renderResults(result);
      await Promise.all([loadDashboard(), loadRecentUsers(), loadStatus()]);
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
      const users = await window.ApiClient.get(
        'recent_users',
        {
          limit: 12,
          adminKey: getAdminKey(),
        },
        {
          allowJsonpFallback: true,
        }
      );
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
          '<td>' +
          escapeHtml(user.createdAt || '-') +
          '</td>' +
          '<td>' +
          qrCell +
          '</td>' +
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
      '<th>Created At</th>' +
      '<th>QR File</th>' +
      '</tr>' +
      '</thead>' +
      '<tbody>' +
      rows +
      '</tbody>' +
      '</table>';
  }

  function setBusy(button, busy) {
    button.disabled = busy;
  }

  function setStatus(message) {
    statusBar.textContent = message;
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
