/**
 * Stopwatch - Application Controller
 * High-accuracy time calculation, stats aggregation, synthesized sound effects,
 * keyboard controls, and local storage persistence.
 */

// ==========================================================================
// STATE MANAGEMENT
// ==========================================================================
const state = {
  isRunning: false,
  startTime: 0,       // Unix timestamp (Date.now()) when timer started/resumed
  elapsedTime: 0,     // Total accumulated ms when stopwatch is paused
  laps: [],           // Array of lap objects: { id: number, lapTime: number, splitTime: number }
  activeTheme: 'midnight',
  soundOn: true
};

const STORAGE_KEY = 'stopwatch_state';

// ==========================================================================
// DOM ELEMENT CACHE
// ==========================================================================
const timeMainEl = document.getElementById('time-main');
const timeMsEl = document.getElementById('time-ms');
const progressIndicator = document.getElementById('progress-indicator');

const btnPlayPause = document.getElementById('btn-play-pause');
const btnReset = document.getElementById('btn-reset');
const btnLap = document.getElementById('btn-lap');
const labelPlayPause = document.getElementById('label-play-pause');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');

const valTotalLaps = document.getElementById('val-total-laps');
const valAvgLap = document.getElementById('val-avg-lap');
const valFastestLap = document.getElementById('val-fastest-lap');
const valSlowestLap = document.getElementById('val-slowest-lap');

const lapsCountBadge = document.getElementById('laps-count');
const lapsList = document.getElementById('laps-list');
const btnThemeMenu = document.getElementById('btn-theme-menu');
const themeDropdown = document.getElementById('theme-dropdown');
const btnSoundToggle = document.getElementById('btn-sound-toggle');
const iconSoundOn = btnSoundToggle.querySelector('.icon-sound-on');
const iconSoundOff = btnSoundToggle.querySelector('.icon-sound-off');

// Animation frame ID
let animationFrameId = null;

// Audio Context (lazily loaded)
let audioCtx = null;

// ==========================================================================
// TIME HELPER FUNCTIONS
// ==========================================================================

/**
 * Pad a number with leading zeros
 * @param {number} num - Number to pad
 * @param {number} size - Desired string size
 * @returns {string} Padded string
 */
function pad(num, size = 2) {
  let s = num.toString();
  while (s.length < size) s = "0" + s;
  return s;
}

/**
 * Format milliseconds into HH:MM:SS
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted string
 */
function formatMainTime(ms) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Format milliseconds into .CC (centiseconds)
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted string starting with a dot
 */
function formatMsTime(ms) {
  const centiseconds = Math.floor((ms % 1000) / 10);
  return `.${pad(centiseconds)}`;
}

/**
 * Full format helper (e.g. for table output: MM:SS.CC or HH:MM:SS.CC)
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted lap time
 */
function formatFullTime(ms) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centiseconds = Math.floor((ms % 1000) / 10);
  
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(centiseconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}.${pad(centiseconds)}`;
}

// ==========================================================================
// AUDIO SYNTHESIZER
// ==========================================================================

/**
 * Initialize Audio Context securely
 */
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

/**
 * Plays a short synthetic click sound
 * @param {number} type - Pitch variation (1 = start/pause, 2 = lap, 3 = reset)
 */
function playClickSound(type = 1) {
  if (!state.soundOn) return;
  
  try {
    initAudio();
    if (!audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    // Choose tone pitch and type based on actions
    let frequency = 1000;
    let duration = 0.05; // very fast click
    
    if (type === 1) {
      // Play / Pause click
      frequency = state.isRunning ? 900 : 1200;
      osc.type = 'sine';
    } else if (type === 2) {
      // Lap record click
      frequency = 1500;
      osc.type = 'sine';
      duration = 0.04;
    } else if (type === 3) {
      // Reset sound (descending chirp)
      frequency = 600;
      osc.type = 'triangle';
      duration = 0.12;
    }

    osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    if (type === 3) {
      // Sweeping frequency downwards
      osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + duration);
    }

    // Set gain curve to avoid pops
    gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {
    console.warn("Audio Context playback failed or blocked", e);
  }
}

// ==========================================================================
// RENDER LOOP & PROGRESS RING
// ==========================================================================

/**
 * Core loop that executes on every display frame
 */
function updateTimer() {
  const currentTotalMs = state.isRunning 
    ? Date.now() - state.startTime 
    : state.elapsedTime;
  
  // Render digital clock digits
  timeMainEl.textContent = formatMainTime(currentTotalMs);
  timeMsEl.textContent = formatMsTime(currentTotalMs);
  
  // Update progress ring sweep
  // The progress indicator completes a loop every 60 seconds
  const progress = (currentTotalMs % 60000) / 60000;
  
  // Dynamically calculate radius to account for layout updates (responsive)
  const radius = progressIndicator.r.baseVal.value;
  const circumference = 2 * Math.PI * radius;
  
  progressIndicator.style.strokeDasharray = circumference;
  progressIndicator.style.strokeDashoffset = circumference * (1 - progress);
  
  if (state.isRunning) {
    animationFrameId = requestAnimationFrame(updateTimer);
  }
}

// ==========================================================================
// STOPWATCH OPERATIONS
// ==========================================================================

function startTimer() {
  if (state.isRunning) return;
  
  state.isRunning = true;
  // Offset the start time by what was already elapsed before pausing
  state.startTime = Date.now() - state.elapsedTime;
  
  // Toggle controls
  btnReset.disabled = false;
  btnLap.disabled = false;
  
  // Change start button state to Pause
  labelPlayPause.textContent = 'Pause';
  iconPlay.classList.add('hidden');
  iconPause.classList.remove('hidden');
  btnPlayPause.classList.add('active');
  
  // Start render loop
  animationFrameId = requestAnimationFrame(updateTimer);
  
  saveState();
}

function pauseTimer() {
  if (!state.isRunning) return;
  
  state.isRunning = false;
  state.elapsedTime = Date.now() - state.startTime;
  
  // Stop render loop
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  
  // Change buttons
  labelPlayPause.textContent = 'Resume';
  iconPlay.classList.remove('hidden');
  iconPause.classList.add('hidden');
  btnPlayPause.classList.remove('active');
  
  // Trigger static visual update to make sure everything matches
  updateTimer();
  
  saveState();
}

function handlePlayPause() {
  initAudio();
  if (state.isRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
  playClickSound(1);
}

function recordLap() {
  if (!state.isRunning && state.elapsedTime === 0) return;
  
  initAudio();
  playClickSound(2);
  
  const currentTotalMs = state.isRunning 
    ? Date.now() - state.startTime 
    : state.elapsedTime;
    
  // Calculate lap duration: difference between this split time and previous lap split time
  const lastSplitTime = state.laps.length > 0 ? state.laps[0].splitTime : 0;
  const lapTime = currentTotalMs - lastSplitTime;
  
  const newLapObj = {
    id: state.laps.length + 1,
    lapTime: lapTime,
    splitTime: currentTotalMs
  };
  
  // Add to front of state list so newest is display-first
  state.laps.unshift(newLapObj);
  
  renderLaps();
  updateStats();
  saveState();
}

function resetTimer() {
  initAudio();
  playClickSound(3);
  
  state.isRunning = false;
  state.elapsedTime = 0;
  state.startTime = 0;
  state.laps = [];
  
  // Cancel frame updates
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  
  // Reset buttons to original state
  btnReset.disabled = true;
  btnLap.disabled = true;
  labelPlayPause.textContent = 'Start';
  iconPlay.classList.remove('hidden');
  iconPause.classList.add('hidden');
  btnPlayPause.classList.remove('active');
  
  // Reset Displays
  timeMainEl.textContent = "00:00:00";
  timeMsEl.textContent = ".00";
  
  // Reset Progress Ring
  const radius = progressIndicator.r.baseVal.value;
  const circumference = 2 * Math.PI * radius;
  progressIndicator.style.strokeDashoffset = circumference;
  
  renderLaps();
  updateStats();
  saveState();
}

// ==========================================================================
// STATISTICS & LAP UI RENDERING
// ==========================================================================

/**
 * Render the lap rows into the DOM table
 */
function renderLaps() {
  if (state.laps.length === 0) {
    // Show empty state
    lapsList.innerHTML = `
      <tr class="empty-state-row">
        <td colspan="3" class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="empty-icon"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <p>Start the stopwatch and record laps to visualize data</p>
        </td>
      </tr>
    `;
    lapsCountBadge.textContent = "No Laps";
    return;
  }
  
  lapsCountBadge.textContent = `${state.laps.length} ${state.laps.length === 1 ? 'Lap' : 'Laps'}`;
  
  // Identify fastest and slowest lap IDs to style them (highlight if at least 2 laps exist)
  let fastestLapId = -1;
  let slowestLapId = -1;
  
  if (state.laps.length >= 2) {
    let minLap = Infinity;
    let maxLap = -Infinity;
    
    state.laps.forEach(lap => {
      if (lap.lapTime < minLap) {
        minLap = lap.lapTime;
        fastestLapId = lap.id;
      }
      if (lap.lapTime > maxLap) {
        maxLap = lap.lapTime;
        slowestLapId = lap.id;
      }
    });
  }
  
  // Rebuild the HTML content
  let listHtml = "";
  state.laps.forEach(lap => {
    let extraClass = "";
    let statusLabel = "";
    
    if (lap.id === fastestLapId) {
      extraClass = "lap-row-fastest";
      statusLabel = ' <span class="txt-fastest" style="font-size:0.7rem; font-weight:700; margin-left:6px; letter-spacing:0.5px;">(FASTEST)</span>';
    } else if (lap.id === slowestLapId) {
      extraClass = "lap-row-slowest";
      statusLabel = ' <span class="txt-slowest" style="font-size:0.7rem; font-weight:700; margin-left:6px; letter-spacing:0.5px;">(SLOWEST)</span>';
    }
    
    listHtml += `
      <tr class="${extraClass}">
        <td>Lap ${lap.id}${statusLabel}</td>
        <td class="font-mono">${formatFullTime(lap.lapTime)}</td>
        <td class="font-mono">${formatFullTime(lap.splitTime)}</td>
      </tr>
    `;
  });
  
  lapsList.innerHTML = listHtml;
}

/**
 * Calculate live statistics (min, max, average) and paint stats cards
 */
function updateStats() {
  if (state.laps.length === 0) {
    valTotalLaps.textContent = "0";
    valAvgLap.textContent = "--:--.--";
    valFastestLap.textContent = "--:--.--";
    valSlowestLap.textContent = "--:--.--";
    return;
  }
  
  const lapCount = state.laps.length;
  valTotalLaps.textContent = lapCount;
  
  // Summing up times
  let totalLapMs = 0;
  let minLap = Infinity;
  let maxLap = -Infinity;
  
  state.laps.forEach(lap => {
    totalLapMs += lap.lapTime;
    if (lap.lapTime < minLap) minLap = lap.lapTime;
    if (lap.lapTime > maxLap) maxLap = lap.lapTime;
  });
  
  const avgLapTime = totalLapMs / lapCount;
  
  valAvgLap.textContent = formatFullTime(avgLapTime);
  valFastestLap.textContent = formatFullTime(minLap);
  valSlowestLap.textContent = formatFullTime(maxLap);
}

// ==========================================================================
// THEMING IMPLEMENTATION
// ==========================================================================

/**
 * Transition the app class selector to another style preset
 * @param {string} themeName - 'midnight' | 'cyberpunk' | 'emerald' | 'sunset'
 */
function applyTheme(themeName) {
  const body = document.body;
  
  // Clean classes
  body.classList.remove('theme-midnight', 'theme-cyberpunk', 'theme-emerald', 'theme-sunset');
  body.classList.add(`theme-${themeName}`);
  
  // Toggle selection markers in UI
  const themeOptions = document.querySelectorAll('.theme-opt');
  themeOptions.forEach(opt => {
    if (opt.getAttribute('data-theme') === themeName) {
      opt.classList.add('active');
    } else {
      opt.classList.remove('active');
    }
  });
  
  state.activeTheme = themeName;
  saveState();
  
  // Refresh SVG static state styles (color bindings)
  if (!state.isRunning) {
    updateTimer();
  }
}

// ==========================================================================
// LOCAL STORAGE PERSISTENCE
// ==========================================================================

function saveState() {
  const serializable = {
    elapsedTime: state.elapsedTime,
    isRunning: state.isRunning,
    startTime: state.startTime,
    laps: state.laps,
    activeTheme: state.activeTheme,
    soundOn: state.soundOn
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    // Set default initial theme
    applyTheme('midnight');
    return;
  }
  
  try {
    const loaded = JSON.parse(raw);
    
    state.elapsedTime = loaded.elapsedTime || 0;
    state.isRunning = loaded.isRunning || false;
    state.startTime = loaded.startTime || 0;
    state.laps = loaded.laps || [];
    state.activeTheme = loaded.activeTheme || 'midnight';
    state.soundOn = loaded.soundOn !== undefined ? loaded.soundOn : true;
    
    // Apply UI Themes
    applyTheme(state.activeTheme);
    
    // Set up sound icon state
    updateSoundIcons();
    
    // Restore logic state
    if (state.isRunning) {
      // Calculate how long it was running while page was closed
      // Wall clock timer adjustment:
      // Current elapsed time should include the downtime if it was running.
      // But wait! If we do this, it will immediately jump to catch up. 
      // This is ideal behavior because it tracks absolute time interval correctly.
      
      // Toggle controls
      btnReset.disabled = false;
      btnLap.disabled = false;
      labelPlayPause.textContent = 'Pause';
      iconPlay.classList.add('hidden');
      iconPause.classList.remove('hidden');
      btnPlayPause.classList.add('active');
      
      animationFrameId = requestAnimationFrame(updateTimer);
    } else {
      // Paused state restoration
      if (state.elapsedTime > 0) {
        btnReset.disabled = false;
        // Don't enable lap button when paused at start, but if they have laps, let them see it
        btnLap.disabled = true;
        labelPlayPause.textContent = 'Resume';
      }
      updateTimer();
    }
    
    renderLaps();
    updateStats();
    
  } catch (e) {
    console.error("Failed to load stopwatch state from LocalStorage", e);
    // Reset and apply default
    applyTheme('midnight');
  }
}

function updateSoundIcons() {
  if (state.soundOn) {
    iconSoundOn.classList.remove('hidden');
    iconSoundOff.classList.add('hidden');
  } else {
    iconSoundOn.classList.add('hidden');
    iconSoundOff.classList.remove('hidden');
  }
}

function handleSoundToggle() {
  initAudio();
  state.soundOn = !state.soundOn;
  updateSoundIcons();
  saveState();
  if (state.soundOn) {
    playClickSound(2); // pleasant test click
  }
}

// ==========================================================================
// EVENT LISTENERS & INITS
// ==========================================================================

// Attach button actions
btnPlayPause.addEventListener('click', handlePlayPause);
btnReset.addEventListener('click', resetTimer);
btnLap.addEventListener('click', recordLap);
btnSoundToggle.addEventListener('click', handleSoundToggle);

// Theme Menu toggler
btnThemeMenu.addEventListener('click', (e) => {
  e.stopPropagation();
  themeDropdown.classList.toggle('hidden');
});

// Close theme dropdown when clicking elsewhere
document.addEventListener('click', () => {
  themeDropdown.classList.add('hidden');
});

// Theme selection options
const themeOptions = document.querySelectorAll('.theme-opt');
themeOptions.forEach(opt => {
  opt.addEventListener('click', (e) => {
    e.stopPropagation();
    const themeName = opt.getAttribute('data-theme');
    applyTheme(themeName);
    themeDropdown.classList.add('hidden');
    playClickSound(2);
  });
});

// Keyboard controls
document.addEventListener('keydown', (e) => {
  // Ignore inputs if cursor is in a form field
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    return;
  }
  
  const key = e.key.toLowerCase();
  
  if (key === ' ' || e.code === 'Space') {
    if (e.target.tagName === 'BUTTON') {
      // Let the browser handle standard button activation naturally
      return;
    }
    e.preventDefault(); // Prevent page scroll behavior
    handlePlayPause();
  } else if (key === 'l') {
    e.preventDefault();
    if (state.isRunning || state.elapsedTime > 0) {
      recordLap();
    }
  } else if (key === 'r') {
    e.preventDefault();
    if (state.elapsedTime > 0 || state.isRunning) {
      resetTimer();
    }
  }
});

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  loadState();
});
