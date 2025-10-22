// HSMSE Homework Checker - Main Application JavaScript

const { ipcRenderer } = require('electron');
const { logToRenderer } = require('./core/logger');
const AssignmentTracker = require('./core/assignment-tracker');

// Application state
const AppState = {
  currentView: 'assignments', // 'assignments' or 'browser'
  currentUrl: '',
  logs: []
};

// Assignment tracker instance
let assignmentTracker = null;

// DOM elements
let elements = {};

// Initialize the application
function initializeApp() {
  console.log('initializeApp() called');
  
  // Cache DOM elements
  elements = {
    // Main controls
    updateAssignmentsBtn: document.getElementById('update-assignments'),
    
    // View toggle controls
    assignmentsViewToggle: document.getElementById('assignments-view-toggle'),
    scrapingViewToggle: document.getElementById('scraping-view-toggle'),
    
    // Logs control
    openLogsBtn: document.getElementById('open-logs'),
    
    // View elements
    assignmentView: document.getElementById('assignment-view'),
    browserView: document.getElementById('browser-view'),
    jupiterLoginPane: document.getElementById('jupiter-login-pane'),
    instructionsPanel: document.getElementById('instructions-panel'),
    logsPane: document.querySelector('.logs-pane'),
    logsToggle: document.getElementById('toggle-logs'),
    
    // Jupiter Form
    jupiterForm: document.getElementById('jupiter-form'),
    jupiterStudentName: document.getElementById('jupiter-student-name'),
    jupiterPassword: document.getElementById('jupiter-password'),

    // Status and logs
    logContainer: document.getElementById('log-container'),
    statusUrl: document.getElementById('status-url')
  };
  
  // Set up event listeners
  setupEventListeners();
  
  // Set initial state - show assignments view, logs pane collapsed  
  if (elements.assignmentView) elements.assignmentView.classList.remove('hidden');
  if (elements.browserView) elements.browserView.classList.add('hidden');
  if (elements.logsPane) {
    elements.logsPane.classList.add('collapsed');
    // Update toggle button to show correct state
    if (elements.logsToggle) elements.logsToggle.textContent = '+';
  }
  
  // Initialize assignment tracker
  logToRenderer('Creating assignment tracker instance...', 'info');
  assignmentTracker = new AssignmentTracker();
  logToRenderer('Calling assignment tracker init()...', 'info');
  assignmentTracker.init().then(() => {
    logToRenderer('Assignment tracker initialized successfully', 'success');
  }).catch(error => {
    logToRenderer(`Failed to initialize assignment tracker: ${error.message}`, 'error');
    console.error('Assignment tracker error:', error);
  });
  
  console.log('HSMSE Homework Checker initialized');
}

// Set up all event listeners
function setupEventListeners() {
  // Main control buttons
  elements.updateAssignmentsBtn.addEventListener('click', handleUpdateAssignments);
  
  // View toggle controls
  elements.assignmentsViewToggle.addEventListener('change', handleViewToggle);
  elements.scrapingViewToggle.addEventListener('change', handleViewToggle);
  
  // Logs control
  elements.openLogsBtn.addEventListener('click', handleOpenLogs);
  
  // Jupiter form submission
  elements.jupiterForm.addEventListener('submit', handleJupiterFormSubmit);

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

  // Listen for workflow completion
  ipcRenderer.on('workflow-complete', (event, data) => {
    if (assignmentTracker) {
      assignmentTracker.onDataCollectionComplete();
    }
  });

  // Listen for automatic view switching after data save
  ipcRenderer.on('switch-to-assignments-view', () => {
    showAssignmentView();
  });

  // Listen for Jupiter login form requests
  ipcRenderer.on('show-jupiter-form', () => {
    showJupiterLoginForm();
  });

  // Listen for request to show Jupiter login
  ipcRenderer.on('show-jupiter-login', () => {
    showJupiterLoginForm();
  });
}

// Handle the update assignments action (replaces old auth flow)
async function handleUpdateAssignments() {
  try {
    // Show browser view during data collection
    showBrowserView();
    
    setButtonLoading(elements.updateAssignmentsBtn, true, 'Updating...');
    const result = await ipcRenderer.invoke('start-unified-auth');
    
    if (result.success) {
      addLogEntry(`Assignment update complete! Found ${result.totalAssignments || 0} assignments`, 'success');
      if (result.googleAssignments) {
        addLogEntry(`Google Classroom: ${result.googleAssignments} assignments`, 'info');
      }
      if (result.jupiterAssignments) {
        addLogEntry(`Jupiter Ed: ${result.jupiterAssignments} assignments`, 'info');
      }
    } else {
      addLogEntry(`Update failed: ${result.error}`, 'error');
    }
    
    // Refresh assignment display and automatically return to assignment view
    if (assignmentTracker) {
      assignmentTracker.onDataCollectionComplete();
    }
    showAssignmentView(); // Automatically show assignments view after completion
    
  } catch (error) {
    addLogEntry(`Error during update: ${error.message}`, 'error');
    // Still return to assignment view on error
    showAssignmentView();
  } finally {
    setButtonLoading(elements.updateAssignmentsBtn, false, 'Update Assignments');
  }
}

// Handle view toggle between assignments and scraping
function handleViewToggle() {
  if (elements.assignmentsViewToggle.checked) {
    showAssignmentView();
  } else if (elements.scrapingViewToggle.checked) {
    showBrowserView();
  }
}

// Handle opening logs window
function handleOpenLogs() {
  ipcRenderer.invoke('open-logs-window');
}

// Toggle logs pane expanded/collapsed
function toggleLogsPane() {
  const logsPane = elements.logsPane;
  const toggleButton = elements.logsToggle;
  
  if (logsPane.classList.contains('collapsed')) {
    // Expand logs pane
    logsPane.classList.remove('collapsed');
    toggleButton.textContent = '−';
  } else {
    // Collapse logs pane
    logsPane.classList.add('collapsed');
    toggleButton.textContent = '+';
  }
}

// View switching functions
function showAssignmentView() {
  if (elements.assignmentView) elements.assignmentView.classList.remove('hidden');
  if (elements.browserView) elements.browserView.classList.add('hidden');
  AppState.currentView = 'assignments';
  
  // Sync the toggle controls
  if (elements.assignmentsViewToggle) elements.assignmentsViewToggle.checked = true;
  
  ipcRenderer.send('switch-tab', 'assignments');
}

function showBrowserView() {
  if (elements.assignmentView) elements.assignmentView.classList.add('hidden');
  if (elements.browserView) elements.browserView.classList.remove('hidden');
  AppState.currentView = 'browser';
  
  // Sync the toggle controls
  if (elements.scrapingViewToggle) elements.scrapingViewToggle.checked = true;
  
  ipcRenderer.send('switch-tab', 'browser');
}



// Show the Jupiter login form
function showJupiterLoginForm() {
  // Make sure we're in browser view first
  showBrowserView();
  // Show the Jupiter login overlay
  elements.jupiterLoginPane.classList.add('active');
  // Also hide the browser view from the main process
  ipcRenderer.send('switch-tab', 'jupiter-login');
}

// Handle Jupiter form submission
function handleJupiterFormSubmit(event) {
  event.preventDefault();
  const studentName = elements.jupiterStudentName.value;
  const password = elements.jupiterPassword.value;
  const loginType = document.querySelector('input[name="login-type"]:checked').value;

  if (studentName && password) {
    addLogEntry('Sending Jupiter credentials to main process...', 'info');
    ipcRenderer.invoke('save-jupiter-credentials', { 
      student_name: studentName, 
      password,
      loginType
    });
    // Hide the form and return to assignment view
    elements.jupiterLoginPane.classList.remove('active');
    showAssignmentView();
  } else {
    addLogEntry('Student Name and password are required.', 'error');
  }
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

// Add immediate logging to check if this file is loaded
console.log('Renderer.js file loaded');

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded event fired, calling initializeApp()');
  initializeApp();
});

// Export for testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AppState,
    initializeApp,
    toggleLogsPane,
    showAssignmentView,
    showBrowserView,
    addLogEntry,
    updateCurrentUrl
  };
}