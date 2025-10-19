const { app, BrowserWindow, BrowserView, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep a global reference of the window object
let mainWindow;
let browserView;

// Account configurations
const GOOGLE_CLASSROOM_URL_BASE = 'https://classroom.google.com/u/';
const GOOGLE_CLASSROOM_ASSIGNMENTS_PATH = '/a/not-turned-in/all';

const JUPITER_SECRET_PATH = path.join(app.getPath('userData'), 'secrets', 'jupiter_secret.json');

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
    const account0Url = `${GOOGLE_CLASSROOM_URL_BASE}0${GOOGLE_CLASSROOM_ASSIGNMENTS_PATH}`;
    const account1Url = `${GOOGLE_CLASSROOM_URL_BASE}1${GOOGLE_CLASSROOM_ASSIGNMENTS_PATH}`;

    // First, check if we are logged into Google at all.
    await browserView.webContents.loadURL('https://classroom.google.com/');
    await new Promise(resolve => setTimeout(resolve, 3000));
    const initialUrl = browserView.webContents.getURL();

    if (initialUrl.startsWith('https://accounts.google.com/')) {
      logToRenderer('Please log in to both of your Google Classroom accounts', 'instruction');
      return { success: false, reason: 'login_required' };
    }

    // Now check each account
    logToRenderer('Checking for first Google account...', 'info');
    await browserView.webContents.loadURL(account0Url);
    await new Promise(resolve => setTimeout(resolve, 3000));
    const account0Success = browserView.webContents.getURL().startsWith(account0Url);

    logToRenderer('Checking for second Google account...', 'info');
    await browserView.webContents.loadURL(account1Url);
    await new Promise(resolve => setTimeout(resolve, 3000));
    const account1Success = browserView.webContents.getURL().startsWith(account1Url);

    if (account0Success && account1Success) {
      logToRenderer('All Google accounts are authenticated.', 'success');
      return await handleJupiterLogin();
    } else if (account0Success || account1Success) {
      logToRenderer('Please log in to your second Google Classroom account', 'instruction');
      return { success: false, reason: 'one_account_missing' };
    } else {
      // This case should be rare if the initial check passed, but is a good fallback.
      logToRenderer('Please log in to both of your Google Classroom accounts', 'instruction');
      return { success: false, reason: 'both_accounts_missing' };
    }

  } catch (error) {
    logToRenderer(`An error occurred during the authentication flow: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
});

async function handleJupiterLogin() {
  logToRenderer('Checking for Jupiter Ed credentials...', 'info');
  try {
    // Check if the secret file exists
    await fs.promises.access(JUPITER_SECRET_PATH);
    const credentials = JSON.parse(await fs.promises.readFile(JUPITER_SECRET_PATH, 'utf8'));
    logToRenderer('Jupiter Ed credentials found: Logging in...', 'info');
    return await loginToJupiter(credentials);
  } catch (error) {
    // If the file doesn't exist or is unreadable
    logToRenderer('Jupiter Ed credentials not found.', 'instruction');
    logToRenderer('Please enter your Jupiter Ed username and password.', 'instruction');
    // Ask the renderer to show the login form
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('show-jupiter-login');
    }
    return { success: false, reason: 'jupiter_credentials_required' };
  }
}

async function loginToJupiter(credentials) {
  const JUPITER_LOGIN_URL = 'https://login.jupitered.com/login/index.php?89583';
  logToRenderer('--- Starting Jupiter Login ---', 'info');
  logToRenderer(`Received credentials object: ${JSON.stringify(credentials)}`, 'info');

  try {
    await browserView.webContents.loadURL(JUPITER_LOGIN_URL);
    
    // This code is working -- DO NOT CHANGE IT
    browserView.webContents.once('did-finish-load', async () => {
      try {
        const loginType = credentials.loginType || 'student';
        const tabId = loginType === 'parent' ? 'tab_parent' : 'tab_student';

        const simulateClickScript = `
          new Promise((resolve) => {
            const el = document.getElementById('${tabId}');
            if (el) {
              const elHtml = el.outerHTML;
              
              // Simulate a more realistic click
              const mouseoverEvent = new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window });
              const mousedownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
              const mouseupEvent = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window });
              
              el.dispatchEvent(mouseoverEvent);
              el.dispatchEvent(mousedownEvent);
              el.dispatchEvent(mouseupEvent);
              
              resolve({ success: true, clicked: '${tabId}', found: true, elementHTML: elHtml.substring(0, 100) });
            } else {
              resolve({ success: false, error: 'Element not found by getElementById', selector: '${tabId}', found: false });
            }
          });
        `;

        const clickResult = await browserView.webContents.executeJavaScript(simulateClickScript);

      } catch (execError) {
        logToRenderer(`Error during JS execution for tab click: ${execError.message}`, 'error');
      }

      // Now it's time to try entering the student name and password
      logToRenderer('Tab click completed. Now attempting to enter credentials...', 'info');
      
      try {
        // Wait a moment for the tab to switch
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Enter the student name in the contenteditable div
        logToRenderer('Entering student name...', 'info');
        const studentNameResult = await browserView.webContents.executeJavaScript(`
          new Promise((resolve) => {
            const studentDiv = document.getElementById('text_studid1');
            const hiddenInput = document.querySelector('input[name="studid1"]');
            
            if (studentDiv) {
              studentDiv.textContent = '${credentials.student_name}';
              if (hiddenInput) {
                hiddenInput.value = '${credentials.student_name}';
              }
              // Hide the placeholder
              const placeholder = document.getElementById('ph_studid1');
              if (placeholder) placeholder.style.display = 'none';
              
              resolve({ success: true, field: 'student_name', value: '${credentials.student_name}' });
            } else {
              resolve({ success: false, error: 'Student name field not found' });
            }
          });
        `);
        
        logToRenderer(`Student name entry result: ${JSON.stringify(studentNameResult)}`, studentNameResult.success ? 'info' : 'error');
        
        // Enter the password
        logToRenderer('Entering password...', 'info');
        const passwordResult = await browserView.webContents.executeJavaScript(`
          new Promise((resolve) => {
            const passwordField = document.getElementById('text_password1');
            
            if (passwordField) {
              passwordField.value = '${credentials.password}';
              resolve({ success: true, field: 'password' });
            } else {
              resolve({ success: false, error: 'Password field not found' });
            }
          });
        `);
        
        logToRenderer(`Password entry result: ${JSON.stringify(passwordResult)}`, passwordResult.success ? 'info' : 'error');
        
        // Click the login button with mouse simulation
        logToRenderer('Simulating click on login button...', 'info');
        const loginButtonResult = await browserView.webContents.executeJavaScript(`
          new Promise((resolve) => {
            const loginBtn = document.getElementById('loginbtn');
            
            if (loginBtn) {
              // Simulate realistic mouse events like we did for the tab
              const mouseoverEvent = new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window });
              const mousedownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
              const mouseupEvent = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window });
              const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
              
              loginBtn.dispatchEvent(mouseoverEvent);
              loginBtn.dispatchEvent(mousedownEvent);
              loginBtn.dispatchEvent(mouseupEvent);
              loginBtn.dispatchEvent(clickEvent);
              
              resolve({ success: true, action: 'login_button_clicked_with_simulation' });
            } else {
              resolve({ success: false, error: 'Login button not found' });
            }
          });
        `);
        
        logToRenderer(`Login button click result: ${JSON.stringify(loginButtonResult)}`, loginButtonResult.success ? 'success' : 'error');
        
        if (loginButtonResult.success) {
          logToRenderer('Login form submitted. Waiting for redirect...', 'info');
          // Wait for potential redirect
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          const finalUrl = browserView.webContents.getURL();
          if (finalUrl.includes('student.php') || finalUrl.includes('grades.php')) {
            logToRenderer('Jupiter Ed login successful!', 'success');
          } else {
            logToRenderer(`Login may have failed. Current URL: ${finalUrl}`, 'error');
          }
        }
        
      } catch (credentialError) {
        logToRenderer(`Error during credential entry: ${credentialError.message}`, 'error');
      }

    });
    
    return { success: true };

  } catch (error) {
    logToRenderer(`A critical error occurred during Jupiter login: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

ipcMain.handle('save-jupiter-credentials', async (event, { student_name, password, loginType }) => {
  logToRenderer('Received Jupiter credentials. Saving...', 'info');
  try {
    const secretsDir = path.dirname(JUPITER_SECRET_PATH);
    // Create the secrets directory if it doesn't exist
    await fs.promises.mkdir(secretsDir, { recursive: true });
    // Save the credentials to the file
    await fs.promises.writeFile(JUPITER_SECRET_PATH, JSON.stringify({ student_name, password, loginType }), 'utf8');
    logToRenderer('Jupiter credentials saved successfully.', 'success');

    // Now that credentials are saved, try logging in again
    logToRenderer('Attempting to log in to Jupiter Ed...', 'info');
    return await loginToJupiter({ student_name, password, loginType });
  } catch (error) {
    logToRenderer(`Failed to save Jupiter credentials: ${error.message}`, 'error');
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