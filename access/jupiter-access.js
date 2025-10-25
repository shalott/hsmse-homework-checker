// Jupiter Ed access management

const fs = require('fs');
const { logToRenderer } = require('core/logger');
const { JUPITER_SECRET_PATH, SECRETS_DIR, JUPITER_LOGIN_URL } = require('config/constants');

/**
 * Ensure browser view is ready for Jupiter operations
 * @param {BrowserView} browserView - The Electron BrowserView instance
 * @param {BrowserWindow} mainWindow - The main window instance
 * @returns {Promise<boolean>} - True if browser view is ready
 */
async function ensureJupiterBrowserReady(browserView, mainWindow) {
  if (!browserView || !browserView.webContents) {
    throw new Error('Browser view is not available');
  }
  
  // Navigate to Jupiter login page
  await browserView.webContents.loadURL(JUPITER_LOGIN_URL);
  
  return true;
}

/**
 * Check if Jupiter Ed credentials exist
 * @returns {Promise<Object>} - Credentials if they exist, or indication they're missing
 */
async function checkJupiterCredentials() {
  logToRenderer('[Jupiter] Checking for credentials...', 'info');
  
  try {
    await fs.promises.access(JUPITER_SECRET_PATH);
    const credentials = JSON.parse(await fs.promises.readFile(JUPITER_SECRET_PATH, 'utf8'));
    logToRenderer('Jupiter Ed credentials found: Logging in...', 'info');
    return { success: true, credentials };
  } catch (error) {
    logToRenderer('Jupiter Ed credentials not found.', 'instruction');
    return { success: false, reason: 'jupiter_credentials_required' };
  }
}

/**
 * Save Jupiter Ed credentials
 * @param {Object} credentials - The credentials object
 * @returns {Promise<Object>} - Success status
 */
async function saveJupiterCredentials(credentials) {
  logToRenderer('Received Jupiter credentials. Saving...', 'info');
  
  try {
    // SECRETS_DIR should already exist from pre-scraping checks
    await fs.promises.writeFile(JUPITER_SECRET_PATH, JSON.stringify(credentials), 'utf8');
    logToRenderer('Jupiter credentials saved successfully.', 'success');
    return { success: true, credentials };
  } catch (error) {
    logToRenderer(`Failed to save Jupiter credentials: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

/**
 * Login to Jupiter Ed using credentials
 * @param {BrowserView} browserView - The Electron BrowserView instance
 * @param {Object} credentials - The login credentials
 * @returns {Promise<Object>} - Login success status
 */
async function loginToJupiter(browserView, credentials, mainWindow) {
  logToRenderer('[Jupiter] --- Starting Login ---', 'info');
  logToRenderer(`[Jupiter] Received credentials for student: ${credentials.student_name}`, 'info');

  try {
    // Ensure browser view is ready and navigate to login page
    await ensureJupiterBrowserReady(browserView, mainWindow);
    
    // Wrap the entire login process in a Promise to make it awaitable
    return new Promise((resolve, reject) => {
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
          logToRenderer('Jupiter Ed login completed successfully!', 'success');
          resolve({ success: true });
        } else {
          resolve({ success: false, error: 'Login button click failed' });
        }
        
      } catch (credentialError) {
        logToRenderer(`Error during credential entry: ${credentialError.message}`, 'error');
        resolve({ success: false, error: credentialError.message });
      }
      
    });
    });

  } catch (error) {
    logToRenderer(`A critical error occurred during Jupiter login: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

/**
 * Handle Jupiter access - check credentials and login if available
 * @param {BrowserView} browserView - The Electron BrowserView instance
 * @param {Object} mainWindow - The main window for showing login form
 * @returns {Promise<Object>} - Access result
 */
async function handleJupiterAccess(browserView, mainWindow) {
  const credentialsCheck = await checkJupiterCredentials();
  
  if (credentialsCheck.success) {
    return await loginToJupiter(browserView, credentialsCheck.credentials);
  } else {
    return credentialsCheck;
  }
}

module.exports = {
  checkJupiterCredentials,
  saveJupiterCredentials,
  loginToJupiter,
  handleJupiterAccess,
  ensureJupiterBrowserReady
};