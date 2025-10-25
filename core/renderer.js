// HSMSE Homework Checker - Main Application JavaScript

const { ipcRenderer } = require('electron');
const AssignmentTracker = require('./core/assignment-tracker');

// Simple logging function for renderer process
function logToRenderer(message, type = 'info') {
  console.log(`[${type.toUpperCase()}] ${message}`);
  // Also send to main process for centralized logging
  ipcRenderer.send('renderer-log', { message, type, timestamp: new Date().toLocaleTimeString() });
}

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
    openSettingsBtn: document.getElementById('open-settings'),
    
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

    // Suspicious Results Dialog
    suspiciousResultsDialog: document.getElementById('suspicious-results-dialog'),
    suspiciousResultsList: document.getElementById('suspicious-results-list'),
    confirmSuspiciousBtn: document.getElementById('confirm-suspicious-btn'),
    rejectSuspiciousBtn: document.getElementById('reject-suspicious-btn'),

    // Jupiter Class Selection Dialog
    jupiterClassSelectionDialog: document.getElementById('jupiter-class-selection-dialog'),
    jupiterClassesList: document.getElementById('jupiter-classes-list'),
    selectAllJupiterClassesBtn: document.getElementById('select-all-jupiter-classes'),
    deselectAllJupiterClassesBtn: document.getElementById('deselect-all-jupiter-classes'),
    confirmJupiterClassesBtn: document.getElementById('confirm-jupiter-classes'),
    skipJupiterClassesBtn: document.getElementById('skip-jupiter-classes'),

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
  elements.openSettingsBtn.addEventListener('click', handleOpenSettings);
  
  // View toggle controls
  elements.assignmentsViewToggle.addEventListener('change', handleViewToggle);
  elements.scrapingViewToggle.addEventListener('change', handleViewToggle);
  
  // Logs control
  elements.openLogsBtn.addEventListener('click', handleOpenLogs);
  
  // Jupiter form submission
  elements.jupiterForm.addEventListener('submit', handleJupiterFormSubmit);

  // Suspicious results dialog
  elements.confirmSuspiciousBtn.addEventListener('click', handleConfirmSuspiciousResults);
  elements.rejectSuspiciousBtn.addEventListener('click', handleRejectSuspiciousResults);

  // Jupiter class selection dialog
  elements.selectAllJupiterClassesBtn.addEventListener('click', handleSelectAllJupiterClasses);
  elements.deselectAllJupiterClassesBtn.addEventListener('click', handleDeselectAllJupiterClasses);
  elements.confirmJupiterClassesBtn.addEventListener('click', handleConfirmJupiterClasses);
  elements.skipJupiterClassesBtn.addEventListener('click', handleSkipJupiterClasses);

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

  // Listen for view switching from main process
  ipcRenderer.on('switch-to-view', (event, viewName) => {
    if (viewName === 'scraping' || viewName === 'browser') {
      showBrowserView();
    } else if (viewName === 'assignments') {
      showAssignmentView();
    }
  });

  // Listen for Jupiter login form requests
  ipcRenderer.on('show-jupiter-form', () => {
    showJupiterLoginForm();
  });

  // Listen for Jupiter class selection dialog requests
  ipcRenderer.on('show-jupiter-class-selection', () => {
    showJupiterClassSelectionDialog();
  });

  // Listen for suspicious results dialog requests
  ipcRenderer.on('show-suspicious-results-dialog', (event, anomalies) => {
    showSuspiciousResultsDialog(anomalies);
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
    
    // Refresh assignment display and conditionally return to assignment view
    if (assignmentTracker) {
      assignmentTracker.onDataCollectionComplete();
    }
    
    // Only auto-switch to assignments view if the operation was successful
    if (result.success) {
      showAssignmentView();
    }
    // If there were failures, stay in scraping view so user can see error dialog
    
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

// Handle opening settings window
function handleOpenSettings() {
  ipcRenderer.invoke('open-settings');
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

// Show the suspicious results confirmation dialog
function showSuspiciousResultsDialog(anomalies) {
  // Build the anomalies list HTML
  const listHtml = anomalies.map(anomaly => {
    const lastDate = anomaly.lastBackupDate ? 
      new Date(anomaly.lastBackupDate).toLocaleString() : 
      'Unknown';
    
    return `
      <div class="suspicious-result-item" data-source="${anomaly.source}">
        <strong>${anomaly.sourceDisplay}</strong><br>
        Current run: <strong>0 assignments</strong><br>
        Previous run: <strong>${anomaly.previousCount} assignments</strong><br>
        Last successful check: ${lastDate}
      </div>
    `;
  }).join('');

  elements.suspiciousResultsList.innerHTML = listHtml;
  elements.suspiciousResultsDialog.classList.add('active');
}

// Show the Jupiter class selection dialog
function showJupiterClassSelectionDialog() {
  // For now, show a simple dialog with mock classes
  // In a real implementation, this would fetch classes from Jupiter
  const mockClasses = [
    { id: 'math101', name: 'Mathematics 101' },
    { id: 'science102', name: 'Science 102' },
    { id: 'english103', name: 'English 103' },
    { id: 'history104', name: 'History 104' }
  ];

  const classesHtml = mockClasses.map((classInfo, index) => {
    return `
      <div class="jupiter-class-item">
        <input type="checkbox" id="jupiter-class-${index}" value="${classInfo.id}" checked>
        <label for="jupiter-class-${index}">${classInfo.name}</label>
      </div>
    `;
  }).join('');

  elements.jupiterClassesList.innerHTML = classesHtml;
  elements.jupiterClassSelectionDialog.style.display = 'flex';
}

// Handle confirming suspicious results (use new data)
function handleConfirmSuspiciousResults() {
  elements.suspiciousResultsDialog.classList.remove('active');
  ipcRenderer.send('suspicious-results-response', {
    action: 'confirm',
    rejectedSources: []
  });
}

// Handle rejecting suspicious results (use backup data)
function handleRejectSuspiciousResults() {
  // Get all sources that were flagged as suspicious
  const suspiciousItems = elements.suspiciousResultsList.querySelectorAll('.suspicious-result-item');
  const rejectedSources = Array.from(suspiciousItems).map(item => item.dataset.source);
  
  elements.suspiciousResultsDialog.classList.remove('active');
  ipcRenderer.send('suspicious-results-response', {
    action: 'reject',
    rejectedSources: rejectedSources
  });
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
// Jupiter Class Selection Handlers
function handleSelectAllJupiterClasses() {
  const checkboxes = elements.jupiterClassesList.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(checkbox => checkbox.checked = true);
}

function handleDeselectAllJupiterClasses() {
  const checkboxes = elements.jupiterClassesList.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(checkbox => checkbox.checked = false);
}

function handleConfirmJupiterClasses() {
  const checkboxes = elements.jupiterClassesList.querySelectorAll('input[type="checkbox"]:checked');
  const selectedClasses = {};
  
  checkboxes.forEach(checkbox => {
    const label = elements.jupiterClassesList.querySelector(`label[for="${checkbox.id}"]`);
    selectedClasses[checkbox.value] = {
      name: label.textContent,
      selected: true
    };
  });

  // Save the configuration
  ipcRenderer.invoke('save-jupiter-config', { selected_classes: selectedClasses })
    .then(result => {
      if (result.success) {
        elements.jupiterClassSelectionDialog.style.display = 'none';
        logToRenderer(`Jupiter class selection saved: ${Object.keys(selectedClasses).length} classes selected`, 'success');
      } else {
        logToRenderer(`Error saving Jupiter class selection: ${result.error}`, 'error');
      }
    })
    .catch(error => {
      logToRenderer(`Error saving Jupiter class selection: ${error.message}`, 'error');
    });
}

function handleSkipJupiterClasses() {
  // Skip class selection - will scrape all classes
  elements.jupiterClassSelectionDialog.style.display = 'none';
  logToRenderer('Skipping Jupiter class selection - will scrape all available classes', 'info');
}

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