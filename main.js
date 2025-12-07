const dropArea = document.getElementById('dropArea');
const fileInput = document.getElementById('logFileInput');

const COLORS = {
  CRITICAL: '#e79600', // Orange
  HEAVY: '#cd84cf',    // Purple
  CRIT_HEAVY: '#ffd700', // Gold
  NORMAL: '#ffffff'    // White
};

// Highlight drop area on drag
['dragenter', 'dragover'].forEach(eventName => {
  dropArea.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropArea.classList.add('dragover');
  }, false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropArea.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropArea.classList.remove('dragover');
  }, false);
});

// Handle drop
dropArea.addEventListener('drop', (e) => {
  const files = e.dataTransfer.files;
  if (files.length) {
    Array.from(files).forEach(file => handleFile(file));
  }
});

// Handle click on label or drop area
dropArea.addEventListener('click', (e) => {
  // Prevent duplicate dialog if clicking the label
  if (e.target.tagName !== 'LABEL' && !e.target.closest('label')) {
    fileInput.click();
  }
});

// Handle file input change
fileInput.addEventListener('change', function (event) {
  if (fileInput.files.length) {
    Array.from(fileInput.files).forEach(file => handleFile(file));
  }
});

let uploadedFiles = [];
let activeTarget = null;
let activeSource = 'all';

// Sorting state
let currentSort = 'damage';
let currentSortDesc = true;

function handleFile(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const content = e.target.result;
    const lines = content.split('\n').filter(line => line && !line.startsWith('//'));

    uploadedFiles.push({
      id: Date.now() + Math.random(),
      name: file.name,
      uploadDate: new Date(),
      lines: lines
    });

    // Reset selection on new file to ensure we see data
    activeTarget = null;
    activeSource = 'all';

    updateUI();
  };

  reader.readAsText(file);
}

function removeFile(id) {
  uploadedFiles = uploadedFiles.filter(f => f.id !== id);
  if (uploadedFiles.length === 0) {
    activeTarget = null;
    activeSource = 'all';
  }
  updateUI();
}

function setActiveTarget(target) {
  activeTarget = target;
  activeSource = 'all'; // Reset source when target changes
  updateUI();
}

function setActiveSource(source) {
  activeSource = source;
  updateUI();
}

function changeSort(column) {
  if (currentSort === column) {
    currentSortDesc = !currentSortDesc;
  } else {
    currentSort = column;
    // Default to descending for numbers, ascending for names usually
    currentSortDesc = true;
    if (column === 'name') currentSortDesc = false;
  }
  updateUI();
}

// Graph interaction state
let globalGraphMin = 0;
let globalGraphMax = 0;
let activeTimeRange = null; // { startSeconds, endSeconds } or null
let isDraggingGraph = false;
let dragStartX = 0;
let dragSelectionDiv = null;

// Initialize graph interaction
function initGraphInteraction() {
  const canvas = document.getElementById('dpsGraphCanvas');
  const wrapper = canvas.parentElement;

  // Create overlay if not exists
  if (!dragSelectionDiv) {
    dragSelectionDiv = document.createElement('div');
    dragSelectionDiv.style.position = 'absolute';
    dragSelectionDiv.style.top = '0';
    dragSelectionDiv.style.height = '100%';
    dragSelectionDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    dragSelectionDiv.style.border = '1px solid rgba(255, 255, 255, 0.3)';
    dragSelectionDiv.style.pointerEvents = 'none'; // let clicks pass through (?) No, we need to capture.
    // Actually we capture on wrapper.
    dragSelectionDiv.style.display = 'none';
    wrapper.appendChild(dragSelectionDiv);
  }

  wrapper.onmousedown = (e) => {
    // Only if chart exists
    if (!globalDpsChart) return;
    isDraggingGraph = true;
    const rect = wrapper.getBoundingClientRect();
    dragStartX = e.clientX - rect.left;

    // Use green styling from the start
    dragSelectionDiv.style.backgroundColor = 'rgba(76, 175, 80, 0.15)';
    dragSelectionDiv.style.border = '1px solid #4caf50';
    dragSelectionDiv.style.left = dragStartX + 'px';
    dragSelectionDiv.style.width = '0px';
    dragSelectionDiv.style.display = 'block';

    // Constrain to chart area height
    const chartArea = globalDpsChart.chartArea;
    if (chartArea) {
      dragSelectionDiv.style.top = chartArea.top + 'px';
      dragSelectionDiv.style.height = (chartArea.bottom - chartArea.top) + 'px';
    }
  };

  wrapper.onmousemove = (e) => {
    if (!isDraggingGraph) return;
    const rect = wrapper.getBoundingClientRect();
    const currentX = e.clientX - rect.left;

    // Calculate width and left based on drag
    const width = Math.abs(currentX - dragStartX);
    const left = Math.min(currentX, dragStartX);

    dragSelectionDiv.style.width = width + 'px';
    dragSelectionDiv.style.left = left + 'px';
  };

  wrapper.onmouseup = (e) => {
    if (!isDraggingGraph) return;
    isDraggingGraph = false;
    // Don't hide the div here - let updateOverlayPosition handle it

    const rect = wrapper.getBoundingClientRect();
    const currentX = e.clientX - rect.left;

    // Minimum drag threshold
    if (Math.abs(currentX - dragStartX) < 10) {
      dragSelectionDiv.style.display = 'none';
      return;
    }

    const chartArea = globalDpsChart.chartArea;
    const xScale = globalDpsChart.scales.x;

    // Constrain to chart area
    const startX = Math.max(Math.min(dragStartX, currentX), chartArea.left);
    const endX = Math.min(Math.max(dragStartX, currentX), chartArea.right);

    if (startX >= endX) {
      dragSelectionDiv.style.display = 'none';
      return;
    }

    // Convert pixels to index
    // Note: Since labels are strings 0s, 5s... 
    // getValueForPixel returns current index in labels array.
    const startIndex = xScale.getValueForPixel(startX);
    const endIndex = xScale.getValueForPixel(endX);

    // Convert index to seconds
    const interval = parseInt(document.getElementById('dpsIntervalSelect').value, 10) || 5;

    // Just estimate based on index
    const startSeconds = startIndex * interval;
    const endSeconds = endIndex * interval;

    activeTimeRange = { start: startSeconds, end: endSeconds };
    updateUI();
  };

  wrapper.onmouseleave = () => {
    if (isDraggingGraph) {
      isDraggingGraph = false;
      dragSelectionDiv.style.display = 'none';
    }
  };
}

// Call init once
initGraphInteraction();

function resetGraphFilter() {
  activeTimeRange = null;
  updateUI();
}

function updateUI() {
  const tableContainer = document.getElementById('tableContainer');
  const detailsContainer = document.getElementById('detailsContainer');
  const fileInfoSection = document.getElementById('fileInfoSection');
  const tabsContainer = document.getElementById('targetTabs');
  const sourceSelect = document.getElementById('sourceSelect');

  const targetTabs = document.getElementById('targetTabs');
  const sourceSelectWrapper = document.getElementById('sourceSelectWrapper');

  const dpsGraphSection = document.getElementById('dpsGraphSection');
  const resetBtn = document.getElementById('resetGraphFilterBtn');

  if (activeTimeRange) {
    resetBtn.style.display = 'block';
  } else {
    resetBtn.style.display = 'none';
  }

  if (uploadedFiles.length === 0) {
    tableContainer.style.display = 'none';
    detailsContainer.style.display = 'none';
    fileInfoSection.style.display = 'none';
    targetTabs.style.display = 'none';
    sourceSelectWrapper.style.display = 'none';
    dpsGraphSection.style.display = 'none';
    return;
  }

  // ... (Display blocks)
  tableContainer.style.display = 'block';
  detailsContainer.style.display = 'block';
  fileInfoSection.style.display = 'block';
  targetTabs.style.display = 'block';
  sourceSelectWrapper.style.display = 'block';
  dpsGraphSection.style.display = 'block';

  // 1. Process Data
  // Structure: aggregatedData[target][source] = { skills: {}, minTime: Infinity, maxTime: -Infinity }
  const aggregatedData = {};
  const allSources = new Set();

  // Need to capture global min/max for normalization context found in FIRST pass
  // Actually we need to process all files first to FIND the min/max time for each source.
  // Then we can apply filter.
  // BUT the easiest way is to filter events as we traverse them IF we know the timestamps.
  // Problem: To normalize, we need to know the Source's Start Time relative to Global?
  // Or just Source's Start Time.
  // We can do two passes. Pass 1: Find Min/Max for everyone. Pass 2: Aggregate with Filter.

  // Pass 1: Pre-scan for Source Min Times
  const sourceMinTimes = {}; // target -> source -> minTime

  uploadedFiles.forEach(file => {
    file.lines.forEach(line => {
      const parts = line.split(',');
      if (parts.length < 10) return;
      if (parts[1] !== 'DamageDone') return;
      const timestamp = parts[0];
      const source = parts[8];
      const target = parts[9];

      const t = parseTime(timestamp);

      if (!sourceMinTimes[target]) sourceMinTimes[target] = {};
      if (!sourceMinTimes[target][source]) sourceMinTimes[target][source] = Infinity;
      if (t < sourceMinTimes[target][source]) sourceMinTimes[target][source] = t;
    });
  });

  // Need global min for the active graph context effectively?
  // If "Normalize" is OFF, we need Global Min across all sources to calculate relative time.
  // If "Normalize" is ON, we use Source Min.

  let currentGraphGlobalMin = Infinity;
  // This depends on "activeTarget" which might not be set yet if it's first run?
  // We need to determine aggregation first, then filter? 
  // Standard Approach:
  // 1. Load ALL data into structure.
  // 2. Determine ranges.
  // 3. APPLY filter to create "View Data".
  // 4. Render "View Data".

  // Let's stick closer to existing "single pass" but modify:
  // We can't single pass filter because we don't know MinTime until we see all events?
  // Actually, MinTime is derived from the events themselves.
  // So yes, we need to scan everything to populate `aggregatedData` fully first.

  // ... (Parsing Code - simplified to build FULL structure first)
  // Copied from original logic but removed the filter check here.

  // Helper to parse timestamp
  function parseTime(ts) {
    if (!ts) return 0;
    const year = parseInt(ts.substring(0, 4), 10);
    const month = parseInt(ts.substring(4, 6), 10) - 1;
    const day = parseInt(ts.substring(6, 8), 10);

    const timePart = ts.substring(9);
    const [h, m, s, ms] = timePart.split(':').map(Number);

    return new Date(year, month, day, h, m, s, ms).getTime();
  }

  uploadedFiles.forEach(file => {
    file.lines.forEach(line => {
      const parts = line.split(',');
      if (parts.length < 10) return;

      const [timestamp, eventType, skillName, , damageStr, isCriticalStr, isHeavyStr, , source, target] = parts;

      if (eventType === 'DamageDone') {
        const damage = parseInt(damageStr, 10) || 0;
        const isCritical = parseInt(isCriticalStr, 10) || 0;
        const isHeavy = parseInt(isHeavyStr, 10) || 0;
        const timeVal = parseTime(timestamp);

        if (!aggregatedData[target]) aggregatedData[target] = {};
        if (!aggregatedData[target][source]) aggregatedData[target][source] = { skills: {}, minTime: Infinity, maxTime: -Infinity };

        const sourceData = aggregatedData[target][source];
        if (!sourceData.skills[skillName]) {
          sourceData.skills[skillName] = { damage: 0, hits: 0, criticalHits: 0, heavyHits: 0, events: [] };
        }

        const skill = sourceData.skills[skillName];
        // Don't aggregate stats yet! Just store events?
        // No, current logic aggregates on fly.
        // We will store events and Calculate stats later for the Table.
        // But for "Graph", we need all events anyway.
        // So let's Store Events and Aggregate Totals (for Full View) simultaneously?
        // But Table needs "Filtered Totals".
        // Let's just push events and compute min/max.

        skill.events.push({
          timestamp,
          damage,
          isCritical,
          isHeavy,
          timeVal // store parsed
        });

        if (timeVal < sourceData.minTime) sourceData.minTime = timeVal;
        if (timeVal > sourceData.maxTime) sourceData.maxTime = timeVal;

        allSources.add(source);
      }
    });
  });

  const targets = Object.keys(aggregatedData);
  if (targets.length === 0) return;

  if (!activeTarget || !aggregatedData[activeTarget]) {
    activeTarget = targets[0];
  }

  // --- Determine Graph Global Min for current Target (for non-normalized offset) ---
  const activeTargetData = aggregatedData[activeTarget];
  let targetGlobalMin = Infinity;
  if (activeTargetData) {
    Object.values(activeTargetData).forEach(s => {
      if (s.minTime < targetGlobalMin) targetGlobalMin = s.minTime;
    });
  }
  if (targetGlobalMin === Infinity) targetGlobalMin = 0;

  // --- Filtering Logic for Table & Stats ---
  // We need to generate "Filtered Stats" from the Raw Events

  const normalizeTime = document.getElementById('normalizeTimeChk').checked;

  const getEventTimeSeconds = (eventTime, sourceMin) => {
    // Return seconds relative to start
    if (normalizeTime) {
      return (eventTime - sourceMin) / 1000;
    } else {
      return (eventTime - targetGlobalMin) / 1000;
    }
  };

  const isEventInRange = (eventTime, sourceMin) => {
    if (!activeTimeRange) return true;
    const t = getEventTimeSeconds(eventTime, sourceMin);
    return t >= activeTimeRange.start && t <= activeTimeRange.end;
  };

  // ... (Tabs Rendering - same)
  tabsContainer.innerHTML = '';
  targets.forEach(target => {
    const btn = document.createElement('button');
    btn.className = `tab-button ${target === activeTarget ? 'active' : ''}`;
    btn.textContent = target;
    btn.onclick = () => setActiveTarget(target);
    tabsContainer.appendChild(btn);
  });

  // ... (Source Select Rendering - same)
  const targetSources = Object.keys(aggregatedData[activeTarget]);
  sourceSelect.innerHTML = '<option value="all">All Sources</option>';
  targetSources.forEach(source => {
    const option = document.createElement('option');
    option.value = source;
    option.textContent = source;
    if (source === activeSource) option.selected = true;
    sourceSelect.appendChild(option);
  });
  sourceSelect.onchange = (e) => setActiveSource(e.target.value);

  // ... (Header Sorting - same)
  ['name', 'damage', 'hits', 'crit', 'heavy', 'critHeavy'].forEach(col => {
    const el = document.getElementById(`header-${col}`);
    if (el) {
      el.classList.remove('sort-asc', 'sort-desc');
      if (currentSort === col) {
        el.classList.add(currentSortDesc ? 'sort-desc' : 'sort-asc');
      }
    }
  });

  // 4. Filter Data for Table (Re-implement aggregation based on events + filter)
  const specificData = {};
  let viewTotalDamage = 0;
  let viewTotalHits = 0;
  let viewCriticalHits = 0;
  let viewHeavyHits = 0;
  let viewCritHeavyHits = 0;

  let globalMinTime = Infinity; // For duration calc (filtered)
  let globalMaxTime = -Infinity;

  const sourcesToAggregate = activeSource === 'all' ? targetSources : [activeSource];

  sourcesToAggregate.forEach(source => {
    const sourceData = aggregatedData[activeTarget][source];
    if (!sourceData) return;

    // We used to just take sourceData.minTime. Now we need minTime of FILTERED events.
    // BUT "Combat Time" usually implies span of activity.
    // If we select a range, "Combat Time" is the range duration? Or actual active time in range?
    // Usually range duration.

    Object.entries(sourceData.skills).forEach(([skillName, stats]) => {
      // stats.events has all events
      stats.events.forEach(evt => {
        if (isEventInRange(evt.timeVal, sourceData.minTime)) {
          // Create specificData entry if needed
          if (!specificData[skillName]) {
            specificData[skillName] = { damage: 0, hits: 0, criticalHits: 0, heavyHits: 0, critHeavyHits: 0, events: [] };
          }
          const acc = specificData[skillName];

          acc.damage += evt.damage;
          acc.hits += 1;
          if (evt.isCritical && evt.isHeavy) acc.critHeavyHits++;
          else if (evt.isCritical) acc.criticalHits++;
          else if (evt.isHeavy) acc.heavyHits++;

          acc.events.push(evt);

          viewTotalDamage += evt.damage;
          viewTotalHits++;
          if (evt.isCritical && evt.isHeavy) viewCritHeavyHits++;
          else if (evt.isCritical) viewCriticalHits++;
          else if (evt.isHeavy) viewHeavyHits++;

          if (evt.timeVal < globalMinTime) globalMinTime = evt.timeVal;
          if (evt.timeVal > globalMaxTime) globalMaxTime = evt.timeVal;
        }
      });
    });
  });

  lastCalculatedSpecificData = specificData;

  // Duration
  let durationSeconds = 0;
  if (activeTimeRange) {
    // If range selected, duration is the range size? 
    // Or the time between first and last hit IN that range?
    // Usually "DPS in window" = "Damage in window" / "Window Duration".
    durationSeconds = activeTimeRange.end - activeTimeRange.start;
  } else {
    if (globalMinTime !== Infinity && globalMaxTime !== -Infinity) {
      durationSeconds = (globalMaxTime - globalMinTime) / 1000;
    }
  }
  if (durationSeconds <= 0) durationSeconds = 1;

  const dps = viewTotalDamage / durationSeconds;

  // ... (Table Population - same logic, relies on specificData)
  const tableBody = document.querySelector('#damageTable tbody');
  tableBody.innerHTML = '';

  const sortedSkills = Object.entries(specificData).sort((a, b) => {
    // ... same sort logic ...
    const nameA = a[0]; const statsA = a[1];
    const nameB = b[0]; const statsB = b[1];
    let valA, valB;
    switch (currentSort) {
      case 'name': valA = nameA.toLowerCase(); valB = nameB.toLowerCase(); break;
      case 'damage': valA = statsA.damage; valB = statsB.damage; break;
      case 'hits': valA = statsA.hits; valB = statsB.hits; break;
      case 'crit': valA = statsA.hits > 0 ? statsA.criticalHits / statsA.hits : 0; valB = statsB.hits > 0 ? statsB.criticalHits / statsB.hits : 0; break;
      case 'heavy': valA = statsA.hits > 0 ? statsA.heavyHits / statsA.hits : 0; valB = statsB.hits > 0 ? statsB.heavyHits / statsB.hits : 0; break;
      case 'critHeavy': valA = statsA.hits > 0 ? (statsA.critHeavyHits || 0) / statsA.hits : 0; valB = statsB.hits > 0 ? (statsB.critHeavyHits || 0) / statsB.hits : 0; break;
      default: valA = statsA.damage; valB = statsB.damage;
    }
    if (valA < valB) return currentSortDesc ? 1 : -1;
    if (valA > valB) return currentSortDesc ? -1 : 1;
    return 0;
  });

  sortedSkills.forEach(([skillName, stats]) => {
    const skillDPS = stats.damage / durationSeconds;
    const safeName = skillName.replace(/'/g, "\\'");
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <button class="detail-btn" onclick="openSkillDetails('${safeName}')" title="Details">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
             <circle cx="5" cy="12" r="2" />
             <circle cx="12" cy="12" r="2" />
             <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
      </td>
      <td>${skillName}</td>
      <td>${stats.damage.toLocaleString()}</td>
      <td>${viewTotalDamage > 0 ? ((stats.damage / viewTotalDamage) * 100).toFixed(2) : 0}%</td>
      <td>${stats.hits}</td>
      <td style="color: ${COLORS.CRITICAL};">${stats.hits > 0 ? ((stats.criticalHits / stats.hits) * 100).toFixed(2) : 0}%</td>
      <td style="color: ${COLORS.HEAVY};">${stats.hits > 0 ? ((stats.heavyHits / stats.hits) * 100).toFixed(2) : 0}%</td>
      <td style="color: ${COLORS.CRIT_HEAVY};">${stats.hits > 0 ? (((stats.critHeavyHits || 0) / stats.hits) * 100).toFixed(2) : 0}%</td>
      <td>${skillDPS.toFixed(2)}</td> 
     `;
    tableBody.appendChild(row);
  });

  // ... (Stats Section - same variables)
  const statsSection = document.getElementById('statsSection');
  statsSection.innerHTML = `
    <div class="details-section">
      <h3>Damage Stats (${activeTarget} - ${activeSource})</h3>
      ${activeTimeRange ? `<p style="color:#e91e63;">Filter: ${activeTimeRange.start.toFixed(1)}s - ${activeTimeRange.end.toFixed(1)}s</p>` : ''}
      <p>Total Damage: ${viewTotalDamage.toLocaleString()}</p>
      <p>DPS: <span style="color:#4caf50; font-weight:bold;">${dps.toFixed(2)}</span></p>
      <p>Combat Time: ${durationSeconds.toFixed(1)}s</p>
      <p>Total Hits: ${viewTotalHits}</p>
      <p>Avg Hit: ${viewTotalHits > 0 ? (viewTotalDamage / viewTotalHits).toFixed(2) : 0}</p>
    </div>
    <div class="details-section">
      <h3 style="color: ${COLORS.CRITICAL};">Critical Hits</h3>
      <p style="color: ${COLORS.CRITICAL};">Total: ${viewCriticalHits} (${viewTotalHits > 0 ? ((viewCriticalHits / viewTotalHits) * 100).toFixed(1) : 0}%)</p>
    </div>
     <div class="details-section">
      <h3 style="color: ${COLORS.HEAVY};">Heavy Attacks</h3>
      <p style="color: ${COLORS.HEAVY};">Total: ${viewHeavyHits} (${viewTotalHits > 0 ? ((viewHeavyHits / viewTotalHits) * 100).toFixed(1) : 0}%)</p>
    </div>
    <div class="details-section">
      <h3 style="color: ${COLORS.CRIT_HEAVY};">Critical + Heavy Attacks</h3>
      <p style="color: ${COLORS.CRIT_HEAVY};">Total: ${viewCritHeavyHits} (${viewTotalHits > 0 ? ((viewCritHeavyHits / viewTotalHits) * 100).toFixed(1) : 0}%)</p>
    </div>
  `;

  // 7. Populate File Info Section

  let filesHtml = `
    <div class="details-section">
      <h3>Upload Summary</h3>
      <p>Files: ${uploadedFiles.length}</p>
      <p>Total Players Found: ${allSources.size}</p>
      <div class="file-list" style="margin-top: 15px;">
  `;

  uploadedFiles.forEach(f => {
    const dateStr = f.uploadDate.toLocaleString();
    filesHtml += `
      <div class="file-item" style="display: flex; justify-content: space-between; align-items: center; background: #3e3e4e; padding: 8px; margin-bottom: 5px; border-radius: 4px;">
        <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 10px;">
          <small style="display:block; color: #81c784;">${f.name}</small>
          <small style="color: #aaa;">${dateStr}</small>
        </div>
        <button onclick="removeFile(${f.id})" style="background: #e57373; border: none; color: white; border-radius: 4px; padding: 4px 8px; cursor: pointer;">X</button>
      </div>
    `;
  });
  filesHtml += `</div></div>`;

  fileInfoSection.innerHTML = filesHtml;

  // 8. Render DPS Graph (DPS Over Time for Sources for Active Target)
  const dpsCtx = document.getElementById('dpsGraphCanvas').getContext('2d');
  if (globalDpsChart) globalDpsChart.destroy();

  // Re-calculate Graph Data (using FULL data)
  let graphGlobalMin = Infinity;
  let graphGlobalMax = -Infinity;

  const sourcesData = aggregatedData[activeTarget];
  if (!sourcesData) return;

  const graphSourceNames = Object.keys(sourcesData);

  // Calculate Min/Max for chart axes
  graphSourceNames.forEach(src => {
    const sData = sourcesData[src];
    let effectiveMin = sData.minTime;
    let effectiveMax = sData.maxTime;
    if (!normalizeTime) {
      if (effectiveMin < graphGlobalMin) graphGlobalMin = effectiveMin;
      if (effectiveMax > graphGlobalMax) graphGlobalMax = effectiveMax;
    } else {
      let duration = effectiveMax - effectiveMin;
      if (0 < graphGlobalMin) graphGlobalMin = 0;
      if (duration > graphGlobalMax) graphGlobalMax = duration;
    }
  });

  if (graphGlobalMin === Infinity) return;

  const dpsIntervalVal = parseInt(document.getElementById('dpsIntervalSelect').value, 10) || 5;
  const BUCKET_SIZE_MS = dpsIntervalVal * 1000;
  const durationMs = graphGlobalMax - graphGlobalMin;
  const bucketsCount = Math.ceil(durationMs / BUCKET_SIZE_MS) + 1;
  const labels = Array.from({ length: bucketsCount }, (_, i) => (i * dpsIntervalVal) + 's');

  const datasets = [];
  const palette = ['#4caf50', '#2196f3', '#ff9800', '#e91e63', '#9c27b0', '#00bcd4', '#cddc39', '#795548', '#607d8b'];

  graphSourceNames.forEach((src, idx) => {
    // ... build buckets (same logic) ...
    const buckets = new Array(bucketsCount).fill(0);
    const sData = sourcesData[src];
    const sStartTime = sData.minTime;

    Object.values(sData.skills).forEach(skill => {
      if (!skill.events) return;
      skill.events.forEach(e => {
        // We need parseTime again? or use e.timeVal
        // e.timestamp is string. we pushed timeVal to events earlier!
        const timeVal = parseTime(e.timestamp); // or use e.timeVal if available

        let offsetMs;
        if (normalizeTime) offsetMs = timeVal - sStartTime;
        else offsetMs = timeVal - graphGlobalMin;

        const bucketIdx = Math.floor(offsetMs / BUCKET_SIZE_MS);
        if (bucketIdx >= 0 && bucketIdx < bucketsCount) {
          buckets[bucketIdx] += e.damage;
        }
      });
    });

    const dpsData = buckets.map(val => val / (BUCKET_SIZE_MS / 1000));
    const color = palette[idx % palette.length];
    datasets.push({
      label: src,
      data: dpsData,
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      fill: false,
      tension: 0.3
    });
  });

  // Add Annotation for Selection Area?
  // We can use the 'annotation' plugin if available, but we don't have it.
  // We can use a background color on the chart area?
  // Or just rely on the Overlay Div?
  // If we rely on Overlay Div, we need to map activeTimeRange back to Pixels.
  // We will do that in 'onAfterRender' or just reposition the div?
  // Actually, keeping the overlay div VISIBLE after selection is good feedback.

  globalDpsChart = new Chart(dpsCtx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 0,
        onComplete: function () {
          updateOverlayPosition();
        }
      },
      interaction: {
        mode: 'index',
        intersect: false,
      },
      scales: {
        x: {
          grid: { display: false, color: '#444' },
          ticks: { color: '#aaa', maxTicksLimit: 20 }
        },
        y: {
          beginAtZero: true,
          grid: { color: '#333' },
          ticks: { color: '#aaa' },
          title: { display: true, text: 'Damage / Sec', color: '#666' }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { color: '#ccc' }
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              return context.dataset.label + ': ' + context.parsed.y.toLocaleString();
            }
          }
        }
      }
    }
  });

  // Also try immediately (deferred)
  setTimeout(updateOverlayPosition, 50);
}

function updateOverlayPosition() {
  if (!activeTimeRange || !globalDpsChart || !dragSelectionDiv) {
    if (dragSelectionDiv && !isDraggingGraph) dragSelectionDiv.style.display = 'none';
    return;
  }

  if (isDraggingGraph) return;

  const xScale = globalDpsChart.scales.x;
  if (!xScale) return;

  const dpsIntervalVal = parseInt(document.getElementById('dpsIntervalSelect').value, 10) || 5;

  const startIndex = activeTimeRange.start / dpsIntervalVal;
  const endIndex = activeTimeRange.end / dpsIntervalVal;

  const startPixel = xScale.getPixelForValue(startIndex);
  const endPixel = xScale.getPixelForValue(endIndex);

  let left = Math.min(startPixel, endPixel);
  let width = Math.abs(endPixel - startPixel);

  if (!isNaN(left) && !isNaN(width)) {
    const chartArea = globalDpsChart.chartArea;

    // Constrain to chart area
    if (chartArea) {
      // Clamp left to chartArea
      if (left < chartArea.left) {
        width -= (chartArea.left - left);
        left = chartArea.left;
      }
      // Clamp width
      if (left + width > chartArea.right) {
        width = chartArea.right - left;
      }

      dragSelectionDiv.style.top = chartArea.top + 'px';
      dragSelectionDiv.style.height = (chartArea.bottom - chartArea.top) + 'px';
    } else {
      dragSelectionDiv.style.top = '0';
      dragSelectionDiv.style.height = '100%';
    }

    if (width < 0) width = 0;

    dragSelectionDiv.style.left = left + 'px';
    dragSelectionDiv.style.width = width + 'px';
    dragSelectionDiv.style.display = 'block';
    dragSelectionDiv.style.backgroundColor = 'rgba(76, 175, 80, 0.2)';
    dragSelectionDiv.style.border = '1px solid #4caf50';
  }
}

// Checkbox event listener
document.getElementById('normalizeTimeChk').addEventListener('change', updateUI);
document.getElementById('dpsIntervalSelect').addEventListener('change', updateUI);

let globalDpsChart = null;

// Modal Functions
let lastCalculatedSpecificData = {};

let modalSortCol = 'time';
let modalSortDesc = false;
let activeModalSkill = null;

function changeModalSort(column) {
  if (modalSortCol === column) {
    modalSortDesc = !modalSortDesc;
  } else {
    modalSortCol = column;
    modalSortDesc = true;
    // Default time to ascending though?
    if (column === 'time') modalSortDesc = false;
  }
  renderModalTable();
}

function openSkillDetails(skillName) {
  const modal = document.getElementById('skillModal');
  const modalTitle = document.getElementById('modalSkillName');

  modalTitle.textContent = `${skillName} - Details`;
  activeModalSkill = skillName;

  // Default sort when opening
  modalSortCol = 'time';
  modalSortDesc = false;

  renderModalTable();
  modal.style.display = 'flex';
}

function renderModalTable() {
  const tbody = document.getElementById('skillEventsTable');
  tbody.innerHTML = '';

  const skillData = lastCalculatedSpecificData[activeModalSkill];
  if (!skillData || !skillData.events) return;

  // Sorting
  const sortedEvents = [...skillData.events].sort((a, b) => {
    let valA, valB;

    switch (modalSortCol) {
      case 'time':
        valA = a.timestamp;
        valB = b.timestamp;
        break;
      case 'damage':
        valA = a.damage;
        valB = b.damage;
        break;
      case 'type':
        // Assign weight: Normal=0, Heavy=1, Crit=2, CritHeavy=3
        const getWeight = (e) => {
          if (e.isCritical && e.isHeavy) return 3;
          if (e.isCritical) return 2;
          if (e.isHeavy) return 1;
          return 0;
        }
        valA = getWeight(a);
        valB = getWeight(b);
        break;
      default:
        valA = a.timestamp;
        valB = b.timestamp;
    }

    if (valA < valB) return modalSortDesc ? 1 : -1;
    if (valA > valB) return modalSortDesc ? -1 : 1;
    return 0;
  });

  let index = 1;
  sortedEvents.forEach(evt => {
    const row = document.createElement('tr');

    // Determine type label and color
    let typeLabel = 'Normal';
    let typeColor = '#fff';

    if (evt.isCritical && evt.isHeavy) {
      typeLabel = 'Crit + Heavy';
      typeColor = COLORS.CRIT_HEAVY;
    } else if (evt.isCritical) {
      typeLabel = 'Critical';
      typeColor = COLORS.CRITICAL;
    } else if (evt.isHeavy) {
      typeLabel = 'Heavy';
      typeColor = COLORS.HEAVY;
    }

    // Formatting timestamp shorter: starting from HH:MM:SS
    const timeDisplay = evt.timestamp ? evt.timestamp.split('-')[1] : '-';

    row.innerHTML = `
      <td>${timeDisplay}</td>
      <td>${evt.damage.toLocaleString()}</td>
      <td style="color: ${typeColor};">${typeLabel}</td>
    `;
    tbody.appendChild(row);
  });

  // Update header classes
  ['time', 'damage', 'type'].forEach(col => {
    const el = document.getElementById(`modal-header-${col}`);
    if (el) {
      el.className = ''; // Reset
      if (modalSortCol === col) {
        el.className = modalSortDesc ? 'sort-desc' : 'sort-asc';
      }
    }
  });
}

// Modal View Switching
let modalViewMode = 'table'; // 'table' or 'graph'
let skillChart = null;

function switchModalView(mode) {
  modalViewMode = mode;

  const tableView = document.getElementById('modalTableView');
  const graphView = document.getElementById('modalGraphView');
  const btnTable = document.getElementById('btn-view-table');
  const btnGraph = document.getElementById('btn-view-graph');

  if (mode === 'table') {
    tableView.style.display = 'block';
    graphView.style.display = 'none';
    btnTable.classList.add('active');
    btnGraph.classList.remove('active');
  } else {
    tableView.style.display = 'none';
    graphView.style.display = 'block';
    btnTable.classList.remove('active');
    btnGraph.classList.add('active');
    renderModalGraph();
  }
}

function renderModalGraph() {
  const ctx = document.getElementById('skillGraphCanvas').getContext('2d');
  const skillData = lastCalculatedSpecificData[activeModalSkill];

  if (skillChart) {
    skillChart.destroy();
  }

  if (!skillData || !skillData.events.length) return;

  // Sort by time for graph
  const events = [...skillData.events].sort((a, b) => {
    if (a.timestamp < b.timestamp) return -1;
    if (a.timestamp > b.timestamp) return 1;
    return 0;
  });

  const labels = events.map(e => e.timestamp ? e.timestamp.split('-')[1] : '');
  const dataPoints = events.map(e => e.damage);
  const pointColors = events.map(e => {
    if (e.isCritical && e.isHeavy) return COLORS.CRIT_HEAVY; // Gold
    if (e.isCritical) return COLORS.CRITICAL; // Orange
    if (e.isHeavy) return COLORS.HEAVY; // Purple
    return COLORS.NORMAL; // White
  });

  // Create a gradient for the line
  // Not strictly needed but looks nice. 
  // Simple line chart

  skillChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Damage',
        data: dataPoints,
        borderColor: '#4caf50',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        borderWidth: 1,
        pointBackgroundColor: pointColors,
        pointBorderWidth: 0,
        pointRadius: 3,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                label += context.parsed.y.toLocaleString();
              }
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          display: false // Hide X axis labels if too many? Or keep them.
        },
        y: {
          beginAtZero: true,
          grid: { color: '#444' },
          ticks: { color: '#aaa' }
        }
      }
    }
  });
}

function closeModal() {
  document.getElementById('skillModal').style.display = 'none';
  if (skillChart) {
    skillChart.destroy();
    skillChart = null;
  }
}

window.onclick = function (event) {
  const modal = document.getElementById('skillModal');
  if (event.target == modal) {
    closeModal();
  }
}