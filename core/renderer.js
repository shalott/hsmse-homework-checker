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
    progressSection: document.getElementById('progress-section'),
    
    // View toggle controls
    assignmentsViewToggle: document.getElementById('assignments-view-toggle'),
    scrapingViewToggle: document.getElementById('scraping-view-toggle'),
    
    // Logs control
    openLogsBtn: document.getElementById('open-logs'),
    
    // View elements
    assignmentView: document.getElementById('assignment-view'),
    browserView: document.getElementById('browser-view'),
    logsPane: document.querySelector('.logs-pane'),
    logsToggle: document.getElementById('toggle-logs'),

    // Suspicious Results Dialog
    suspiciousResultsDialog: document.getElementById('suspicious-results-dialog'),
    suspiciousResultsList: document.getElementById('suspicious-results-list'),
    confirmSuspiciousBtn: document.getElementById('confirm-suspicious-btn'),
    rejectSuspiciousBtn: document.getElementById('reject-suspicious-btn'),

    // Jupiter Class Selection Dialog

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
  

  // Suspicious results dialog
  elements.confirmSuspiciousBtn.addEventListener('click', handleConfirmSuspiciousResults);
  elements.rejectSuspiciousBtn.addEventListener('click', handleRejectSuspiciousResults);


  // Sort control
  const sortSelect = document.getElementById('sortBy');
  if (sortSelect) {
    sortSelect.addEventListener('change', handleSortChange);
  }

  // IPC listeners
  setupIpcListeners();
}

// Set up IPC communication with main process
function setupIpcListeners() {
  // Log messages are handled by the logs window, not the main window
  
  // Listen for URL changes
  ipcRenderer.on('url-changed', (event, data) => {
    updateCurrentUrl(data.url);
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
    // Refresh assignment data when switching to assignments view
    if (assignmentTracker) {
      assignmentTracker.refresh();
    }
  });

  // Listen for view switching from main process
  ipcRenderer.on('switch-to-view', (event, viewName) => {
    if (viewName === 'scraping' || viewName === 'browser') {
      showBrowserView();
    } else if (viewName === 'assignments') {
      showAssignmentView();
    }
  });


  // Listen for suspicious results dialog requests
  ipcRenderer.on('show-suspicious-results-dialog', (event, anomalies) => {
    showSuspiciousResultsDialog(anomalies);
  });

  // Listen for request to open settings window
  ipcRenderer.on('open-settings', () => {
    handleOpenSettings();
  });
}

// Handle the update assignments action (replaces old auth flow)
async function handleUpdateAssignments() {
  try {
    // Show progress indicator
    if (elements.progressSection) {
      elements.progressSection.style.display = 'block';
    }
    
    // Show browser view during data collection
    showBrowserView();
    
    // Change button to red "Cancel" during scraping (but keep it enabled for clicking)
    elements.updateAssignmentsBtn.dataset.originalText = elements.updateAssignmentsBtn.textContent;
    elements.updateAssignmentsBtn.textContent = 'Cancel';
    elements.updateAssignmentsBtn.classList.add('btn-cancel');
    // Don't disable the button - we need it clickable for cancellation
    
    // Change the click handler to cancel during scraping
    elements.updateAssignmentsBtn.removeEventListener('click', handleUpdateAssignments);
    elements.updateAssignmentsBtn.addEventListener('click', handleCancelScraping);
    
    const result = await ipcRenderer.invoke('start-unified-auth');
    
    if (result.success) {
      // Success messages are logged by the main process
      // Hide progress indicator after a short delay to ensure it's hidden even if success notification is shown
      setTimeout(() => {
        if (elements.progressSection) {
          elements.progressSection.style.display = 'none';
        }
      }, 100);
    } else {
      // Error messages are logged by the main process
    }
    
    // Refresh assignment display and conditionally return to assignment view
    if (assignmentTracker) {
      assignmentTracker.onDataCollectionComplete();
    }
    
    // Only auto-switch to assignments view if the operation was successful
    if (result.success) {
      showAssignmentView();
      
      // Show success message AFTER cleanup is complete
      if (result.totalAssignments > 0) {
        const breakdown = {
          google0Assignments: result.google0Assignments || 0,
          google1Assignments: result.google1Assignments || 0,
          jupiterAssignments: result.jupiterAssignments || 0,
          sheetsAssignments: result.sheetsAssignments || 0
        };
        // Show success notification after all cleanup is done
        setTimeout(() => {
          ipcRenderer.invoke('show-success-notification', result.totalAssignments, breakdown);
        }, 100);
      }
    }
    // If there were failures, stay in scraping view so user can see error dialog
    
  } catch (error) {
    // Error messages are logged by the main process
    // Still return to assignment view on error
    showAssignmentView();
  } finally {
    // Hide progress indicator
    if (elements.progressSection) {
      elements.progressSection.style.display = 'none';
    }
    
    // Restore button to normal state
    elements.updateAssignmentsBtn.disabled = false;
    if (elements.updateAssignmentsBtn.dataset.originalText) {
      elements.updateAssignmentsBtn.textContent = elements.updateAssignmentsBtn.dataset.originalText;
      delete elements.updateAssignmentsBtn.dataset.originalText;
    }
    elements.updateAssignmentsBtn.classList.remove('btn-cancel');
    
    // Restore original click handler
    elements.updateAssignmentsBtn.removeEventListener('click', handleCancelScraping);
    elements.updateAssignmentsBtn.addEventListener('click', handleUpdateAssignments);
  }
}

// Handle canceling the scraping process
async function handleCancelScraping() {
  try {
    console.log('Cancel button clicked - sending cancel request to main process');
    const result = await ipcRenderer.invoke('cancel-scraping');
    console.log('Cancel result:', result);
    
    // Clean up UI state first
    // Hide progress indicator
    if (elements.progressSection) {
      elements.progressSection.style.display = 'none';
    }
    
    // Restore button to normal state
    elements.updateAssignmentsBtn.disabled = false;
    if (elements.updateAssignmentsBtn.dataset.originalText) {
      elements.updateAssignmentsBtn.textContent = elements.updateAssignmentsBtn.dataset.originalText;
      delete elements.updateAssignmentsBtn.dataset.originalText;
    }
    elements.updateAssignmentsBtn.classList.remove('btn-cancel');
    
    // Restore original click handler
    elements.updateAssignmentsBtn.removeEventListener('click', handleCancelScraping);
    elements.updateAssignmentsBtn.addEventListener('click', handleUpdateAssignments);
    
    // Return to assignment view
    showAssignmentView();
    
    // Show confirmation message AFTER cleanup
    logToRenderer('Assignment update has been canceled.', 'info');
    
    // Show brief success notification using IPC
    ipcRenderer.invoke('show-cancel-confirmation');
    
  } catch (error) {
    console.error('Error canceling scraping:', error);
    // Error messages are logged by the main process
    showAssignmentView();
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
  
  // Refresh assignment data when switching to assignments view
  if (assignmentTracker) {
    assignmentTracker.refresh();
  }
  
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

// Logging is handled by the logs window, not the main window

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

  // Handle sort change
  function handleSortChange() {
    if (assignmentTracker) {
      assignmentTracker.renderUpcomingAssignments();
    }
  }

  module.exports = {
    AppState,
    initializeApp,
    toggleLogsPane,
    showAssignmentView,
    showBrowserView,
    updateCurrentUrl
  };
}