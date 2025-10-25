// Google Classroom access management

const fs = require('fs');
const path = require('path');
const { logToRenderer } = require('core/logger');
const {
  GOOGLE_CLASSROOM_URL_BASE,
  GOOGLE_CLASSROOM_ASSIGNMENTS_PATH
} = require('config/constants');

/**
 * Show a non-blocking authentication message in the browser window
 * @param {BrowserView} browserView - The Electron BrowserView instance
 * @param {string} message - The message to display
 * @returns {Promise<void>} - Resolves when user clicks OK
 */
async function showBrowserMessage(browserView, message) {
  if (!browserView || !browserView.webContents) {
    logToRenderer('Browser view not available for message display', 'error');
    return;
  }

  try {
    logToRenderer(`Attempting to show authentication message: ${message}`, 'info');
    logToRenderer(`Current browser URL: ${browserView.webContents.getURL()}`, 'info');
    
    // Check if the page is ready
    const isReady = browserView.webContents.isLoading();
    logToRenderer(`Browser loading state: ${isReady}`, 'info');
    
    // Wait for page to be ready if it's still loading
    if (isReady) {
      logToRenderer('Waiting for page to finish loading...', 'info');
      await new Promise(resolve => {
        browserView.webContents.once('did-finish-load', resolve);
        // Timeout after 10 seconds
        setTimeout(resolve, 10000);
      });
    }
    
    // Read CSS from external file
    const cssPath = path.join(__dirname, '..', 'auth-overlay.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    logToRenderer(`CSS file read successfully, length: ${cssContent.length}`, 'info');
    
    // Inject the CSS styles
    await browserView.webContents.insertCSS(cssContent);
    logToRenderer('CSS injected successfully', 'info');

    // Then inject the message overlay into the browser window (non-blocking)
    await browserView.webContents.executeJavaScript(`
      (function() {
        try {
          console.log('Starting to create authentication overlay');
          
          // Check if document and body exist
          if (!document || !document.body) {
            throw new Error('Document or body not available');
          }
          
          // Remove any existing message overlay
          const existingOverlay = document.getElementById('auth-message-overlay');
          if (existingOverlay) {
            existingOverlay.remove();
            console.log('Removed existing overlay');
          }
          
          // Create message overlay using proper DOM methods
          const overlay = document.createElement('div');
          overlay.id = 'auth-message-overlay';
          
          const messageBox = document.createElement('div');
          messageBox.className = 'auth-message-box';
          
          const title = document.createElement('h3');
          title.className = 'auth-message-title';
          title.textContent = 'Authentication Required';
          
          const messageText = document.createElement('p');
          messageText.className = 'auth-message-text';
          messageText.textContent = '${message.replace(/'/g, "\\'")}';
          
          const okButton = document.createElement('button');
          okButton.id = 'auth-ok-button';
          okButton.textContent = 'OK';
          
          messageBox.appendChild(title);
          messageBox.appendChild(messageText);
          messageBox.appendChild(okButton);
          overlay.appendChild(messageBox);
          document.body.appendChild(overlay);
          
          console.log('Authentication overlay created and added to DOM');
          
          // Handle OK button click to dismiss the overlay
          okButton.addEventListener('click', () => {
            console.log('OK button clicked, removing overlay');
            overlay.remove();
          });
          
        } catch (error) {
          console.error('Error in overlay creation:', error);
          throw error;
        }
      })();
    `);
    
    logToRenderer('Authentication overlay created successfully', 'success');
    
  } catch (error) {
    logToRenderer(`Error showing browser message: ${error.message}`, 'error');
    logToRenderer(`Error stack: ${error.stack}`, 'error');
    
    // Fallback: try to show a simple alert
    try {
      logToRenderer('Attempting fallback alert...', 'warn');
      await browserView.webContents.executeJavaScript(`alert('${message}');`);
    } catch (fallbackError) {
      logToRenderer(`Fallback alert also failed: ${fallbackError.message}`, 'error');
    }
  }
}

/**
 * Wait for user to complete authentication (waits indefinitely)
 * @param {BrowserView} browserView - The Electron BrowserView instance
 * @param {string} accountType - The account type (nycstudents or hsmse)
 * @returns {Promise<void>} - Resolves when user completes authentication
 */
async function waitForAuthentication(browserView, accountType) {
  let message;
  if (accountType === 'nycstudents') {
    message = `Please log in with your ${accountType} Google account. Scraping will start once you're logged in.`;
  } else {
    message = `Please switch to your ${accountType} Google account using the account menu (click your profile picture). Scraping will start once you're logged in to the correct account.`;
  }
  
  logToRenderer(`Waiting for ${accountType} authentication...`, 'info');
  
  // Show the initial message (non-blocking)
  await showBrowserMessage(browserView, message);
  
  // Now wait and check periodically for authentication
  let consecutiveSuccessChecks = 0;
  const requiredSuccessChecks = 2; // Need 2 consecutive successful checks
  
  while (true) {
    // Wait a bit before checking
    await new Promise(resolve => setTimeout(resolve, 5000)); // Increased to 5 seconds
    
    const currentUrl = browserView.webContents.getURL();
    logToRenderer(`Checking authentication status. Current URL: ${currentUrl}`, 'info');
    
    // Check if we're still on a login page or in the middle of authentication
    const isOnLoginPage = currentUrl.includes('accounts.google.com') || 
                         currentUrl.includes('signin') || 
                         currentUrl.includes('login') ||
                         currentUrl.includes('auth') ||
                         currentUrl.includes('oauth');
    
    if (isOnLoginPage) {
      logToRenderer('Still on login/authentication page, continuing to wait...', 'info');
      consecutiveSuccessChecks = 0; // Reset counter
      continue; // Keep waiting
    }
    
    // Check if we're on the correct Google Classroom page for this account
    const isOnCorrectClassroomPage = currentUrl.includes('classroom.google.com') && 
                                    ((accountType === 'nycstudents' && currentUrl.includes('/u/0')) ||
                                     (accountType === 'hsmse' && currentUrl.includes('/u/1')));
    
    if (isOnCorrectClassroomPage) {
      consecutiveSuccessChecks++;
      logToRenderer(`Authentication check ${consecutiveSuccessChecks}/${requiredSuccessChecks} successful - on correct ${accountType} Google Classroom page`, 'info');
      
      if (consecutiveSuccessChecks >= requiredSuccessChecks) {
        logToRenderer(`${accountType} authentication completed successfully - now on correct Google Classroom page`, 'success');
        break;
      }
    } else {
      // Not on the correct classroom page - keep waiting
      logToRenderer(`On page: ${currentUrl}`, 'info');
      logToRenderer(`This is NOT the correct ${accountType} Google Classroom page, continuing to wait...`, 'info');
      consecutiveSuccessChecks = 0; // Reset counter
    }
  }
}

/**
 * Check Google Classroom account access
 * @param {BrowserView} browserView - The Electron BrowserView instance
 * @returns {Promise<Object>} - Success status and account access details
 */
async function checkGoogleAccess(browserView) {
  logToRenderer('[GoogleC] Starting access check...', 'info');

  try {
    const account0Url = `${GOOGLE_CLASSROOM_URL_BASE}0${GOOGLE_CLASSROOM_ASSIGNMENTS_PATH}`;
    const account1Url = `${GOOGLE_CLASSROOM_URL_BASE}1${GOOGLE_CLASSROOM_ASSIGNMENTS_PATH}`;

    // First, check if we are logged into Google at all
    await browserView.webContents.loadURL('https://classroom.google.com/');
    await new Promise(resolve => setTimeout(resolve, 3000));
    const initialUrl = browserView.webContents.getURL();

    if (initialUrl.startsWith('https://accounts.google.com/')) {
      logToRenderer('[GoogleC] Please log in to both of your Google Classroom accounts', 'instruction');
      return { success: false, reason: 'login_required' };
    }

    // Now check each account
    logToRenderer('[GoogleC] Checking for first Google account...', 'info');
    await browserView.webContents.loadURL(account0Url);
    await new Promise(resolve => setTimeout(resolve, 3000));
    const account0Success = browserView.webContents.getURL().startsWith(account0Url);

    logToRenderer('[GoogleC] Checking for second Google account...', 'info');
    await browserView.webContents.loadURL(account1Url);
    await new Promise(resolve => setTimeout(resolve, 3000));
    const account1Success = browserView.webContents.getURL().startsWith(account1Url);

    if (account0Success && account1Success) {
      logToRenderer('[GoogleC] All Google accounts are authenticated.', 'success');
      return { success: true, accounts: { account0: true, account1: true } };
    } else if (account0Success || account1Success) {
      logToRenderer('[GoogleC] Please log in to your second Google Classroom account', 'instruction');
      return { success: false, reason: 'one_account_missing', accounts: { account0: account0Success, account1: account1Success } };
    } else {
      logToRenderer('[GoogleC] Please log in to both of your Google Classroom accounts', 'instruction');
      return { success: false, reason: 'both_accounts_missing', accounts: { account0: false, account1: false } };
    }

  } catch (error) {
    logToRenderer(`[GoogleC] An error occurred during access check: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

module.exports = {
  checkGoogleAccess,
  waitForAuthentication,
  showBrowserMessage
};