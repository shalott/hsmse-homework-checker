const { app, BrowserWindow, BrowserView, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep a global reference of the window object
let mainWindow;
let browserView;

// Account configurations
const ACCOUNTS = {
  nycstudents: {
    name: 'NYC Students',
    assignedUrl: 'https://classroom.google.com/u/0/a/not-turned-in/all',
    expectedDomain: 'nycstudents.net'
  },
  hsmse: {
    name: 'HSMSE',
    assignedUrl: 'https://classroom.google.com/u/1/a/not-turned-in/all',
    expectedDomain: 'hsmse.org'
  }
};

// Logging function
function logToRenderer(message, type = 'info') {
  // For instructions or success messages, send to a dedicated channel
  if (type === 'instruction' || type === 'success') {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      try {
        mainWindow.webContents.send('instruction-message', { message });
      } catch (error) {
        console.log(`[ERROR] Failed to send instruction to renderer: ${error.message}`);
      }
    }
    // Also log success messages to the console/log tab for a complete record
    if (type === 'success') {
       console.log(`[SUCCESS] ${message}`);
       if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
          try {
            mainWindow.webContents.send('log-message', { 
              message, 
              type, 
              timestamp: new Date().toLocaleTimeString() 
            });
          } catch (error) {
            console.log(`[ERROR] Failed to send log to renderer: ${error.message}`);
          }
       }
    }
    return;
  }

  // For all other log types, log to console and send to the 'log-message' channel
  console.log(`[${type.toUpperCase()}] ${message}`);
  
  // Check if the window and its contents are still valid before sending a message
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    try {
      mainWindow.webContents.send('log-message', { 
        message, 
        type, 
        timestamp: new Date().toLocaleTimeString() 
      });
    } catch (error) {
      console.log(`[ERROR] Failed to send log to renderer: ${error.message}`);
    }
  }
}

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
  mainWindow.loadFile(path.join(__dirname, 'app.html'));

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
      x: 280,  // Start after 280px sidebar
      y: 90,   // Below instructions panel (40px) + tabs (50px)
      width: width - 300,  // Full width minus sidebar and padding
      height: height - 160  // Full height minus instructions, tabs, and status bar (30px)
    });
    
    logToRenderer(`BrowserView positioned at x:280, y:90, size:${width - 300}x${height - 160}`, 'info');
    
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
          x: 280,  // Start after 280px sidebar
          y: 90,   // Below instructions panel + tabs
          width: width - 300,  // Full width minus sidebar and padding
          height: height - 160  // Full height minus instructions, tabs, and status bar (30px)
        });
        logToRenderer(`BrowserView resized to ${width - 300}x${height - 160}`, 'info');
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
    const hsmseUrl = ACCOUNTS.hsmse.assignedUrl;
    const nycstudentsUrl = ACCOUNTS.nycstudents.assignedUrl;

    // 1. Attempt to navigate to the HSMSE assignments page
    logToRenderer(`Attempting to access HSMSE assignments at ${hsmseUrl}`, 'info');
    await browserView.webContents.loadURL(hsmseUrl);

    // Wait for any redirects to settle
    await new Promise(resolve => setTimeout(resolve, 3000));
    const finalUrl = browserView.webContents.getURL();
    logToRenderer(`Current URL after attempting HSMSE: ${finalUrl}`, 'info');

    // 2. Analyze the result
    if (finalUrl.startsWith('https://accounts.google.com/')) {
      // Case A: Not logged in at all.
      logToRenderer('Please log in to both of your Google Classroom accounts', 'instruction');
      return { success: false, reason: 'login_required' };
    }

    if (finalUrl.startsWith('https://classroom.google.com/u/0/')) {
      // Case B: Logged in, but it redirected to the wrong account (u/0 instead of u/1)
      logToRenderer('Please log in to your second Google Classroom account', 'instruction');
      return { success: false, reason: 'wrong_account' };
    }

    if (finalUrl.startsWith(hsmseUrl)) {
      // Case C: Successfully accessed HSMSE assignments.
      logToRenderer('Successfully accessed first account. Now checking for second account...', 'info');

      // Now, let's try to load the NYCStudents assignments
      await browserView.webContents.loadURL(nycstudentsUrl);
      await new Promise(resolve => setTimeout(resolve, 3000));
      const finalNycUrl = browserView.webContents.getURL();
      logToRenderer(`Current URL after attempting NYCStudents: ${finalNycUrl}`, 'info');

      if (finalNycUrl.startsWith(nycstudentsUrl)) {
        logToRenderer('All accounts are authenticated. You can now load assignments.', 'success');
        return { success: true };
      } else {
        logToRenderer('Please log in to your second Google Classroom account', 'instruction');
        return { success: false, reason: 'nyc_student_fail' };
      }
    }

    // Default fallback case
    logToRenderer('An unknown error occurred during authentication. Please check your login status manually in the browser view.', 'error');
    return { success: false, reason: 'unknown' };

  } catch (error) {
    logToRenderer(`An error occurred during the authentication flow: ${error.message}`, 'error');
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
  } else if (tabName === 'logs') {
    // Hide browser view when logs tab is active
    if (browserView) {
      mainWindow.setBrowserView(null);
    }
  }
});