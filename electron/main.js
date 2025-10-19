const { app, BrowserWindow, BrowserView, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Import utilities
const { initializeLogger, logToRenderer } = require('./core/logger');
const { BROWSER_VIEW_BOUNDS } = require('./config/constants');

// Import access modules
const { checkGoogleAccess } = require('./access/google-access');
const { handleJupiterAccess, saveJupiterCredentials, loginToJupiter } = require('./access/jupiter-access');

// Keep a global reference of the window object
let mainWindow;
let browserView;



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
    logToRenderer('Application window shown', 'success');
  });

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
    
    logToRenderer('BrowserView created and configured with navigation controls', 'success');
  }
}

// Handle log messages from renderer
ipcMain.on('log-message', (event, { message, type, timestamp }) => {
  // Only log to console for debugging, not for user display
  console.log(`[${timestamp}] [RENDERER] [${type.toUpperCase()}] ${message}`);
});

ipcMain.handle('start-unified-auth', async () => {
  logToRenderer('Starting authentication and assignment check...', 'info');
  createBrowserView();

  try {
    // Check Google Classroom access
    const googleResult = await checkGoogleAccess(browserView);
    
    if (googleResult.success) {
      // If Google access is successful, proceed to Jupiter
      return await handleJupiterAccess(browserView, mainWindow);
    } else {
      // Return Google access failure
      return googleResult;
    }

  } catch (error) {
    logToRenderer(`An error occurred during the authentication flow: ${error.message}`, 'error');
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

// Handle tab switching
ipcMain.on('switch-tab', (event, tabName) => {
  if (tabName === 'browser') {
    if (browserView) {
      mainWindow.setBrowserView(browserView);
      browserView.webContents.focus();
    }
  } else if (tabName === 'logs' || tabName === 'jupiter-login') {
    // Hide browser view when logs or jupiter form is active
    if (browserView) {
      mainWindow.setBrowserView(null);
    }
  }
});