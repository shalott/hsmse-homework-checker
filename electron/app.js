// HSMSE Homework Checker - Main Application JavaScript

const { ipcRenderer } = require('electron');

// Application state
const AppState = {
  currentTab: 'browser',
  currentUrl: '',
  logs: []
};

// DOM elements
let elements = {};

// Initialize the application
function initializeApp() {
  // Cache DOM elements
  elements = {
    // Main control
    startAuthBtn: document.getElementById('start-auth-flow'),
    
    // Tab elements
    browserTab: document.getElementById('browser-tab'),
    logsTab: document.getElementById('logs-tab'),
    browserPane: document.getElementById('browser-pane'),
    logsPane: document.getElementById('logs-pane'),
    
    // Status and logs
    instructionsPanel: document.getElementById('instructions-panel'),
    logContainer: document.getElementById('log-container'),
    statusUrl: document.getElementById('status-url')
  };
  
  // Set up event listeners
  setupEventListeners();
  
  // Set initial tab
  switchTab('browser');
  
  console.log('HSMSE Homework Checker initialized');
}

// Set up all event listeners
function setupEventListeners() {
  // Main start button
  elements.startAuthBtn.addEventListener('click', handleAuthFlow);
  
  // Tab navigation
  elements.browserTab.addEventListener('click', () => switchTab('browser'));
  elements.logsTab.addEventListener('click', () => switchTab('logs'));
  
  // IPC listeners
  setupIpcListeners();
}

// Set up IPC communication with main process
function setupIpcListeners() {
  // Listen for log messages
  ipcRenderer.on('log-message', (event, data) => {
    addLogEntry(data.message, data.type, data.timestamp);
  });
  
  // Listen for URL changes
  ipcRenderer.on('url-changed', (event, data) => {
    updateCurrentUrl(data.url);
  });

  // Listen for instruction messages
  ipcRenderer.on('instruction-message', (event, data) => {
    updateInstructions(data.message);
  });
}

// Handle the unified authentication flow
async function handleAuthFlow() {
  try {
    setButtonLoading(elements.startAuthBtn, true, 'Checking...');
    const result = await ipcRenderer.invoke('start-unified-auth');
    
    if (result.success) {
      addLogEntry('Successfully accessed HSMSE Google Classroom account!', 'success');
    } else {
      addLogEntry(`Authentication failed: ${result.error}`, 'error');
    }
    
  } catch (error) {
    addLogEntry(`Error during authentication: ${error.message}`, 'error');
  } finally {
    setButtonLoading(elements.startAuthBtn, false, 'Start');
  }
}

// Switch between tabs
function switchTab(tabName) {
  // Update app state
  AppState.currentTab = tabName;
  
  // Update tab buttons
  document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
  
  // Activate selected tab
  const tabButton = document.getElementById(`${tabName}-tab`);
  const tabPane = document.getElementById(`${tabName}-pane`);
  
  if (tabButton) tabButton.classList.add('active');
  if (tabPane) tabPane.classList.add('active');
  
  // Notify main process about tab switch
  ipcRenderer.send('switch-tab', tabName);
}

// Update the instructions panel
function updateInstructions(message) {
  if (elements.instructionsPanel) {
    elements.instructionsPanel.textContent = message;
  }
}

// Set button loading state
function setButtonLoading(button, loading, loadingText = 'Loading...') {
  if (loading) {
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
  } else {
    button.disabled = false;
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }
}

// Add a log entry to the logs display
function addLogEntry(message, type = 'info', timestamp = null) {
  const entry = {
    message,
    type,
    timestamp: timestamp || new Date().toLocaleTimeString()
  };
  
  AppState.logs.push(entry);
  
  // Create log element
  const logElement = document.createElement('div');
  logElement.className = `log-entry ${type}`;
  logElement.textContent = `[${entry.timestamp}] ${entry.message}`;
  
  // Add to log container
  elements.logContainer.appendChild(logElement);
  
  // Auto-scroll to bottom
  elements.logContainer.scrollTop = elements.logContainer.scrollHeight;
  
  // Limit log entries to prevent memory issues
  const maxLogs = 1000;
  if (AppState.logs.length > maxLogs) {
    AppState.logs = AppState.logs.slice(-maxLogs);
    // Remove old DOM elements
    const logEntries = elements.logContainer.children;
    while (logEntries.length > maxLogs) {
      elements.logContainer.removeChild(logEntries[0]);
    }
  }
}

// Update the current URL in the status bar
function updateCurrentUrl(url) {
  AppState.currentUrl = url;
  
  if (elements.statusUrl) {
    elements.statusUrl.textContent = url || 'No page loaded';
    elements.statusUrl.title = url || ''; // Tooltip for long URLs
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);

// Export for testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AppState,
    initializeApp,
    switchTab,
    addLogEntry,
    updateCurrentUrl
  };
}