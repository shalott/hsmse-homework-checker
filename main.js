// Setup absolute requires from project root
require('app-module-path').addPath(__dirname);

const { app, BrowserWindow, BrowserView, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Import utilities
const { initializeLogger, logToRenderer, setLogsWindow } = require('core/logger');
const { BROWSER_VIEW_BOUNDS } = require('config/constants');

// Import access modules
const { handleJupiterAccess, saveJupiterCredentials, loginToJupiter } = require('access/jupiter-access');

// Import scraper modules
const { scrapeGoogleClassroomAssignments, convertToStandardFormat: convertGoogleAssignments } = require('scrapers/google-classroom-scraper');
const { scrapeJupiterAssignments, convertToStandardFormat: convertJupiterAssignments } = require('scrapers/jupiter-scraper');
const { saveAssignments } = require('scrapers/assignment-utils');

// Keep a global reference of the window object
let mainWindow;
let browserView; // Single browser view for all scraping operations

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    show: false
  });

  logToRenderer('Main window created', 'info');

  // Load the app
  mainWindow.loadFile(path.join(__dirname, 'main.html'));

  // Initialize logger with main window
  initializeLogger(mainWindow);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Keep window focused for better Google Classroom compatibility
    mainWindow.focus();
    logToRenderer('Application window shown', 'success');
  });
  
  // Allow normal window minimize behavior
  // (removed aggressive minimize prevention)

  // Cleanup on close
  mainWindow.on('closed', () => {
    // No need to log here, as the window is already gone
    mainWindow = null;
    browserView = null;
  });

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
    logToRenderer('DevTools opened (development mode)', 'info');
  }
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  logToRenderer('Electron app ready', 'success');
  createWindow();
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS it is common for applications to stay open until explicitly quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Create BrowserView if it doesn't exist
function createBrowserView() {
  if (!browserView) {
    logToRenderer('Creating new BrowserView', 'info');
    browserView = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        // Prevent new windows from opening
        allowRunningInsecureContent: false,
        experimentalFeatures: false
      }
    });
    
    mainWindow.setBrowserView(browserView);
    
    // Position the BrowserView for the new tabbed layout
    const { width, height } = mainWindow.getBounds();
    browserView.setBounds({ 
      x: BROWSER_VIEW_BOUNDS.x,
      y: BROWSER_VIEW_BOUNDS.y,
      width: width - BROWSER_VIEW_BOUNDS.widthOffset,
      height: height - BROWSER_VIEW_BOUNDS.heightOffset
    });
    
    logToRenderer(`BrowserView positioned at x:${BROWSER_VIEW_BOUNDS.x}, y:${BROWSER_VIEW_BOUNDS.y}, size:${width - BROWSER_VIEW_BOUNDS.widthOffset}x${height - BROWSER_VIEW_BOUNDS.heightOffset}`, 'info');
    
    // Prevent new windows from opening - force all navigation to stay in the same view
    browserView.webContents.setWindowOpenHandler(({ url }) => {
      logToRenderer(`Preventing new window for: ${url}`, 'info');
      // Instead of opening a new window, navigate in the current view
      browserView.webContents.loadURL(url);
      return { action: 'deny' };
    });
    
    // Handle navigation events
    browserView.webContents.on('will-navigate', (event, navigationUrl) => {
      logToRenderer(`Navigating to: ${navigationUrl}`, 'info');
    });
    
    browserView.webContents.on('did-navigate', (event, url) => {
      logToRenderer(`Navigation completed: ${url}`, 'success');
      // Send URL update to renderer
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('url-changed', { url });
      }
      
      // Navigation injection removed - using logs pane instead
    });
    
    browserView.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      logToRenderer(`Navigation failed for ${validatedURL}: ${errorDescription}`, 'error');
    });
    
    // Handle external link clicks and form submissions to stay in the same view
    browserView.webContents.on('new-window', (event, url, frameName, disposition) => {
      event.preventDefault();
      logToRenderer(`Redirecting external link to current view: ${url}`, 'info');
      browserView.webContents.loadURL(url);
    });
    
    // Auto-resize BrowserView when window is resized
    mainWindow.on('resize', () => {
      if (browserView) {
        const { width, height } = mainWindow.getBounds();
        browserView.setBounds({ 
          x: BROWSER_VIEW_BOUNDS.x,
          y: BROWSER_VIEW_BOUNDS.y,
          width: width - BROWSER_VIEW_BOUNDS.widthOffset,
          height: height - BROWSER_VIEW_BOUNDS.heightOffset
        });
        logToRenderer(`BrowserView resized to ${width - BROWSER_VIEW_BOUNDS.widthOffset}x${height - BROWSER_VIEW_BOUNDS.heightOffset}`, 'info');
      }
    });
    
    // Removed visibility circumvention - using logs pane instead
    
    logToRenderer('BrowserView created and configured with navigation controls', 'success');
  }
}

// Keep reference to logs window
let logsWindow;

function createLogsWindow() {
  // If logs window already exists, focus it instead of creating a new one
  if (logsWindow && !logsWindow.isDestroyed()) {
    logsWindow.focus();
    return;
  }

  // Create the logs window
  logsWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'HSMSE Homework Checker - Logs',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    // Remove parent relationship to prevent minimizing with main window
    modal: false,
    minimizable: true,
    maximizable: true,
    resizable: true,
    show: false
  });

  // Create logs window HTML content - this will show the same logs as the main window
  const logsHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Logs</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          margin: 0;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .logs-container {
          background: white;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          height: calc(100vh - 80px);
          overflow-y: auto;
        }
        .log-entry {
          padding: 8px 12px;
          margin-bottom: 4px;
          border-radius: 4px;
          font-size: 13px;
          line-height: 1.4;
          border-left: 3px solid #ccc;
        }
        .log-entry.info {
          background-color: #e3f2fd;
          border-left-color: #2196f3;
        }
        .log-entry.success {
          background-color: #e8f5e8;
          border-left-color: #4caf50;
        }
        .log-entry.error {
          background-color: #fde3e3;
          border-left-color: #f44336;
        }
        .log-entry.warning {
          background-color: #fff3e0;
          border-left-color: #ff9800;
        }
        .log-timestamp {
          color: #666;
          font-size: 11px;
          margin-right: 8px;
        }
        h1 {
          margin-top: 0;
          color: #333;
          font-size: 18px;
        }
      </style>
    </head>
    <body>
      <h1>Application Logs</h1>
      <div class="logs-container" id="logs-container">
        <div class="log-entry info">
          <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
          Logs window opened - displaying current session logs
        </div>
      </div>
      <script>
        const { ipcRenderer } = require('electron');
        
        // Listen for log messages from main process (same as main window)
        ipcRenderer.on('log-message', (event, data) => {
          const container = document.getElementById('logs-container');
          const entry = document.createElement('div');
          entry.className = 'log-entry ' + (data.type || 'info');
          
          const timestamp = new Date(data.timestamp || Date.now()).toLocaleTimeString();
          entry.innerHTML = '<span class="log-timestamp">' + (data.timestamp || timestamp) + '</span>' + data.message;
          
          container.appendChild(entry);
          
          // Auto-scroll to bottom
          container.scrollTop = container.scrollHeight;
          
          // Limit to last 500 entries to prevent memory issues
          while (container.children.length > 500) {
            container.removeChild(container.firstChild);
          }
        });
      </script>
    </body>
    </html>
  `;

  // Load the HTML content
  logsWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(logsHtml));

  // Show window when ready
  logsWindow.once('ready-to-show', () => {
    logsWindow.show();
    // Register the logs window with the logger so it receives live updates
    setLogsWindow(logsWindow);
  });

  // Clean up reference when window is closed
  logsWindow.on('closed', () => {
    logsWindow = null;
    setLogsWindow(null); // Clear the logger reference
  });

  logToRenderer('Logs window created', 'info');
}

// No need for multiple browser views - we'll use the single browserView sequentially

// Complete workflow: Google Classroom /u/0 direct load + scrape
async function runGoogleWorkflow0() {
  logToRenderer('Starting Google Classroom /u/0 workflow...', 'info');
  
  try {
    // Ensure we have a browser view
    createBrowserView();
    
    // Try to scrape assignments from /u/0 directly
    logToRenderer('Loading /u/0 and attempting to scrape assignments...', 'info');
    const scrapingResult = await scrapeGoogleClassroomAssignments(browserView, 0);
    
    // Check if scraping failed due to authentication issues
    if (!scrapingResult.success && scrapingResult.needsAuth) {
      logToRenderer('Authentication required for /u/0. Please log in to your Google Classroom accounts.', 'instruction');
      return { success: false, error: 'Authentication required', needsAuth: true, assignments: [] };
    }
    
    logToRenderer(`Google /u/0 workflow completed: ${scrapingResult.success ? 'Success' : 'Failed'}`, 
                  scrapingResult.success ? 'success' : 'error');
    
    return scrapingResult;
    
  } catch (error) {
    logToRenderer(`Google /u/0 workflow error: ${error.message}`, 'error');
    return { success: false, error: error.message, assignments: [] };
  }
}

// Complete workflow: Google Classroom /u/1 direct load + scrape
async function runGoogleWorkflow1() {
  logToRenderer('Starting Google Classroom /u/1 workflow...', 'info');
  
  try {
    // Ensure we have a browser view
    createBrowserView();
    
    // Try to scrape assignments from /u/1 directly
    logToRenderer('Loading /u/1 and attempting to scrape assignments...', 'info');
    const scrapingResult = await scrapeGoogleClassroomAssignments(browserView, 1);
    
    // Check if scraping failed due to authentication issues
    if (!scrapingResult.success && scrapingResult.needsAuth) {
      logToRenderer('Authentication required for /u/1. Please log in to your Google Classroom accounts.', 'instruction');
      return { success: false, error: 'Authentication required', needsAuth: true, assignments: [] };
    }
    
    logToRenderer(`Google /u/1 workflow completed: ${scrapingResult.success ? 'Success' : 'Failed'}`, 
                  scrapingResult.success ? 'success' : 'error');
    
    return scrapingResult;
    
  } catch (error) {
    logToRenderer(`Google /u/1 workflow error: ${error.message}`, 'error');
    return { success: false, error: error.message, assignments: [] };
  }
}

// Complete workflow: Jupiter access + scraping
async function runJupiterWorkflow() {
  logToRenderer('Starting Jupiter Ed workflow...', 'info');
  
  try {
    // Ensure we have a browser view
    createBrowserView();
    
    // Step 1: Authenticate with Jupiter
    const accessResult = await handleJupiterAccess(browserView, mainWindow);
    if (!accessResult.success) {
      return { success: false, error: 'Jupiter access failed', assignments: [] };
    }
    
    // Step 2: Scrape assignments from Jupiter
    const scrapingResult = await scrapeJupiterAssignments(browserView);
    
    logToRenderer(`Jupiter workflow completed: ${scrapingResult.success ? 'Success' : 'Failed'}`, 
                  scrapingResult.success ? 'success' : 'error');
    
    return scrapingResult;
    
  } catch (error) {
    logToRenderer(`Jupiter workflow error: ${error.message}`, 'error');
    return { success: false, error: error.message, assignments: [] };
  }
}

// Switch active browser view for user visibility
function setActiveBrowserView(viewName) {
  // We now only have one browser view, so just show it
  if (browserView && mainWindow) {
    mainWindow.setBrowserView(browserView);
    
    // Position the view properly
    const { width, height } = mainWindow.getBounds();
    browserView.setBounds({ 
      x: BROWSER_VIEW_BOUNDS.x,
      y: BROWSER_VIEW_BOUNDS.y,
      width: width - BROWSER_VIEW_BOUNDS.widthOffset,
      height: height - BROWSER_VIEW_BOUNDS.heightOffset
    });
    
    logToRenderer(`Browser view activated for ${viewName}`, 'info');
  }
}

// Process results from all workflows and combine them
async function processWorkflowResults(google0Result, google1Result, jupiterResult) {
  const allAssignments = [];
  let totalGoogleAssignments = 0;
  
  try {
    // Process Google /u/0 results
    if (google0Result.success) {
      const standardized0 = await convertGoogleAssignments(google0Result.assignments);
      allAssignments.push(...standardized0);
      totalGoogleAssignments += standardized0.length;
      logToRenderer(`Collected ${standardized0.length} assignments from Google /u/0`, 'success');
    } else {
      logToRenderer(`Google /u/0 workflow failed: ${google0Result.error}`, 'warn');
    }
    
    // Process Google /u/1 results  
    if (google1Result.success) {
      const standardized1 = await convertGoogleAssignments(google1Result.assignments);
      allAssignments.push(...standardized1);
      totalGoogleAssignments += standardized1.length;
      logToRenderer(`Collected ${standardized1.length} assignments from Google /u/1`, 'success');
    } else {
      logToRenderer(`Google /u/1 workflow failed: ${google1Result.error}`, 'warn');
    }
    
    // Process Jupiter results
    if (jupiterResult.success) {
      const standardizedJupiter = await convertJupiterAssignments(jupiterResult.assignments);
      allAssignments.push(...standardizedJupiter);
      logToRenderer(`Collected ${standardizedJupiter.length} Jupiter Ed assignments`, 'success');
    } else {
      logToRenderer(`Jupiter workflow failed: ${jupiterResult.error}`, 'warn');
    }
    
    // Save all assignments
    const saveSuccess = await saveAssignments(allAssignments);
    if (saveSuccess) {
      logToRenderer(`Successfully saved ${allAssignments.length} total assignments`, 'success');
    } else {
      logToRenderer('Failed to save assignments to file', 'warn');
    }
    
    // Automatically switch to assignments view after saving
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('switch-to-assignments-view');
    }
    
    // Switch back to main browser view
    setActiveBrowserView('main');
    
    return {
      success: true,
      totalAssignments: allAssignments.length,
      google0Assignments: google0Result.success ? google0Result.assignments.length : 0,
      google1Assignments: google1Result.success ? google1Result.assignments.length : 0,
      jupiterAssignments: jupiterResult.success ? jupiterResult.assignments.length : 0,
      assignments: allAssignments,
      integratedWorkflows: true
    };
    
  } catch (error) {
    logToRenderer(`Error processing workflow results: ${error.message}`, 'error');
    return { success: false, error: error.message, assignments: allAssignments };
  }
}

// Handle log messages from renderer
ipcMain.on('log-message', (event, { message, type, timestamp }) => {
  // Only log to console for debugging, not for user display
  console.log(`[${timestamp}] [RENDERER] [${type.toUpperCase()}] ${message}`);
});

ipcMain.handle('start-unified-auth', async () => {
  logToRenderer('Starting sequential workflows for all accounts...', 'info');
  
  try {
    // Ensure we have a browser view
    createBrowserView();
    
    logToRenderer('Running sequential workflows: Google /u/0, then Google /u/1, then Jupiter...', 'info');
    
    // Show browser view initially
    setActiveBrowserView('main');
    
    // Run all workflows sequentially (not in parallel)
    const results = [];
    
    // Run Google /u/0 workflow
    logToRenderer('Running Google /u/0 workflow...', 'info');
    const google0Result = await runGoogleWorkflow0();
    results.push({ type: 'google0', result: google0Result });
    
    // Run Google /u/1 workflow  
    logToRenderer('Running Google /u/1 workflow...', 'info');
    const google1Result = await runGoogleWorkflow1();
    results.push({ type: 'google1', result: google1Result });
    
    // Run Jupiter workflow
    logToRenderer('Running Jupiter workflow...', 'info');
    const jupiterResult = await runJupiterWorkflow();
    results.push({ type: 'jupiter', result: jupiterResult });
    
    // Extract results from our sequential execution
    const finalGoogle0Result = results.find(r => r.type === 'google0').result;
    const finalGoogle1Result = results.find(r => r.type === 'google1').result;
    const finalJupiterResult = results.find(r => r.type === 'jupiter').result;
    
    return await processWorkflowResults(finalGoogle0Result, finalGoogle1Result, finalJupiterResult);

  } catch (error) {
    logToRenderer(`Error in integrated workflow: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
});







ipcMain.handle('save-jupiter-credentials', async (event, { student_name, password, loginType }) => {
  try {
    const credentials = { student_name, password, loginType };
    const saveResult = await saveJupiterCredentials(credentials);
    
    if (saveResult.success) {
      logToRenderer('Attempting to log in to Jupiter Ed...', 'info');
      return await loginToJupiter(browserView, credentials);
    } else {
      return saveResult;
    }
  } catch (error) {
    logToRenderer(`Failed to handle Jupiter credentials: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('scrape-assignments-only', async () => {
  logToRenderer('Starting sequential workflows (assuming authentication)...', 'info');
  
  try {
    // Ensure we have a browser view
    createBrowserView();
    
    // Run workflows sequentially assuming authentication is already in place
    const sequentialResults = [];
    
    // Run Google /u/0 workflow
    const seqGoogle0Result = await runGoogleWorkflow0();
    sequentialResults.push({ type: 'google0', result: seqGoogle0Result });
    
    // Run Google /u/1 workflow  
    const seqGoogle1Result = await runGoogleWorkflow1();
    sequentialResults.push({ type: 'google1', result: seqGoogle1Result });
    
    // Run Jupiter workflow
    const seqJupiterResult = await runJupiterWorkflow();
    sequentialResults.push({ type: 'jupiter', result: seqJupiterResult });
    
    // Extract results
    const seqFinalGoogle0 = sequentialResults.find(r => r.type === 'google0').result;
    const seqFinalGoogle1 = sequentialResults.find(r => r.type === 'google1').result;
    const seqFinalJupiter = sequentialResults.find(r => r.type === 'jupiter').result;
    
    return await processWorkflowResults(seqFinalGoogle0, seqFinalGoogle1, seqFinalJupiter);
    
  } catch (error) {
    logToRenderer(`Error in scrape-only workflow: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
});

// Handle view switching (simplified for new layout)
ipcMain.on('switch-tab', (event, tabName) => {
  if (tabName === 'browser') {
    // Show the browser view
    setActiveBrowserView('main');
  } else if (tabName === 'assignments') {
    // Hide browser view when showing assignments
    mainWindow.setBrowserView(null);
  } else if (tabName === 'jupiter-login') {
    // Hide browser view when jupiter form is active
    mainWindow.setBrowserView(null);
  }
});

// File operation IPC handlers for assignment tracker
ipcMain.handle('get-assignments-file-path', () => {
  const assignmentsPath = path.join(__dirname, 'data', 'all_assignments.json');
  console.log(`[Main] Assignments file path requested: ${assignmentsPath}`);
  return assignmentsPath;
});

ipcMain.handle('file-exists', (event, filePath) => {
  try {
    const exists = fs.existsSync(filePath);
    console.log(`[Main] File exists check for ${filePath}: ${exists}`);
    return exists;
  } catch (error) {
    console.error(`[Main] Error checking if file exists (${filePath}):`, error);
    return false;
  }
});

ipcMain.handle('read-assignments-file', (event, filePath) => {
  try {
    console.log(`[Main] Reading assignments file: ${filePath}`);
    const data = fs.readFileSync(filePath, 'utf8');
    console.log(`[Main] Successfully read ${data.length} characters from assignments file`);
    return data;
  } catch (error) {
    console.error(`[Main] Error reading assignments file (${filePath}):`, error);
    return null;
  }
});

ipcMain.handle('get-file-stats', (event, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    console.log(`[Main] File stats for ${filePath}: modified ${stats.mtime}`);
    return {
      mtime: stats.mtime.toISOString(),
      size: stats.size
    };
  } catch (error) {
    console.error(`[Main] Error getting file stats (${filePath}):`, error);
    return null;
  }
});

// Handle opening logs window
ipcMain.handle('open-logs-window', () => {
  createLogsWindow();
});

