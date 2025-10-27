// Setup absolute requires from project root
require('app-module-path').addPath(__dirname);

const { app, BrowserWindow, BrowserView, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// STEP 1: Load constants FIRST (before anything else)
const { BROWSER_VIEW_BOUNDS, ASSIGNMENTS_FILE, APP_SETTINGS_FILE, JUPITER_LOGIN_URL, WINDOWS_DIR, APP_DIR, MAIN_HTML_PATH, SETTINGS_HTML_PATH, LOGS_HTML_PATH, ICON_PATH, OVERLAY_NOTIFICATION_HTML_PATH, OVERLAY_NOTIFICATION_CSS_PATH } = require('config/constants');

// STEP 2: Import startup validation (but don't run it yet)
const { runStartupValidation } = require('core/validation_startup');

// STEP 3: Import logger (but don't initialize it yet)
const { initializeLogger, logToRenderer, setLogsWindow } = require('core/logger');

// Import access modules
const { handleJupiterAccess, saveJupiterCredentials, loginToJupiter } = require('access/jupiter-access');
const { handleGoogleSheetsAccess } = require('access/googlesheets_access');

// Import scraper modules
const { scrapeGoogleClassroomAssignments, convertToStandardFormat: convertGoogleAssignments } = require('scrapers/google-classroom-scraper');
const { scrapeJupiterAssignments, convertToStandardFormat: convertJupiterAssignments } = require('scrapers/jupiter-scraper');
const { scrapeGoogleSheets } = require('scrapers/googlesheets-scraper');
const { saveAssignments } = require('scrapers/assignment-utils');

// Import validation modules
const AssignmentBackup = require('core/assignment-backup');
const { runScrapingValidation } = require('core/validation_scraping');

// Import scheduler
const scheduler = require('core/scheduler');

// Import auto-startup
const autoStartup = require('core/auto-startup');

// Import app menu
const { createApplicationMenu } = require('windows/app-menu');

// Initialize backup system
const backupSystem = new AssignmentBackup();

// Keep a global reference of the window object
let mainWindow;
let settingsWindow;
let browserView; // Single browser view for all scraping operations
let isScrapingCanceled = false;
let scrapingTimeout = null; // Timeout reference for scraping process
let systemTray = null; // System tray reference

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
  mainWindow.loadFile(MAIN_HTML_PATH);

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

  // Handle window close - hide to tray instead of quitting
  mainWindow.on('close', (event) => {
    // Prevent the default close behavior
    event.preventDefault();
    
    // Hide the window instead of closing it
    mainWindow.hide();
    
    // Show notification that app is running in tray
    if (systemTray) {
      systemTray.displayBalloon({
        iconType: 'info',
        title: 'HSMSE Homework Checker',
        content: 'App is running in the system tray. Click the tray icon to show the app.'
      });
    }
    
    logToRenderer('App hidden to system tray', 'info');
  });

  // Cleanup on closed (when app actually quits)
  mainWindow.on('closed', () => {
    // No need to log here, as the window is already gone
    mainWindow = null;
    browserView = null;
  });

  // Track if scraping is currently running
  let isScrapingRunning = false;

  // Prevent minimize during scraping and warn user
  mainWindow.on('minimize', (event) => {
    if (isScrapingRunning) {
      // Check if scraping is currently running
      event.preventDefault();
      
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Cannot Minimize During Scraping',
        message: 'The app cannot be minimized while scraping is in progress.',
        detail: 'Google Classroom scraping requires the browser window to remain visible. Please wait for scraping to complete before minimizing the app.',
        buttons: ['OK'],
        defaultId: 0
      });
      
      logToRenderer('User attempted to minimize during scraping - prevented', 'warn');
    }
  });

  // Warn user about minimize during scraping when they try to minimize
  mainWindow.on('will-minimize', (event) => {
    if (isScrapingRunning) {
      event.preventDefault();
      
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Scraping in Progress',
        message: 'Cannot minimize while scraping is running.',
        detail: 'Google Classroom scraping requires the browser window to remain visible. Please wait for the scraping process to complete.',
        buttons: ['OK'],
        defaultId: 0
      });
    }
  });

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
    logToRenderer('DevTools opened (development mode)', 'info');
    
    // Also create browser view in development mode so devtools are available for scraping
    createBrowserView();
    logToRenderer('Browser view created for development debugging', 'info');
  }
}

function createSettingsWindow() {
  // Don't create multiple settings windows
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 700,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    parent: mainWindow,
    modal: false,
    resizable: true,
    show: false,
    title: 'Settings - HSMSE Homework Checker'
  });

  // Load the settings page
  settingsWindow.loadFile(SETTINGS_HTML_PATH);

  // Show window when ready
  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
  });

  // Handle window closed
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// Initialize the app in the correct order
async function initializeApp() {
  try {
    console.log('Starting app initialization...');
    
    // STEP 1: Run startup validation to create directories
    console.log('Running startup validation...');
    const startupResult = await runStartupValidation();
    if (!startupResult.success) {
      console.error(`Startup validation failed: ${startupResult.message}`);
      // Continue anyway - the app should still work
    } else {
      console.log('Startup validation completed successfully');
    }
    
    // STEP 2: Create the main window
    console.log('Creating main window...');
    createWindow();
    
    // STEP 3: Initialize logger with the main window
    console.log('Initializing logger...');
    initializeLogger(mainWindow);
    
    // Add session start header to logs
    logToRenderer('==========================================', 'info');
    logToRenderer('START OF SESSION', 'info');
    logToRenderer('==========================================', 'info');
    
    // Initialize scheduler with current settings
    await initializeScheduler();
    
    // Create application menu
    createApplicationMenu();
    
    // Create system tray
    createSystemTray();
    
    // Check for failure alerts after a short delay to ensure UI is ready
    setTimeout(async () => {
      await checkForFailureAlerts();
    }, 2000);
    
    // Check if this is first launch and show help
    setTimeout(async () => {
      await checkFirstLaunchAndShowHelp();
    }, 3000); // Wait a bit longer to ensure everything is ready
    
    console.log('App initialization completed successfully');
  } catch (error) {
    console.error('App initialization failed:', error);
    // Still try to create the window
    createWindow();
  }
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  initializeApp();
});

// Handle app quit behavior
app.on('window-all-closed', () => {
  // Don't quit the app when all windows are closed - let it run in the tray
  // The app will only quit when explicitly requested via tray menu or app.quit()
  logToRenderer('All windows closed - app continues running in system tray', 'info');
});

app.on('activate', () => {
  // On macOS re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Alert user and wait for confirmation
async function alertUser(title, message, detail = '') {
  return new Promise((resolve) => {
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: title,
      message: message,
      detail: detail,
      buttons: ['OK'],
      defaultId: 0,
      cancelId: 0
    }).then(() => {
      resolve();
    });
  });
}

// Alert user about assignment update failure
async function alertUserToUpdateFailure(errorDetails = '') {
  const detail = errorDetails 
    ? `${errorDetails}\n\nPlease try to update assignments again. If it keeps failing, you might want to watch the update process closely or look in the logs to see what is going wrong.`
    : 'Please try to update assignments again. If it keeps failing, you might want to watch the update process closely or look in the logs to see what is going wrong.';
    
  return alertUser(
    'ALERT: Assignment Update Failed',
    'The assignment scraping failed and needs to be run again.',
    detail
  );
}

// Alert user about successful assignment update
async function alertUserToUpdateSuccess(totalAssignments, breakdown) {
  await showOverlayNotification(
    'success',
    'Success!',
    'Assignments successfully updated.',
    '🎉'
  );
}

// Helper function to check if scraping has been canceled
function checkScrapingCanceled() {
  if (isScrapingCanceled) {
    console.log('Cancellation detected - throwing error to stop scraping');
    throw new Error('Scraping canceled by user');
  }
}

// Make cancellation flag accessible to scrapers
global.isScrapingCanceled = () => isScrapingCanceled;

// Show unified overlay notification
async function showOverlayNotification(type, header, message, icon = '🎉') {
  return new Promise((resolve) => {
    // Read CSS from external file
    const fs = require('fs');
    const cssContent = fs.readFileSync(OVERLAY_NOTIFICATION_CSS_PATH, 'utf8');
    
    // Add animations to CSS
    const cssWithAnimations = cssContent + `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes slideInScale {
        from {
          opacity: 0;
          transform: translateY(-20px) scale(0.9);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
    `;
    
    // Inject CSS into main window
    mainWindow.webContents.insertCSS(cssWithAnimations).then(() => {
      // Create and show the notification overlay
      mainWindow.webContents.executeJavaScript(`
        (function() {
          try {
            // Remove any existing notification overlay
            const existingOverlay = document.getElementById('notification-overlay');
            if (existingOverlay) {
              existingOverlay.remove();
            }
            
            // Create notification overlay
            const overlay = document.createElement('div');
            overlay.id = 'notification-overlay';
            overlay.style.cssText = \`
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              background: rgba(0, 0, 0, 0.7);
              z-index: 9999;
              display: flex;
              align-items: center;
              justify-content: center;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              animation: fadeIn 0.3s ease-out;
            \`;
            
            const notificationBox = document.createElement('div');
            notificationBox.className = 'notification-box ${type}';
            notificationBox.style.cssText = \`
              background: white;
              padding: 40px;
              border-radius: 16px;
              box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
              max-width: 450px;
              text-align: center;
              animation: slideInScale 0.4s ease-out;
            \`;
            
            const iconEl = document.createElement('div');
            iconEl.className = 'notification-icon';
            iconEl.style.cssText = \`
              font-size: 48px;
              margin-bottom: 16px;
              line-height: 1;
            \`;
            iconEl.textContent = '${icon}';
            
            const headerEl = document.createElement('div');
            headerEl.className = 'notification-header';
            headerEl.style.cssText = \`
              font-size: 28px;
              font-weight: 700;
              color: #1d1d1f;
              margin: 0 0 12px 0;
              line-height: 1.2;
            \`;
            headerEl.textContent = '${header}';
            
            const messageEl = document.createElement('div');
            messageEl.className = 'notification-message';
            messageEl.style.cssText = \`
              font-size: 18px;
              color: #424245;
              margin: 0 0 24px 0;
              line-height: 1.4;
              font-weight: 400;
            \`;
            messageEl.textContent = '${message}';
            
            const okButton = document.createElement('button');
            okButton.className = 'notification-button';
            okButton.style.cssText = \`
              background: #007aff;
              color: white;
              border: none;
              padding: 14px 28px;
              border-radius: 8px;
              cursor: pointer;
              font-size: 16px;
              font-weight: 600;
              transition: background-color 0.2s ease;
              min-width: 100px;
            \`;
            okButton.textContent = 'OK';
            
            // Add hover effect
            okButton.addEventListener('mouseenter', () => {
              okButton.style.background = '#0056b3';
            });
            okButton.addEventListener('mouseleave', () => {
              okButton.style.background = '#007aff';
            });
            
            // Handle OK button click
            okButton.addEventListener('click', () => {
              overlay.remove();
              resolve();
            });
            
            // Assemble the overlay
            notificationBox.appendChild(iconEl);
            notificationBox.appendChild(headerEl);
            notificationBox.appendChild(messageEl);
            notificationBox.appendChild(okButton);
            overlay.appendChild(notificationBox);
            document.body.appendChild(overlay);
            
          } catch (error) {
            console.error('Error creating notification overlay:', error);
            resolve();
          }
        })()
      `);
    }).catch(error => {
      console.error('Error injecting CSS:', error);
      resolve();
    });
  });
}

// Timeout wrapper for scraping operations
async function withTimeout(promise, timeoutMs, operationName) {
  return new Promise(async (resolve, reject) => {
    // Set up timeout
    const timeoutId = setTimeout(() => {
      logToRenderer(`Scraping operation timed out after ${timeoutMs / 1000 / 60} minutes: ${operationName}`, 'error');
      isScrapingCanceled = true;
      
      // Clean up browser view
      if (browserView && mainWindow) {
        mainWindow.setBrowserView(null);
        browserView = null;
      }
      
      reject(new Error(`Scraping operation timed out after ${timeoutMs / 1000 / 60} minutes`));
    }, timeoutMs);
    
    try {
      const result = await promise;
      clearTimeout(timeoutId);
      resolve(result);
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

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
    
    // Open DevTools for the BrowserView to allow inspection of scraped pages
    if (process.env.NODE_ENV === 'development') {
      browserView.webContents.openDevTools();
    }
    
    // Smart devtools shortcuts - open for the appropriate window
    mainWindow.webContents.on('before-input-event', (event, input) => {
      // F12 key
      if (input.key === 'F12') {
        event.preventDefault();
        // If browser view is active and visible, open devtools for it
        if (browserView && browserView.webContents && mainWindow.getBrowserView() === browserView) {
          browserView.webContents.openDevTools();
        } else {
          // Otherwise open for main window
          mainWindow.webContents.openDevTools();
        }
      }
      // Cmd+Option+I or Ctrl+Shift+I
      if ((input.meta && input.alt && input.key === 'I') || (input.control && input.shift && input.key === 'I')) {
        event.preventDefault();
        // If browser view is active and visible, open devtools for it
        if (browserView && browserView.webContents && mainWindow.getBrowserView() === browserView) {
          browserView.webContents.openDevTools();
        } else {
          // Otherwise open for main window
          mainWindow.webContents.openDevTools();
        }
      }
    });
    
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

  // Load the logs HTML file
  logsWindow.loadFile(LOGS_HTML_PATH);

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
    // Check for cancellation before starting
    checkScrapingCanceled();
    
    // Ensure we have a browser view
    createBrowserView();
    
    // Check for cancellation after creating browser view
    checkScrapingCanceled();
    
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
    // Check for cancellation before starting
    checkScrapingCanceled();
    
    // Ensure we have a browser view
    createBrowserView();
    
    // Check for cancellation after creating browser view
    checkScrapingCanceled();
    
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
    // Check for cancellation before starting
    checkScrapingCanceled();
    
    // Step 1: Setup Jupiter browser
    const setupResult = await setupJupiterBrowser();
    if (!setupResult.success) {
      return { success: false, error: setupResult.error, assignments: [] };
    }
    
    // Check for cancellation after setup
    checkScrapingCanceled();
    
    // Step 2: Authenticate with Jupiter (credentials guaranteed to exist from pre-checks)
    const accessResult = await handleJupiterAccess(browserView, mainWindow);
    if (!accessResult.success) {
      return { success: false, error: 'Jupiter access failed', assignments: [] };
    }
    
    // Check for cancellation after authentication
    checkScrapingCanceled();
    
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

// Complete workflow: Google Sheets access + scraping
async function runGoogleSheetsWorkflow() {
  logToRenderer('Starting Google Sheets workflow...', 'info');
  try {
    // Check for cancellation before starting
    checkScrapingCanceled();
    
    // Ensure we have a browser view
    createBrowserView();
    
    // Check for cancellation after creating browser view
    checkScrapingCanceled();
    
    // Step 1: Access the Google Sheet (authenticate)
    const accessResult = await handleGoogleSheetsAccess(browserView);
    if (!accessResult.success) {
      return { success: false, error: 'Google Sheets access failed', assignments: [] };
    }
    
    // Check for cancellation after access
    checkScrapingCanceled();
    
    // Step 2: Scrape assignments from the Google Sheet
    const scrapingResult = await scrapeGoogleSheets(browserView);
    
    logToRenderer(`Google Sheets workflow completed: ${scrapingResult.success ? 'Success' : 'Failed'}`, 
                  scrapingResult.success ? 'success' : 'error');
                  
    return scrapingResult;
    
  } catch (error) {
    logToRenderer(`Google Sheets workflow error: ${error.message}`, 'error');
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

/**
 * Standard Jupiter browser setup for all Jupiter operations
 * @returns {Promise<Object>} - Setup result with success status
 */
async function setupJupiterBrowser() {
  try {
    // Ensure we have a browser view
    if (!browserView) {
      createBrowserView();
    }
    
    // Set the browser view as active for user visibility
    setActiveBrowserView('main');
    
    return { success: true };
  } catch (error) {
    logToRenderer(`Error setting up Jupiter browser: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}


// Process results from all workflows and combine them
async function processWorkflowResults(google0Result, google1Result, jupiterResult, sheetsResult) {
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
    
    // Process Google Sheets results
    if (sheetsResult && sheetsResult.success) {
      // Google Sheets assignments are already in standardized format
      allAssignments.push(...sheetsResult.assignments);
      logToRenderer(`Collected ${sheetsResult.assignments.length} Google Sheets assignments`, 'success');
    } else if (sheetsResult) {
      logToRenderer(`Google Sheets workflow failed: ${sheetsResult.error}`, 'warn');
    }
    
    // Step 1: Load previous data for comparison FIRST
    logToRenderer('Loading previous data for comparison...', 'info');
    const previousData = backupSystem.loadMostRecentBackup();

    // Step 2: Create backup before processing results
    logToRenderer('Creating backup of current assignments...', 'info');
    await backupSystem.createBackup();
    
    // Step 3: Check for any failures and alert user if needed
    logToRenderer(`Checking results: Google0=${!!google0Result?.success}, Google1=${!!google1Result?.success}, Jupiter=${!!jupiterResult?.success}, Sheets=${!!sheetsResult?.success}`, 'info');
    
    const anyFailures = (!google0Result || (!google0Result.success && !google0Result.skipped)) ||
                       (!google1Result || (!google1Result.success && !google1Result.skipped)) ||
                       (!jupiterResult || !jupiterResult.success) ||
                       (sheetsResult && !sheetsResult.success && !sheetsResult.skipped);
    
    if (anyFailures) {
      logToRenderer('Some scrapers failed - showing error alert', 'error');
      // Hide browser view before showing alert
      mainWindow.setBrowserView(null);
      await alertUserToUpdateFailure();
    } else {
      logToRenderer('All scrapers completed successfully', 'success');
    }
    
    // Step 4: Handle suspicious zero results for backup system
    const scrapingResults = { 
      google0Result: google0Result, 
      google1Result: google1Result, 
      jupiterResult: jupiterResult,
      sheetsResult: sheetsResult
    };
    const analysis = backupSystem.analyzeResults(scrapingResults, previousData?.data);
    
    if (analysis.suspiciousResults) {
      logToRenderer(`Detected suspicious results - requesting user confirmation`, 'warning');
      
      // Hide browser view before showing confirmation dialog
      mainWindow.setBrowserView(null);
      
      const userResponse = await new Promise((resolve) => {
        // Send confirmation request to renderer
        mainWindow.webContents.send('show-suspicious-results-dialog', analysis.anomalies);
        
        // Listen for response
        const responseHandler = (event, response) => {
          ipcMain.removeListener('suspicious-results-response', responseHandler);
          resolve(response);
        };
        
        ipcMain.once('suspicious-results-response', responseHandler);
      });
      
      if (userResponse && userResponse.action === 'reject') {
        logToRenderer('User rejected suspicious results - merging from backup', 'info');
        const sourcesToRestore = userResponse.rejectedSources || [];
        const finalResults = await backupSystem.mergeFromBackup(scrapingResults, sourcesToRestore);
        
        // Rebuild allAssignments with merged data
        allAssignments = [];
        
        if (finalResults.google0Result && finalResults.google0Result.success) {
          const standardizedGoogle0 = await convertGoogleAssignments(finalResults.google0Result.assignments);
          allAssignments.push(...standardizedGoogle0);
        }
        
        if (finalResults.google1Result && finalResults.google1Result.success) {
          const standardizedGoogle1 = await convertGoogleAssignments(finalResults.google1Result.assignments);
          allAssignments.push(...standardizedGoogle1);
        }
        
        if (finalResults.jupiterResult && finalResults.jupiterResult.success) {
          const standardizedJupiter = await convertJupiterAssignments(finalResults.jupiterResult.assignments);
          allAssignments.push(...standardizedJupiter);
        }
        
        logToRenderer(`Rebuilt assignments with backup data: ${allAssignments.length} total assignments`, 'success');
      }
    }
    
    // Step 5: Save all assignments (but not if we have failures and 0 assignments)
    if (anyFailures && allAssignments.length === 0) {
      logToRenderer('Not saving assignments - all scrapers failed and no assignments collected', 'warning');
      logToRenderer('Previous assignments file preserved', 'info');
    } else {
      const saveSuccess = await saveAssignments(allAssignments);
      if (saveSuccess) {
        logToRenderer(`Successfully saved ${allAssignments.length} total assignments`, 'success');
        
        // Clean up old backups
        backupSystem.cleanupOldBackups(5);
      } else {
        logToRenderer('Failed to save assignments to file', 'warn');
      }
    }
    
    // Automatically switch to assignments view after saving (only if no failures)
    if (mainWindow && mainWindow.webContents && !anyFailures) {
      mainWindow.webContents.send('switch-to-assignments-view');
    } else if (anyFailures) {
      logToRenderer('Not auto-switching to assignments view due to scraping failures', 'info');
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

// Handle success notification from renderer (after cleanup is complete)
ipcMain.handle('show-success-notification', async (event, totalAssignments, breakdown) => {
  await alertUserToUpdateSuccess(totalAssignments, breakdown);
});

// Handle log messages from renderer
ipcMain.on('log-message', (event, { message, type, timestamp }) => {
  // Only log to console for debugging, not for user display
  console.log(`[${timestamp}] [RENDERER] [${type.toUpperCase()}] ${message}`);
});

// Handle view switching from main process
ipcMain.handle('switch-to-view', async (event, viewName) => {
  mainWindow.webContents.send('switch-to-view', viewName);
  return { success: true };
});

ipcMain.handle('start-unified-auth', async () => {
  logToRenderer('Starting assignment update process...', 'info');
  
  // Reset cancel flag at start of scraping
  isScrapingCanceled = false;
  isScrapingRunning = true;
  
  // Wrap the entire scraping process with a 20-minute timeout
  const SCRAPING_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes
  
  try {
    const result = await withTimeout(
      runScrapingProcess(),
      SCRAPING_TIMEOUT_MS,
      'Main scraping process'
    );
    
    // Track success if scraping completed successfully
    if (result && result.success) {
      await markScrapingSuccess();
    }
    
    // Clear scraping running flag
    isScrapingRunning = false;
    return result;
  } catch (error) {
    // Clear scraping running flag on error
    isScrapingRunning = false;
    
    if (error.message.includes('timed out')) {
      logToRenderer('Scraping process timed out - cleaning up resources', 'error');
      // Mark scraping as failed for tracking
      await markScrapingFailure('Scraping timed out after 20 minutes');
      return { success: false, error: 'Scraping timed out after 20 minutes' };
    }
    throw error;
  }
});

// Extract the main scraping logic into a separate function
async function runScrapingProcess() {
  try {
    // Load app settings first
    const appSettings = await getAppSettings();
    logToRenderer(`App settings loaded: NYC Students=${appSettings.scrape_nyc_students_google}, HSMSE=${appSettings.scrape_hsmse_google}, Geometry=${appSettings.scrape_geometry_calendar}, Jupiter=${appSettings.scrape_jupiter}`, 'info');
    
    // Step 1: Run scraping validation checks
    logToRenderer('=== SCRAPING VALIDATION CHECKS ===', 'info');
    const checkResults = await runScrapingValidation(mainWindow, appSettings);
    
    // Handle user action requirements - just open settings and stop
    if (checkResults.requiresUserAction) {
      logToRenderer(`Pre-scraping check requires user action: ${checkResults.userActionType}`, 'instruction');
      
      // Show alert dialog
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Jupiter Ed Configuration Required',
        message: 'We need your Jupiter Ed settings first!',
        detail: 'Please configure your Jupiter Ed credentials and class selection in the settings window that will open. This is required before the app can scrape your assignments.',
        buttons: ['Open Settings'],
        defaultId: 0
      });
      
      // Open settings window and stop here
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('open-settings');
        
        // Wait a moment for settings window to open, then send scroll instruction
        setTimeout(() => {
          if (settingsWindow && settingsWindow.webContents) {
            if (checkResults.userActionType === 'jupiter-login') {
              settingsWindow.webContents.send('scroll-to-jupiter-credentials');
            } else if (checkResults.userActionType === 'jupiter-class-selection') {
              settingsWindow.webContents.send('scroll-to-jupiter-classes');
            }
          }
        }, 500); // Small delay to ensure settings window is ready
      }
      
      return { success: false, error: `Please configure your settings: ${checkResults.message}` };
    }
    
    if (!checkResults.success) {
      return { success: false, error: checkResults.message };
    }
    
    // Check if canceled before starting workflows
    if (isScrapingCanceled) {
      logToRenderer('Assignment update canceled by user', 'info');
      return { success: false, error: 'Assignment Update Canceled' };
    }
    
    // Switch to scraping view after successful scraping validation
    logToRenderer('Scraping validation completed successfully - switching to scraping view', 'info');
    mainWindow.webContents.send('switch-to-view', 'scraping');
    
    logToRenderer('=== STARTING SCRAPING WORKFLOWS ===', 'info');
    
    // Ensure we have a browser view
    createBrowserView();
    
    logToRenderer('Running sequential workflows: Google /u/0, then Google /u/1, then Jupiter...', 'info');
    
    // Show browser view initially
    setActiveBrowserView('main');
    
    
    // Run all workflows sequentially (not in parallel)
    const results = [];
    let google0Result;
    let google1Result;
 
    // Run Google /u/0 workflow (if enabled)
    if (appSettings.scrape_nyc_students_google) {
      // Check if canceled before Google /u/0
      if (isScrapingCanceled) {
        logToRenderer('Assignment update canceled by user', 'info');
        return { success: false, error: 'Assignment Update Canceled' };
      }
      
      logToRenderer('Running Google /u/0 workflow...', 'info');
      google0Result = await runGoogleWorkflow0();
      results.push({ type: 'google0', result: google0Result });
    } else {
      logToRenderer('Skipping Google /u/0 workflow (disabled in settings)', 'info');
      google0Result = { success: true, assignments: [], skipped: true, reason: 'Disabled in settings' };
      results.push({ type: 'google0', result: google0Result });
    }
    
    // Check for authentication failure in /u/0 (only if workflow was executed)
    if (appSettings.scrape_nyc_students_google && google0Result.needsAuth) {
      logToRenderer('Google /u/0 authentication failed - waiting for user to authenticate', 'warn');
      const { waitForAuthentication } = require('access/google-access');
      await waitForAuthentication(browserView, 'nycstudents');
      
      // Retry /u/0 scraping after authentication
      logToRenderer('Retrying Google /u/0 scraping after authentication...', 'info');
      const retryGoogle0Result = await runGoogleWorkflow0();
      
      // Replace the failed result with the successful retry result
      const google0Index = results.findIndex(r => r.type === 'google0');
      if (google0Index !== -1) {
        results[google0Index] = { type: 'google0', result: retryGoogle0Result };
      } else {
        results.push({ type: 'google0', result: retryGoogle0Result });
      }
    }
    
    // Run Google /u/1 workflow (if enabled)
    if (appSettings.scrape_hsmse_google) {
      // Check if canceled before Google /u/1
      if (isScrapingCanceled) {
        logToRenderer('Assignment update canceled by user', 'info');
        return { success: false, error: 'Assignment Update Canceled' };
      }
      
      logToRenderer('Running Google /u/1 workflow...', 'info');
      google1Result = await runGoogleWorkflow1();
      results.push({ type: 'google1', result: google1Result });
      
      // Check for authentication failure in /u/1
      if (google1Result.needsAuth) {
        logToRenderer('Google /u/1 authentication failed - waiting for user to authenticate', 'warn');
        const { waitForAuthentication } = require('access/google-access');
        await waitForAuthentication(browserView, 'hsmse');
        
        // Retry /u/1 scraping after authentication
        logToRenderer('Retrying Google /u/1 scraping after authentication...', 'info');
        const retryGoogle1Result = await runGoogleWorkflow1();
        
        // Replace the failed result with the successful retry result
        const google1Index = results.findIndex(r => r.type === 'google1');
        if (google1Index !== -1) {
          results[google1Index] = { type: 'google1', result: retryGoogle1Result };
        } else {
          results.push({ type: 'google1', result: retryGoogle1Result });
        }
      }
    } else {
      logToRenderer('Skipping Google /u/1 workflow (disabled in settings)', 'info');
      google1Result = { success: true, assignments: [], skipped: true, reason: 'Disabled in settings' };
      results.push({ type: 'google1', result: google1Result });
    }
    
    // Run Jupiter workflow (if enabled)
    if (appSettings.scrape_jupiter) {
      // Check if canceled before Jupiter
      if (isScrapingCanceled) {
        logToRenderer('Assignment update canceled by user', 'info');
        return { success: false, error: 'Assignment Update Canceled' };
      }
      
      logToRenderer('Running Jupiter workflow...', 'info');
      const jupiterResult = await runJupiterWorkflow();
      results.push({ type: 'jupiter', result: jupiterResult });
    } else {
      logToRenderer('Skipping Jupiter workflow (disabled in settings)', 'info');
      results.push({ type: 'jupiter', result: { success: true, assignments: [], skipped: true, reason: 'Disabled in settings' } });
    }
    
    // Run Google Sheets workflow (if enabled)
    if (appSettings.scrape_geometry_calendar) {
      // Check if canceled before Google Sheets
      if (isScrapingCanceled) {
        logToRenderer('Assignment update canceled by user', 'info');
        return { success: false, error: 'Assignment Update Canceled' };
      }
      
      logToRenderer('Running Google Sheets workflow...', 'info');
      const sheetsResult = await runGoogleSheetsWorkflow();
      results.push({ type: 'sheets', result: sheetsResult });
    } else {
      logToRenderer('Skipping Google Sheets workflow (disabled in settings)', 'info');
      results.push({ type: 'sheets', result: { success: true, assignments: [], skipped: true, reason: 'Disabled in settings' } });
    }
    
    // Extract results from our sequential execution
    const finalGoogle0Result = results.find(r => r.type === 'google0').result;
    const finalGoogle1Result = results.find(r => r.type === 'google1').result;
    const finalJupiterResult = results.find(r => r.type === 'jupiter').result;
    const finalSheetsResult = results.find(r => r.type === 'sheets').result;
    
    try {
      const result = await processWorkflowResults(finalGoogle0Result, finalGoogle1Result, finalJupiterResult, finalSheetsResult);
      
      // Don't show success message here - let the renderer handle it after cleanup
      
      return result;
    } catch (processingError) {
      logToRenderer(`Error processing workflow results: ${processingError.message}`, 'error');
      logToRenderer('Showing error alert due to processing failure', 'error');
      await alertUserToUpdateFailure(`Processing error: ${processingError.message}`);
      return { success: false, error: `Processing failed: ${processingError.message}` };
    }

  } catch (error) {
    logToRenderer(`Error in integrated workflow: ${error.message}`, 'error');
    logToRenderer('Showing error alert due to workflow failure', 'error');
    await alertUserToUpdateFailure(`Workflow error: ${error.message}`);
    // Mark scraping as failed for tracking
    await markScrapingFailure(error.message);
    return { success: false, error: error.message };
  }
}

// Function to mark scraping failures for tracking
async function markScrapingFailure(errorMessage) {
  try {
    const settings = await getAppSettings();
    const failureData = {
      lastScrapingFailed: true,
      lastFailureTime: new Date().toISOString(),
      lastFailureReason: errorMessage
    };
    
    const updatedSettings = {
      ...settings,
      ...failureData,
      last_updated: new Date().toISOString()
    };
    
    await fs.promises.writeFile(APP_SETTINGS_FILE, JSON.stringify(updatedSettings, null, 2));
    logToRenderer(`Scraping failure tracked: ${errorMessage}`, 'info');
  } catch (error) {
    logToRenderer(`Error tracking scraping failure: ${error.message}`, 'error');
  }
}

// Function to mark scraping success
async function markScrapingSuccess() {
  try {
    const settings = await getAppSettings();
    const successData = {
      lastScrapingFailed: false,
      lastSuccessTime: new Date().toISOString()
    };
    
    const updatedSettings = {
      ...settings,
      ...successData,
      last_updated: new Date().toISOString()
    };
    
    await fs.promises.writeFile(APP_SETTINGS_FILE, JSON.stringify(updatedSettings, null, 2));
    logToRenderer('Scraping success tracked', 'info');
  } catch (error) {
    logToRenderer(`Error tracking scraping success: ${error.message}`, 'error');
  }
}

ipcMain.handle('cancel-scraping', async () => {
  console.log('Cancel request received - setting isScrapingCanceled = true');
  logToRenderer('Assignment update canceled by user', 'info');
  isScrapingCanceled = true;
  isScrapingRunning = false;
  console.log('Cancel flags set - isScrapingCanceled:', isScrapingCanceled, 'isScrapingRunning:', isScrapingRunning);
  return { success: true };
});

ipcMain.handle('show-cancel-confirmation', async () => {
  await showOverlayNotification(
    'info',
    'Update Canceled',
    'The assignment update has been canceled successfully.',
    '⏹️'
  );
  return { response: 0 }; // Return same format as dialog.showMessageBox
});

ipcMain.handle('save-jupiter-credentials', async (event, { student_name, password, loginType }) => {
  try {
    const credentials = { student_name, password, loginType };
    const saveResult = await saveJupiterCredentials(credentials);
    
    if (saveResult.success) {
      logToRenderer('Jupiter credentials saved successfully', 'info');
      return { success: true, message: 'Credentials saved successfully' };
    } else {
      return saveResult;
    }
  } catch (error) {
    logToRenderer(`Failed to handle Jupiter credentials: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
});

// Handle renderer logs
ipcMain.on('renderer-log', (event, logData) => {
  // Forward to the main logger
  logToRenderer(logData.message, logData.type);
});

// Settings window IPC handlers
ipcMain.handle('open-settings', () => {
  createSettingsWindow();
});

ipcMain.handle('get-jupiter-credentials', async () => {
  try {
    const fs = require('fs');
    const { JUPITER_SECRET_PATH } = require('config/constants');
    
    if (fs.existsSync(JUPITER_SECRET_PATH)) {
      const credentials = JSON.parse(fs.readFileSync(JUPITER_SECRET_PATH, 'utf8'));
      return credentials;
    }
    return null;
  } catch (error) {
    logToRenderer(`Error loading Jupiter credentials: ${error.message}`, 'error');
    return null;
  }
});

ipcMain.handle('get-jupiter-config', async () => {
  try {
    const fs = require('fs');
    const { JUPITER_CONFIG_PATH } = require('config/constants');
    
    if (fs.existsSync(JUPITER_CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(JUPITER_CONFIG_PATH, 'utf8'));
      return config;
    }
    return null;
  } catch (error) {
    logToRenderer(`Error loading Jupiter config: ${error.message}`, 'error');
    return null;
  }
});

ipcMain.handle('test-jupiter-login', async (event, credentials) => {
  try {
    // Step 1: Setup Jupiter browser
    const setupResult = await setupJupiterBrowser();
    if (!setupResult.success) {
      return { success: false, error: setupResult.error };
    }
    
    // Step 2: Attempt login (this will handle browser setup and navigation)
    const { loginToJupiter } = require('access/jupiter-access');
    const result = await loginToJupiter(browserView, credentials, mainWindow);
    
    if (result.success) {
      // Check if Jupiter config exists, if not, automatically load classes
      const fs = require('fs');
      const { JUPITER_CONFIG_PATH } = require('config/constants');
      
      if (!fs.existsSync(JUPITER_CONFIG_PATH)) {
        // Auto-load classes
        const { getAvailableJupiterClasses } = require('scrapers/jupiter-scraper');
        const { handleJupiterAccess } = require('access/jupiter-access');
        
        try {
          await handleJupiterAccess(browserView, mainWindow);
          const classesResult = await getAvailableJupiterClasses(browserView);
          
          if (classesResult.success) {
            // Update the settings window to show the loaded classes
            if (settingsWindow && settingsWindow.webContents) {
              settingsWindow.webContents.send('classes-loaded');
            }
          }
        } catch (autoLoadError) {
          // Silent fail - error will be handled by settings window
        }
      }
    }
    
    return result;
  } catch (error) {
    logToRenderer(`Error during test login: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-jupiter-classes', async () => {
  try {
    // Step 1: Setup Jupiter browser
    const setupResult = await setupJupiterBrowser();
    if (!setupResult.success) {
      return { success: false, error: setupResult.error };
    }
    
    // Step 2: Authenticate with Jupiter (same as in runJupiterWorkflow)
    const accessResult = await handleJupiterAccess(browserView, mainWindow);
    if (!accessResult.success) {
      return { success: false, error: 'Jupiter authentication failed. Please check your credentials in Settings.' };
    }
    
    // Step 2: Get available classes using the Jupiter scraper
    const { getAvailableJupiterClasses } = require('scrapers/jupiter-scraper');
    const classes = await getAvailableJupiterClasses(browserView);
    
    if (classes && classes.length > 0) {
      // Update the settings window to show the loaded classes
      if (settingsWindow && settingsWindow.webContents) {
        settingsWindow.webContents.send('classes-loaded');
      }
      return { success: true, classes };
    } else {
      return { success: false, error: 'No classes found. Please check your login credentials.' };
    }
  } catch (error) {
    logToRenderer(`Error loading Jupiter classes: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-jupiter-config', async (event, classes) => {
  try {
    const fs = require('fs');
    const { JUPITER_CONFIG_PATH } = require('config/constants');
    
    // Add timestamp to the config
    const config = {
      ...classes,
      last_updated: new Date().toISOString()
    };
    
    fs.writeFileSync(JUPITER_CONFIG_PATH, JSON.stringify(config, null, 2));
    logToRenderer('Jupiter configuration saved successfully', 'info');
    return { success: true };
  } catch (error) {
    logToRenderer(`Error saving Jupiter config: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-jupiter-credentials', async () => {
  try {
    const fs = require('fs');
    const { JUPITER_SECRET_PATH } = require('config/constants');
    
    if (fs.existsSync(JUPITER_SECRET_PATH)) {
      fs.unlinkSync(JUPITER_SECRET_PATH);
      logToRenderer('Jupiter credentials deleted successfully', 'info');
      return { success: true };
    } else {
      logToRenderer('No Jupiter credentials file found to delete', 'info');
      return { success: true };
    }
  } catch (error) {
    logToRenderer(`Error deleting Jupiter credentials: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
});


// Helper function to get app settings
async function getAppSettings() {
  try {
    if (fs.existsSync(APP_SETTINGS_FILE)) {
      const settings = JSON.parse(fs.readFileSync(APP_SETTINGS_FILE, 'utf8'));
      return settings;
    } else {
      // Return default settings
      return {
        scrape_nyc_students_google: true,
        scrape_hsmse_google: true,
        scrape_geometry_calendar: true,
        scrape_jupiter: true,
        // Default scheduling settings
        schedule_enabled: false,
        schedule_time: '15:30' // 3:30 PM default
      };
    }
  } catch (error) {
    logToRenderer(`Error loading app settings: ${error.message}`, 'error');
    return {
      scrape_nyc_students_google: true,
      scrape_hsmse_google: true,
      scrape_geometry_calendar: true,
      scrape_jupiter: true,
      schedule_enabled: false,
      schedule_time: '15:30'
    };
  }
}

// Initialize scheduler with current settings
async function initializeScheduler() {
  try {
    const settings = await getAppSettings();
    
    if (settings.schedule_enabled && settings.schedule_time) {
      logToRenderer(`Initializing scheduler for daily scraping at ${settings.schedule_time}`, 'info');
      scheduler.scheduleDailyScraping(settings.schedule_time, settings.schedule_enabled);
    } else {
      logToRenderer('Scheduler disabled in settings', 'info');
    }
  } catch (error) {
    logToRenderer(`Error initializing scheduler: ${error.message}`, 'error');
  }
}


// Create system tray
function createSystemTray() {
  try {
    // Create tray icon from the app icon
    const iconPath = ICON_PATH;
    const trayIcon = nativeImage.createFromPath(iconPath);
    
    // Resize icon for system tray (16x16 or 32x32 depending on platform)
    const resizedIcon = trayIcon.resize({ width: 16, height: 16 });
    
    systemTray = new Tray(resizedIcon);
    systemTray.setToolTip('HSMSE Homework Checker');
    
    // Set initial context menu
    updateSystemTrayMenu();
    
    // Don't handle tray click - users should use the context menu "Open" option
    // This prevents accidental minimize/show behavior
    
    logToRenderer('System tray created successfully', 'info');
    
  } catch (error) {
    logToRenderer(`Error creating system tray: ${error.message}`, 'error');
  }
}

// Check if this is first launch and show help window
async function checkFirstLaunchAndShowHelp() {
  try {
    // Check if app settings file exists - if not, this is first launch
    if (!fs.existsSync(APP_SETTINGS_FILE)) {
      logToRenderer('First launch detected - showing help window', 'info');
      
      // Create and show help window
      const { BrowserWindow } = require('electron');
      const { APP_NAME, HELP_FILE_PATH, HELP_CSS_PATH } = require('config/constants');
      
      const helpWindow = new BrowserWindow({
        width: 700,
        height: 600,
        resizable: true,
        minimizable: true,
        maximizable: true,
        title: `About ${APP_NAME}`,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false
        }
      });
      
      // Load the help HTML file
      helpWindow.loadFile(HELP_FILE_PATH);
      
      // Inject the CSS path into the HTML
      helpWindow.webContents.once('dom-ready', () => {
        helpWindow.webContents.executeJavaScript(`
          const link = document.querySelector('link[href="help.css"]');
          if (link) {
            link.href = '${HELP_CSS_PATH.replace(/\\/g, '/')}';
          }
        `);
      });
      
      // Show the window
      helpWindow.show();
      
      logToRenderer('Help window opened for first-time user', 'success');
    }
  } catch (error) {
    logToRenderer(`Error checking first launch: ${error.message}`, 'error');
  }
}

// Check for and show failure alerts on app startup
async function checkForFailureAlerts() {
  try {
    const settings = await getAppSettings();
    
    if (settings.lastScrapingFailed && settings.lastFailureTime) {
      const failureTime = new Date(settings.lastFailureTime);
      const now = new Date();
      const hoursSinceFailure = (now.getTime() - failureTime.getTime()) / (1000 * 60 * 60);
      
      // Only show alert if failure was recent (within last 24 hours)
      if (hoursSinceFailure < 24) {
        logToRenderer(`Last scraping failed ${Math.round(hoursSinceFailure)} hours ago: ${settings.lastFailureReason}`, 'warn');
        
        // Show prominent alert to user
        await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'ALERT: Last Update Failed',
          message: 'ALERT: Last Update Failed',
          detail: `The last assignment scraping failed and needs to be run manually.\n\nFailure occurred ${Math.round(hoursSinceFailure)} hours ago.\nReason: ${settings.lastFailureReason}\n\nPlease try to update assignments again. If it keeps failing, you might want to watch the update process closely or look in the logs to see what is going wrong.`,
          buttons: ['Run Manual Update', 'View Logs', 'Dismiss'],
          defaultId: 0,
          cancelId: 2
        }).then((result) => {
          if (result.response === 0) {
            // User chose to run manual update
            mainWindow.webContents.send('start-manual-scraping');
          } else if (result.response === 1) {
            // User chose to view logs
            createLogsWindow();
          }
        });
      }
    }
  } catch (error) {
    logToRenderer(`Error checking for failure alerts: ${error.message}`, 'error');
  }
}

// App Settings IPC Handlers
ipcMain.handle('get-app-settings', async () => {
  try {
    if (fs.existsSync(APP_SETTINGS_FILE)) {
      const settings = JSON.parse(fs.readFileSync(APP_SETTINGS_FILE, 'utf8'));
      return settings;
    } else {
      // Return default settings
      return {
        scrape_nyc_students_google: true,
        scrape_hsmse_google: true,
        scrape_geometry_calendar: true,
        scrape_jupiter: true
      };
    }
  } catch (error) {
    logToRenderer(`Error loading app settings: ${error.message}`, 'error');
    return {
      scrape_nyc_students_google: true,
      scrape_hsmse_google: true,
      scrape_geometry_calendar: true
    };
  }
});

ipcMain.handle('save-app-settings', async (event, settings) => {
  try {
    const settingsWithTimestamp = {
      ...settings,
      last_updated: new Date().toISOString()
    };
    
    await fs.promises.writeFile(APP_SETTINGS_FILE, JSON.stringify(settingsWithTimestamp, null, 2));
    logToRenderer('App settings saved successfully', 'info');
    
    // Update scheduler if scheduling settings changed
    if (settings.schedule_enabled !== undefined || settings.schedule_time !== undefined) {
      if (settings.schedule_enabled && settings.schedule_time) {
        logToRenderer(`Updating scheduler for daily scraping at ${settings.schedule_time}`, 'info');
        scheduler.scheduleDailyScraping(settings.schedule_time, settings.schedule_enabled);
      } else {
        logToRenderer('Disabling scheduler', 'info');
        scheduler.clearSchedule();
      }
      
      // Update system tray menu to reflect new status
      updateSystemTrayMenu();
    }
    
    return { success: true };
  } catch (error) {
    logToRenderer(`Error saving app settings: ${error.message}`, 'error');
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
  console.log(`[Main] Assignments file path requested: ${ASSIGNMENTS_FILE}`);
  return ASSIGNMENTS_FILE;
});

ipcMain.handle('get-assignments', async () => {
  try {
    const fs = require('fs');
    if (fs.existsSync(ASSIGNMENTS_FILE)) {
      const data = fs.readFileSync(ASSIGNMENTS_FILE, 'utf8');
      return JSON.parse(data);
    } else {
      return [];
    }
  } catch (error) {
    console.error(`Error loading assignments: ${error.message}`);
    return [];
  }
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

// Handle getting log file path
ipcMain.handle('get-log-file-path', () => {
  const { LOG_FILE } = require('config/constants');
  return LOG_FILE;
});

// Scheduler IPC handlers
ipcMain.handle('get-scheduler-status', () => {
  return scheduler.getStatus();
});

ipcMain.handle('test-scheduled-scraping', async () => {
  logToRenderer('Testing scheduled scraping...', 'info');
  await scheduler.runScheduledScraping();
  return { success: true };
});

ipcMain.handle('stop-scheduler', () => {
  scheduler.stop();
  return { success: true };
});

// Auto-startup IPC handlers
ipcMain.handle('get-auto-startup-status', async () => {
  try {
    const isEnabled = await autoStartup.isAutoStartupEnabled();
    return { success: true, enabled: isEnabled };
  } catch (error) {
    logToRenderer(`Error getting auto-startup status: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-auto-startup', async (event, enabled) => {
  try {
    const result = await autoStartup.enableAutoStartup(enabled);
    return result;
  } catch (error) {
    logToRenderer(`Error setting auto-startup: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
});

// Function to start scraping (used by tray and menu)
async function startScraping() {
  try {
    logToRenderer('Starting scraping from tray/menu...', 'info');
    
    // Reset cancel flag at start of scraping
    isScrapingCanceled = false;
    isScrapingRunning = true;
    
    // Wrap the entire scraping process with a 20-minute timeout
    const SCRAPING_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes
    
    const result = await withTimeout(
      runScrapingProcess(),
      SCRAPING_TIMEOUT_MS,
      'Main scraping process'
    );
    
    // Track success if scraping completed successfully
    if (result && result.success) {
      await markScrapingSuccess();
    }
    
    // Clear scraping running flag
    isScrapingRunning = false;
    return result;
  } catch (error) {
    // Clear scraping running flag on error
    isScrapingRunning = false;
    
    if (error.message.includes('timed out')) {
      logToRenderer('Scraping process timed out - cleaning up resources', 'error');
      // Mark scraping as failed for tracking
      await markScrapingFailure('Scraping timed out after 20 minutes');
      return { success: false, error: 'Scraping timed out after 20 minutes' };
    }
    throw error;
  }
}

// Update system tray menu based on current status
function updateSystemTrayMenu() {
  if (!systemTray) return;
  
  try {
    const status = scheduler.getStatus();
    const isScheduled = status.isScheduled;
    const nextRunTime = status.nextRunTime;
    
    // Create context menu with dynamic content
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
            // On macOS, show the dock icon again
            if (process.platform === 'darwin') {
              app.dock.show();
            }
          }
        }
      },
      {
        label: 'Update Assignments Now',
        click: async () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
            // On macOS, show the dock icon again
            if (process.platform === 'darwin') {
              app.dock.show();
            }
            // Start scraping immediately
            try {
              await startScraping();
            } catch (error) {
              logToRenderer(`Error starting scraping from tray: ${error.message}`, 'error');
            }
          }
        }
      },
      { type: 'separator' },
      {
        label: isScheduled ? 'Scheduled Scraping' : 'Scheduled Scraping (Disabled)',
        enabled: false
      },
      ...(isScheduled && nextRunTime ? [{
        label: `Next run: ${new Date(nextRunTime).toLocaleString()}`,
        enabled: false
      }] : []),
      { type: 'separator' },
      {
        label: 'Settings',
        click: () => {
          createSettingsWindow();
        }
      },
      {
        label: 'View Logs',
        click: () => {
          createLogsWindow();
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          // Force quit the app when user explicitly chooses quit from tray
          app.exit(0);
        }
      }
    ]);
    
    systemTray.setContextMenu(contextMenu);
    
  } catch (error) {
    logToRenderer(`Error updating system tray menu: ${error.message}`, 'error');
  }
}

// Export functions for use by scheduler and app menu
module.exports = {
  runScrapingProcess,
  markScrapingFailure,
  markScrapingSuccess,
  createLogsWindow,
  createSettingsWindow
};

