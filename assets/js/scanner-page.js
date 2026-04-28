(function() {
  let html5QrCode = null;
  let isScanning = false;
  let isStarting = false;
  let isProcessing = false;
  let activeCameraId = '';
  let lastClientScanText = '';
  let lastClientScanAt = 0;
  let lastCameraLabel = '';

  const CLIENT_SCAN_COOLDOWN_MS = 1800;
  const clockTime = document.getElementById('clockTime');
  const statusBanner = document.getElementById('statusBanner');
  const startButton = document.getElementById('startButton');
  const stopButton = document.getElementById('stopButton');
  const cameraSelect = document.getElementById('cameraSelect');
  const projectStatus = document.getElementById('projectStatus');
  const lastScanResult = document.getElementById('lastScanResult');
  const lastUserName = document.getElementById('lastUserName');
  const lastTimestamp = document.getElementById('lastTimestamp');

  document.addEventListener('DOMContentLoaded', function() {
    html5QrCode = new Html5Qrcode('reader');
    bindEvents();
    tickClock();
    window.setInterval(tickClock, 1000);
    loadProjectStatus();
  });

  function bindEvents() {
    startButton.addEventListener('click', function() {
      startScanner();
    });

    stopButton.addEventListener('click', stopScanner);

    cameraSelect.addEventListener('change', function() {
      lastCameraLabel = getSelectedCameraLabel_();

      if (isScanning && cameraSelect.value && cameraSelect.value !== activeCameraId) {
        switchCamera(cameraSelect.value);
      }
    });
  }

  function tickClock() {
    clockTime.textContent = new Intl.DateTimeFormat([], {
      dateStyle: 'medium',
      timeStyle: 'medium',
    }).format(new Date());
  }

  async function loadProjectStatus() {
    try {
      const status = await window.ApiClient.get('status');

      if (!status.ready) {
        projectStatus.textContent = 'Setup pending. Open the admin page and run Bootstrap Project.';
        setBanner('Project setup is incomplete. Use the admin page first.', 'warning');
        return;
      }

      projectStatus.textContent =
        'Ready. Duplicate window: ' + status.duplicateWindowSeconds + ' seconds. Time zone: ' + status.timeZone + '.';
      setBanner('Backend is ready. Start the scanner when you are near a QR code.', 'info');
    } catch (error) {
      projectStatus.textContent = 'Unable to read project status.';
      setBanner(error.message || 'Unable to load project status.', 'warning');
    }
  }

  async function startScanner(preferredCameraId) {
    if (isStarting || isScanning) {
      return;
    }

    isStarting = true;
    startButton.disabled = true;
    cameraSelect.disabled = true;
    setBanner('Requesting camera access...', 'info');

    try {
      const cameras = await loadCameraOptions_(preferredCameraId);
      const selectedCameraId = resolveCameraId_(cameras, preferredCameraId);

      if (!selectedCameraId) {
        throw new Error('No camera was detected on this device.');
      }

      cameraSelect.value = selectedCameraId;
      lastCameraLabel = getSelectedCameraLabel_();
      await startScannerSession_(selectedCameraId);

      isScanning = true;
      stopButton.disabled = false;
      cameraSelect.disabled = false;
      setBanner('Scanner is live. Hold the QR steady inside the frame.', 'success');
    } catch (error) {
      setBanner(resolveCameraMessage(error), 'warning');
      startButton.disabled = false;
      stopButton.disabled = true;
      cameraSelect.disabled = true;
      if (!cameraSelect.options.length) {
        cameraSelect.innerHTML = '<option value="">Camera unavailable</option>';
      }
    } finally {
      isStarting = false;
    }
  }

  async function switchCamera(cameraId) {
    if (!cameraId || !isScanning || isStarting || cameraId === activeCameraId) {
      return;
    }

    isStarting = true;
    stopButton.disabled = true;
    cameraSelect.disabled = true;
    setBanner('Switching camera source...', 'info');

    const previousCameraId = activeCameraId;

    try {
      await stopScannerSession_();
      isScanning = false;
      await startScannerSession_(cameraId);
      isScanning = true;
      lastCameraLabel = getSelectedCameraLabel_();
      setBanner('Camera source updated successfully.', 'success');
    } catch (error) {
      isScanning = false;

      if (previousCameraId) {
        try {
          cameraSelect.value = previousCameraId;
          await startScannerSession_(previousCameraId);
          isScanning = true;
          lastCameraLabel = getSelectedCameraLabel_();
          setBanner('Could not switch cameras. The previous camera source was restored.', 'warning');
        } catch (restoreError) {
          activeCameraId = '';
          cameraSelect.value = '';
          lastCameraLabel = '';
          setBanner(resolveCameraMessage(error), 'warning');
        }
      } else {
        activeCameraId = '';
        cameraSelect.value = '';
        lastCameraLabel = '';
        setBanner(resolveCameraMessage(error), 'warning');
      }
    } finally {
      isStarting = false;
      startButton.disabled = isScanning;
      stopButton.disabled = !isScanning;
      cameraSelect.disabled = !isScanning;
    }
  }

  async function stopScanner() {
    if (!html5QrCode || !isScanning) {
      return;
    }

    await stopScannerSession_();
    isScanning = false;
    isProcessing = false;
    activeCameraId = '';
    startButton.disabled = false;
    stopButton.disabled = true;
    cameraSelect.disabled = true;
    setBanner('Scanner stopped.', 'neutral');
  }

  async function onScanSuccess(decodedText) {
    const now = Date.now();

    if (isProcessing) {
      return;
    }

    if (decodedText === lastClientScanText && now - lastClientScanAt < CLIENT_SCAN_COOLDOWN_MS) {
      return;
    }

    isProcessing = true;
    lastClientScanText = decodedText;
    lastClientScanAt = now;
    setBanner('QR detected. Validating against Google Sheets...', 'info');

    try {
      const response = await window.ApiClient.post('process_scan', {
        rawQrText: decodedText,
        scannerContext: {
          cameraLabel: lastCameraLabel,
          userAgent: navigator.userAgent,
        },
      });
      renderScanResponse(response);
    } catch (error) {
      setBanner(error.message || 'Unable to reach the backend.', 'warning');
      lastScanResult.textContent = 'Server communication failed.';
    } finally {
      isProcessing = false;
    }
  }

  function renderScanResponse(response) {
    if (!response || !response.ok) {
      const message = response && response.message ? response.message : 'Scan rejected.';
      setBanner(message, 'warning');
      lastScanResult.textContent = response && response.code ? response.code : 'SCAN_REJECTED';
      lastUserName.textContent = 'No valid user logged.';
      lastTimestamp.textContent = new Date().toLocaleString();
      return;
    }

    const statusMarkup =
      '<span class="scan-pill ' + (response.status === 'IN' ? 'pill-in' : 'pill-out') + '">' + response.status + '</span>';

    setBanner(response.message, 'success');
    lastScanResult.innerHTML = statusMarkup + ' ' + escapeHtml(response.code);
    lastUserName.textContent = response.name + ' (' + response.userId + ')';
    lastTimestamp.textContent = new Date(response.timestampIso).toLocaleString();
  }

  async function loadCameraOptions_(preferredCameraId) {
    const cameras = await Html5Qrcode.getCameras();

    if (!cameras || cameras.length === 0) {
      throw new Error('No camera was detected on this device.');
    }

    cameraSelect.innerHTML = cameras
      .map(function(camera) {
        return '<option value="' + escapeHtml(camera.id) + '">' + escapeHtml(camera.label || 'Unnamed camera') + '</option>';
      })
      .join('');

    cameraSelect.disabled = false;
    cameraSelect.value = resolveCameraId_(cameras, preferredCameraId);

    return cameras;
  }

  function resolveCameraId_(cameras, preferredCameraId) {
    if (preferredCameraId) {
      const matchingCamera = cameras.find(function(camera) {
        return camera.id === preferredCameraId;
      });

      if (matchingCamera) {
        return matchingCamera.id;
      }
    }

    return cameras[0] ? cameras[0].id : '';
  }

  async function startScannerSession_(cameraId) {
    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode('reader');
    }

    await html5QrCode.start(
      cameraId,
      {
        fps: 10,
        qrbox: function(viewfinderWidth, viewfinderHeight) {
          const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.72);
          return { width: edge, height: edge };
        },
        aspectRatio: 1,
      },
      onScanSuccess,
      function() {}
    );

    activeCameraId = cameraId;
  }

  async function stopScannerSession_() {
    if (!html5QrCode) {
      return;
    }

    try {
      await html5QrCode.stop();
    } catch (error) {
      // Ignore stop errors so the UI still recovers.
    }

    try {
      await html5QrCode.clear();
    } catch (error) {
      // Ignore clear errors so the UI still recovers.
    }

    html5QrCode = new Html5Qrcode('reader');
  }

  function getSelectedCameraLabel_() {
    return cameraSelect.options[cameraSelect.selectedIndex]
      ? cameraSelect.options[cameraSelect.selectedIndex].text
      : '';
  }

  function setBanner(message, tone) {
    statusBanner.className = 'status-banner';
    const toneClass = {
      neutral: 'tone-neutral',
      info: 'tone-info',
      success: 'tone-success',
      warning: 'tone-warning',
    }[tone] || 'tone-neutral';

    statusBanner.classList.add(toneClass);
    statusBanner.textContent = message;
  }

  function resolveCameraMessage(error) {
    const raw = String(error && error.message ? error.message : error || '').toLowerCase();

    if (raw.indexOf('permission') !== -1) {
      return 'Camera access was blocked. Allow camera permission and try again.';
    }

    if (raw.indexOf('notfound') !== -1 || raw.indexOf('no camera') !== -1) {
      return 'No usable camera was found on this device.';
    }

    if (raw.indexOf('secure') !== -1) {
      return 'The browser requires a secure context for camera access.';
    }

    return error && error.message ? error.message : 'Unable to start the camera scanner.';
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
