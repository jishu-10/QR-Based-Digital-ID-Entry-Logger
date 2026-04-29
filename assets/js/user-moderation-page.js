(function() {
  const adminGate = document.getElementById('adminGate');
  const adminContent = document.getElementById('adminContent');
  const gateStatus = document.getElementById('gateStatus');
  const gateAdminKeyInput = document.getElementById('gateAdminKeyInput');
  const unlockAdminButton = document.getElementById('unlockAdminButton');
  const lockAdminButton = document.getElementById('lockAdminButton');
  const statusBar = document.getElementById('statusBar');
  const searchUsersButton = document.getElementById('searchUsersButton');
  const clearFiltersButton = document.getElementById('clearFiltersButton');
  const prevUsersButton = document.getElementById('prevUsersButton');
  const nextUsersButton = document.getElementById('nextUsersButton');
  const selectAllButton = document.getElementById('selectAllButton');
  const enableSelectedButton = document.getElementById('enableSelectedButton');
  const disableSelectedButton = document.getElementById('disableSelectedButton');
  const deleteSelectedButton = document.getElementById('deleteSelectedButton');
  const generateUsersButton = document.getElementById('generateUsersButton');
  const csvInput = document.getElementById('csvInput');
  const generationResults = document.getElementById('generationResults');
  const usersContainer = document.getElementById('usersContainer');
  const resultSummary = document.getElementById('resultSummary');

  const filters = {
    userId: document.getElementById('filterUserId'),
    name: document.getElementById('filterName'),
    email: document.getElementById('filterEmail'),
    activeStatus: document.getElementById('filterStatus'),
    dateFrom: document.getElementById('filterDateFrom'),
    dateTo: document.getElementById('filterDateTo'),
    timeFrom: document.getElementById('filterTimeFrom'),
    timeTo: document.getElementById('filterTimeTo'),
  };

  let currentOffset = 0;
  let currentLimit = 25;
  let lastSearchParams = {};
  let visibleUserIds = [];
  let hasMoreUsers = false;

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
    searchUsersButton.addEventListener('click', function() {
      currentOffset = 0;
      searchUsers();
    });
    clearFiltersButton.addEventListener('click', clearFilters);
    prevUsersButton.addEventListener('click', function() {
      currentOffset = Math.max(currentOffset - currentLimit, 0);
      searchUsers(lastSearchParams);
    });
    nextUsersButton.addEventListener('click', function() {
      currentOffset += currentLimit;
      searchUsers(lastSearchParams);
    });
    selectAllButton.addEventListener('click', selectAllVisible);
    enableSelectedButton.addEventListener('click', function() {
      applyBulkActiveState(true);
    });
    disableSelectedButton.addEventListener('click', function() {
      applyBulkActiveState(false);
    });
    deleteSelectedButton.addEventListener('click', deleteSelectedUsers);
    generateUsersButton.addEventListener('click', generateUsers);
    usersContainer.addEventListener('change', updateBulkButtons);
  }

  async function unlockAdmin(isAutomatic) {
    const key = gateAdminKeyInput.value.trim();

    if (!isAutomatic && !key) {
      setGateStatus('Enter the Admin Access Key to unlock user moderation.');
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
      setStatus('Admin session active. Search users or run a bulk action when ready.');
    } catch (error) {
      window.AdminAuth.setSessionToken('');
      adminContent.hidden = true;
      adminGate.hidden = false;
      setGateStatus(error.message || 'Unable to unlock user moderation.');
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
      setGateStatus('User moderation locked.');
    }
  }

  function collectFilters() {
    return {
      userId: filters.userId.value.trim(),
      name: filters.name.value.trim(),
      email: filters.email.value.trim(),
      activeStatus: filters.activeStatus.value,
      dateFrom: filters.dateFrom.value,
      dateTo: filters.dateTo.value,
      timeFrom: filters.timeFrom.value,
      timeTo: filters.timeTo.value,
      limit: currentLimit,
      offset: currentOffset,
    };
  }

  async function searchUsers(existingParams) {
    const params = existingParams || collectFilters();
    lastSearchParams = Object.assign({}, params, {
      offset: currentOffset,
      limit: currentLimit,
    });

    setBusy(searchUsersButton, true);
    setStatus('Searching users...');

    try {
      const result = await window.ApiClient.post(
        'search_users',
        Object.assign(window.AdminAuth.getAuthParams(), lastSearchParams)
      );
      renderUsers(result);
      setStatus('User search completed.');
    } catch (error) {
      handleAuthError(error);
      usersContainer.innerHTML = '<div class="empty-state">' + escapeHtml(error.message || 'Unable to search users.') + '</div>';
    } finally {
      setBusy(searchUsersButton, false);
    }
  }

  async function generateUsers() {
    const csv = csvInput.value.trim();

    if (!csv) {
      setStatus('Paste at least one CSV row before generating QR IDs.');
      return;
    }

    setBusy(generateUsersButton, true);
    setStatus('Generating QR IDs...');

    try {
      const result = await window.ApiClient.post(
        'register_users_from_csv',
        Object.assign(window.AdminAuth.getAuthParams(), {
          csvText: csv,
        }),
        {
          timeoutMs: 120000,
        }
      );
      renderGenerationResults(result);
      setStatus('Bulk add completed. Created: ' + (result.createdCount || 0) + '. Search users to review records.');
    } catch (error) {
      handleAuthError(error);
      setStatus(error.message || 'Unable to generate QR IDs.');
    } finally {
      setBusy(generateUsersButton, false);
    }
  }

  function renderGenerationResults(result) {
    const rows = result && result.results ? result.results : [];

    if (rows.length === 0) {
      generationResults.innerHTML = '<div class="empty-state">No result rows were returned.</div>';
      return;
    }

    generationResults.innerHTML =
      '<div class="table-shell"><table>' +
      '<thead><tr><th>Result</th><th>User ID</th><th>Name</th><th>Email</th><th>Message</th><th>QR File</th></tr></thead>' +
      '<tbody>' +
      rows
        .map(function(item) {
          const badgeClass = item.action === 'created' ? 'badge-created' : 'badge-skipped';
          const linkCell = item.qrFileUrl
            ? '<a class="resource-link" target="_blank" href="' + escapeHtml(item.qrFileUrl) + '">Open QR file</a>'
            : '-';

          return (
            '<tr>' +
            '<td><span class="result-badge ' + badgeClass + '">' + escapeHtml(item.action) + '</span></td>' +
            '<td>' + escapeHtml(item.userId || '-') + '</td>' +
            '<td>' + escapeHtml(item.name || '-') + '</td>' +
            '<td>' + escapeHtml(item.email || '-') + '</td>' +
            '<td>' + escapeHtml(item.message || '-') + '</td>' +
            '<td>' + linkCell + '</td>' +
            '</tr>'
          );
        })
        .join('') +
      '</tbody></table></div>';
  }

  function renderUsers(result) {
    const users = result && result.users ? result.users : [];
    visibleUserIds = users.map(function(user) {
      return user.userId;
    });
    hasMoreUsers = Boolean(result && result.hasMore);
    currentLimit = result && result.limit ? result.limit : currentLimit;

    resultSummary.textContent =
      result && result.ready
        ? 'Showing ' + users.length + ' of ' + result.total + ' matching users.'
        : 'Project setup is not ready yet.';

    prevUsersButton.disabled = currentOffset === 0;
    nextUsersButton.disabled = !hasMoreUsers;

    if (users.length === 0) {
      usersContainer.innerHTML = '<div class="empty-state">No matching users found.</div>';
      updateBulkButtons();
      return;
    }

    usersContainer.innerHTML =
      '<table>' +
      '<thead>' +
      '<tr>' +
      '<th>Select</th>' +
      '<th>User ID</th>' +
      '<th>Name</th>' +
      '<th>Email</th>' +
      '<th>QR Status</th>' +
      '<th>Created At</th>' +
      '<th>QR File</th>' +
      '</tr>' +
      '</thead>' +
      '<tbody>' +
      users
        .map(function(user) {
          const isActive = user.isActive !== false;
          const qrCell = user.qrFileUrl
            ? '<a class="resource-link" target="_blank" href="' + escapeHtml(user.qrFileUrl) + '">Drive link</a>'
            : '-';

          return (
            '<tr>' +
            '<td><input type="checkbox" data-user-id="' + escapeHtml(user.userId) + '"></td>' +
            '<td>' + escapeHtml(user.userId) + '</td>' +
            '<td>' + escapeHtml(user.name) + '</td>' +
            '<td>' + escapeHtml(user.email || '-') + '</td>' +
            '<td><span class="status-pill ' + (isActive ? 'pill-active' : 'pill-inactive') + '">' +
            (isActive ? 'Enabled' : 'Disabled') +
            '</span></td>' +
            '<td>' + escapeHtml(user.createdAt || '-') + '</td>' +
            '<td>' + qrCell + '</td>' +
            '</tr>'
          );
        })
        .join('') +
      '</tbody>' +
      '</table>';
    updateBulkButtons();
  }

  function selectAllVisible() {
    usersContainer.querySelectorAll('input[type="checkbox"][data-user-id]').forEach(function(checkbox) {
      checkbox.checked = true;
    });
    updateBulkButtons();
  }

  function getSelectedUserIds() {
    return Array.from(usersContainer.querySelectorAll('input[type="checkbox"][data-user-id]:checked')).map(function(
      checkbox
    ) {
      return checkbox.getAttribute('data-user-id');
    });
  }

  async function applyBulkActiveState(isActive) {
    const userIds = getSelectedUserIds();

    if (userIds.length === 0) {
      setStatus('Select at least one visible user first.');
      return;
    }

    setBulkBusy(true);
    setStatus((isActive ? 'Enabling' : 'Disabling') + ' selected QR IDs...');

    try {
      const result = await window.ApiClient.post(
        'bulk_set_user_active',
        Object.assign(window.AdminAuth.getAuthParams(), {
          userIds: userIds,
          isActive: isActive,
        })
      );
      setStatus('Bulk update completed. Success: ' + result.successCount + '. Failed: ' + result.failureCount + '.');
      await searchUsers(lastSearchParams);
    } catch (error) {
      handleAuthError(error);
      setStatus(error.message || 'Bulk update failed.');
    } finally {
      setBulkBusy(false);
    }
  }

  async function deleteSelectedUsers() {
    const userIds = getSelectedUserIds();

    if (userIds.length === 0) {
      setStatus('Select at least one visible user first.');
      return;
    }

    if (!window.confirm('Remove ' + userIds.length + ' selected user(s)? Existing attendance logs will be kept.')) {
      return;
    }

    setBulkBusy(true);
    setStatus('Removing selected users...');

    try {
      const result = await window.ApiClient.post(
        'bulk_delete_users',
        Object.assign(window.AdminAuth.getAuthParams(), {
          userIds: userIds,
        })
      );
      setStatus('Bulk removal completed. Success: ' + result.successCount + '. Failed: ' + result.failureCount + '.');
      currentOffset = 0;
      await searchUsers(lastSearchParams);
    } catch (error) {
      handleAuthError(error);
      setStatus(error.message || 'Bulk removal failed.');
    } finally {
      setBulkBusy(false);
    }
  }

  function clearFilters() {
    Object.keys(filters).forEach(function(key) {
      filters[key].value = '';
    });
    currentOffset = 0;
    lastSearchParams = {};
    resultSummary.textContent = 'Filters cleared. Search users when ready.';
  }

  function updateBulkButtons() {
    const selectedCount = getSelectedUserIds().length;
    const hasVisibleUsers = visibleUserIds.length > 0;

    selectAllButton.disabled = !hasVisibleUsers;
    enableSelectedButton.disabled = selectedCount === 0;
    disableSelectedButton.disabled = selectedCount === 0;
    deleteSelectedButton.disabled = selectedCount === 0;
  }

  function setBulkBusy(isBusy) {
    if (!isBusy) {
      updateBulkButtons();
      return;
    }

    enableSelectedButton.disabled = isBusy;
    disableSelectedButton.disabled = isBusy;
    deleteSelectedButton.disabled = isBusy;
    selectAllButton.disabled = isBusy;
  }

  function handleAuthError(error) {
    const message = String(error && error.message ? error.message : '').toLowerCase();

    if (message.indexOf('admin') !== -1 && message.indexOf('session') !== -1) {
      adminContent.hidden = true;
      adminGate.hidden = false;
      setGateStatus('Admin session expired. Unlock user moderation again.');
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
