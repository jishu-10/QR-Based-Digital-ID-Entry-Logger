(function() {
  const adminGate = document.getElementById('adminGate');
  const adminContent = document.getElementById('adminContent');
  const gateStatus = document.getElementById('gateStatus');
  const gateAdminKeyInput = document.getElementById('gateAdminKeyInput');
  const unlockAdminButton = document.getElementById('unlockAdminButton');
  const lockAdminButton = document.getElementById('lockAdminButton');
  const statusBar = document.getElementById('statusBar');
  const generateReportButton = document.getElementById('generateReportButton');
  const clearFiltersButton = document.getElementById('clearFiltersButton');
  const downloadCsvButton = document.getElementById('downloadCsvButton');
  const reportContainer = document.getElementById('reportContainer');
  const csvPreview = document.getElementById('csvPreview');

  const summaryTotal = document.getElementById('summaryTotal');
  const summaryIn = document.getElementById('summaryIn');
  const summaryOut = document.getElementById('summaryOut');
  const summaryUsers = document.getElementById('summaryUsers');
  const summaryMeta = document.getElementById('summaryMeta');

  const filters = {
    reportType: document.getElementById('reportTypeInput'),
    userId: document.getElementById('filterUserId'),
    name: document.getElementById('filterName'),
    email: document.getElementById('filterEmail'),
    dateFrom: document.getElementById('filterDateFrom'),
    dateTo: document.getElementById('filterDateTo'),
    timeFrom: document.getElementById('filterTimeFrom'),
    timeTo: document.getElementById('filterTimeTo'),
    status: document.getElementById('filterStatus'),
    limit: document.getElementById('limitInput'),
  };

  let lastCsv = '';

  document.addEventListener('DOMContentLoaded', function() {
    bindEvents();

    if (window.AdminAuth.hasSession()) {
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
    lockAdminButton.addEventListener('click', logoutAdmin);
    generateReportButton.addEventListener('click', generateReport);
    clearFiltersButton.addEventListener('click', clearFilters);
    downloadCsvButton.addEventListener('click', downloadCsv);
  }

  async function unlockAdmin(isAutomatic) {
    const key = gateAdminKeyInput.value.trim();

    if (!isAutomatic && !key) {
      setGateStatus('Enter the Admin Access Key to unlock reports.');
      return;
    }

    setBusy(unlockAdminButton, true);
    setGateStatus(isAutomatic ? 'Restoring admin session...' : 'Checking admin access...');

    try {
      if (!isAutomatic || !window.AdminAuth.hasSession()) {
        await window.AdminAuth.login(key);
      }

      await window.AdminAuth.requireStatus();
      gateAdminKeyInput.value = '';
      adminGate.hidden = true;
      adminContent.hidden = false;
      setStatus('Admin session active. Generate a report when ready.');
    } catch (error) {
      window.AdminAuth.setSessionToken('');
      adminContent.hidden = true;
      adminGate.hidden = false;
      setGateStatus(error.message || 'Unable to unlock reports.');
    } finally {
      setBusy(unlockAdminButton, false);
    }
  }

  async function logoutAdmin() {
    try {
      await window.AdminAuth.logout();
    } catch (error) {
      // The local session is cleared even if the server revoke call fails.
    } finally {
      adminContent.hidden = true;
      adminGate.hidden = false;
      gateAdminKeyInput.value = '';
      setGateStatus('Reports locked.');
    }
  }

  function collectFilters() {
    return {
      reportType: filters.reportType.value,
      userId: filters.userId.value.trim(),
      name: filters.name.value.trim(),
      email: filters.email.value.trim(),
      dateFrom: filters.dateFrom.value,
      dateTo: filters.dateTo.value,
      timeFrom: filters.timeFrom.value,
      timeTo: filters.timeTo.value,
      status: filters.status.value,
      limit: filters.limit.value,
    };
  }

  async function generateReport() {
    setBusy(generateReportButton, true);
    setStatus('Generating report...');

    try {
      const result = await window.ApiClient.post(
        'filtered_report',
        Object.assign(window.AdminAuth.getAuthParams(), collectFilters()),
        {
          timeoutMs: 60000,
        }
      );
      renderReport(result);
      setStatus('Report generated.');
    } catch (error) {
      handleAuthError(error);
      setStatus(error.message || 'Unable to generate report.');
      reportContainer.innerHTML = '<div class="empty-state">' + escapeHtml(error.message || 'Unable to generate report.') + '</div>';
    } finally {
      setBusy(generateReportButton, false);
    }
  }

  function renderReport(result) {
    const summary = result && result.summary ? result.summary : {};
    const reportType = result && result.reportType ? result.reportType : filters.reportType.value;

    summaryTotal.textContent = summary.totalScans || 0;
    summaryIn.textContent = summary.inScans || 0;
    summaryOut.textContent = summary.outScans || 0;
    summaryUsers.textContent = summary.uniqueUsers || 0;
    summaryMeta.textContent =
      'Matched ' +
      (result.totalMatched || 0) +
      ' log row(s). Generated at ' +
      escapeHtml(result.generatedAtIso || new Date().toISOString()) +
      '.';

    if (reportType === 'logs') {
      renderLogRows(result.logs || []);
    } else if (reportType === 'user') {
      renderUserRows(result.users || []);
    } else {
      renderOverallRows(summary);
    }

    lastCsv = result.csv || '';
    csvPreview.value = lastCsv || 'No CSV rows for this report.';
    downloadCsvButton.disabled = !lastCsv;
  }

  function renderOverallRows(summary) {
    const rows = [
      ['Total Scans', summary.totalScans || 0],
      ['IN Scans', summary.inScans || 0],
      ['OUT Scans', summary.outScans || 0],
      ['Unique Users', summary.uniqueUsers || 0],
      ['First Scan', summary.firstScanIso || '-'],
      ['Last Scan', summary.lastScanIso || '-'],
    ];

    reportContainer.innerHTML =
      '<table>' +
      '<thead><tr><th>Metric</th><th>Value</th></tr></thead>' +
      '<tbody>' +
      rows
        .map(function(row) {
          return '<tr><td>' + escapeHtml(row[0]) + '</td><td>' + escapeHtml(row[1]) + '</td></tr>';
        })
        .join('') +
      '</tbody></table>';
  }

  function renderUserRows(users) {
    if (users.length === 0) {
      reportContainer.innerHTML = '<div class="empty-state">No matching user report rows.</div>';
      return;
    }

    reportContainer.innerHTML =
      '<table>' +
      '<thead><tr><th>User ID</th><th>Name</th><th>Email</th><th>Scans</th><th>IN</th><th>OUT</th><th>Last Status</th><th>Last Seen</th></tr></thead>' +
      '<tbody>' +
      users
        .map(function(user) {
          return (
            '<tr>' +
            '<td>' + escapeHtml(user.userId) + '</td>' +
            '<td>' + escapeHtml(user.name || '-') + '</td>' +
            '<td>' + escapeHtml(user.email || '-') + '</td>' +
            '<td>' + escapeHtml(user.scans || 0) + '</td>' +
            '<td>' + escapeHtml(user.inScans || 0) + '</td>' +
            '<td>' + escapeHtml(user.outScans || 0) + '</td>' +
            '<td>' + escapeHtml(user.lastStatus || '-') + '</td>' +
            '<td>' + escapeHtml(user.lastSeenIso || '-') + '</td>' +
            '</tr>'
          );
        })
        .join('') +
      '</tbody></table>';
  }

  function renderLogRows(logs) {
    if (logs.length === 0) {
      reportContainer.innerHTML = '<div class="empty-state">No matching log rows.</div>';
      return;
    }

    reportContainer.innerHTML =
      '<table>' +
      '<thead><tr><th>Event ID</th><th>User ID</th><th>Name</th><th>Email</th><th>Timestamp</th><th>Status</th><th>Scanner</th><th>Geo</th></tr></thead>' +
      '<tbody>' +
      logs
        .map(function(log) {
          return (
            '<tr>' +
            '<td>' + escapeHtml(log.eventId || '-') + '</td>' +
            '<td>' + escapeHtml(log.userId || '-') + '</td>' +
            '<td>' + escapeHtml(log.name || '-') + '</td>' +
            '<td>' + escapeHtml(log.email || '-') + '</td>' +
            '<td>' + escapeHtml(log.timestampIso || '-') + '</td>' +
            '<td>' + escapeHtml(log.status || '-') + '</td>' +
            '<td>' + escapeHtml(log.scannerLabel || '-') + '</td>' +
            '<td>' + escapeHtml(log.geolocationResult || '-') + '</td>' +
            '</tr>'
          );
        })
        .join('') +
      '</tbody></table>';
  }

  function clearFilters() {
    Object.keys(filters).forEach(function(key) {
      if (key === 'reportType') {
        filters[key].value = 'overall';
      } else if (key === 'limit') {
        filters[key].value = '100';
      } else {
        filters[key].value = '';
      }
    });
    setStatus('Filters cleared. Generate a report when ready.');
  }

  function downloadCsv() {
    if (!lastCsv) {
      return;
    }

    const blob = new Blob([lastCsv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'qr-report-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function handleAuthError(error) {
    const message = String(error && error.message ? error.message : '').toLowerCase();

    if (message.indexOf('admin') !== -1 && message.indexOf('session') !== -1) {
      adminContent.hidden = true;
      adminGate.hidden = false;
      setGateStatus('Admin session expired. Unlock reports again.');
    }
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
