// Google Classroom access management

const { logToRenderer } = require('core/logger');
const {
  GOOGLE_CLASSROOM_URL_BASE,
  GOOGLE_CLASSROOM_ASSIGNMENTS_PATH
} = require('config/constants');
const { showNotification } = require('core/notifications');


/**
 * Check and ensure authentication for a Google Classroom account
 * @param {BrowserView} browserView - The Electron BrowserView instance
 * @param {number} accountNumber - The account number (0 or 1)
 * @returns {Promise<Object>} - { success: boolean, needsAuth: boolean, error?: string }
 */
async function ensureGoogleAuthentication(browserView, accountNumber) {
  // Check for cancellation at the start
  checkScrapingCanceled();
  
  const accountType = accountNumber === 0 ? 'nycstudents' : 'hsmse';
  const url = `${GOOGLE_CLASSROOM_URL_BASE}${accountNumber}${GOOGLE_CLASSROOM_ASSIGNMENTS_PATH}`;
  
  logToRenderer(`[GoogleC] Checking authentication status for account /u/${accountNumber}...`, 'info');
  await browserView.webContents.loadURL(url);
  
  // Check for cancellation after navigation
  checkScrapingCanceled();
  
  // Get the current URL after navigation
  let currentUrl = browserView.webContents.getURL();
  logToRenderer(`[GoogleC] Initial URL after navigation: ${currentUrl}`, 'info');
  
  // Check if we were redirected to any login/SSO page FIRST (before checking for classroom)
  const isLoginPage = currentUrl.includes('accounts.google.com') || 
                     currentUrl.includes('signin') ||
                     currentUrl.includes('login') ||
                     currentUrl.includes('auth') ||
                     currentUrl.includes('idpcloud.nycenet.edu') ||
                     currentUrl.includes('oauth');
  
  // Check if we are actually on a Google Classroom URL
  const isGoogleClassroomUrl = currentUrl.includes('classroom.google.com');
  
  logToRenderer(`[GoogleC] URL analysis: isLoginPage=${isLoginPage}, isGoogleClassroomUrl=${isGoogleClassroomUrl}`, 'info');
  
  // If we're on a login page, wait for authentication
  if (isLoginPage) {
    logToRenderer(`[GoogleC] Redirected to login/SSO page: ${currentUrl}`, 'warn');
    logToRenderer(`[GoogleC] Authentication required for account /u/${accountNumber}`, 'warn');
    
    // Wait for user to authenticate (this will check for cancellation internally)
    await waitForAuthentication(browserView, accountType);
    
    // Check for cancellation after authentication wait
    checkScrapingCanceled();
    
    // After authentication, verify we're now on the correct page
    const verifyUrl = browserView.webContents.getURL();
    const isNowOnClassroom = verifyUrl.includes('classroom.google.com') && 
                             verifyUrl.includes(`/u/${accountNumber}/`);
    
    if (isNowOnClassroom) {
      logToRenderer(`[GoogleC] Authentication verified - now on correct Google Classroom page`, 'success');
      
      // Ensure we're on the exact assigned URL before returning (same as initial auth check)
      const assignedUrl = `${GOOGLE_CLASSROOM_URL_BASE}${accountNumber}${GOOGLE_CLASSROOM_ASSIGNMENTS_PATH}`;
      const currentUrl = browserView.webContents.getURL();
      
      // Only navigate if we're not already on the assigned URL
      if (!currentUrl.includes('/a/not-turned-in/all')) {
        logToRenderer(`[GoogleC] Navigating to assigned URL for account /u/${accountNumber}...`, 'info');
        await browserView.webContents.loadURL(assignedUrl);
        // Wait a moment for navigation to settle
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      return { success: true, needsAuth: false };
    } else {
      logToRenderer(`[GoogleC] Authentication wait completed but still not on correct page: ${verifyUrl}`, 'warn');
      return { success: false, needsAuth: true, error: 'Authentication incomplete' };
    }
  }
  
  // If we're not on a login page but also not on classroom, something's wrong
  if (!isGoogleClassroomUrl) {
    logToRenderer(`[GoogleC] Redirected to unexpected URL: ${currentUrl}`, 'warn');
    return { success: false, needsAuth: true, error: `Unexpected redirect to ${currentUrl}` };
  }
  
  // Check if we were redirected to the wrong account
  if (currentUrl.includes('classroom.google.com/u/') && !currentUrl.includes(`/u/${accountNumber}/`)) {
    logToRenderer(`[GoogleC] Account redirect detected: trying to access /u/${accountNumber} but got ${currentUrl}`, 'warn');
    logToRenderer(`[GoogleC] Need to switch to account /u/${accountNumber}`, 'warn');
    
    // Wait for user to switch to the correct account (this will check for cancellation internally)
    await waitForAuthentication(browserView, accountType);
    
    // Check for cancellation after authentication wait
    checkScrapingCanceled();
    
    // After waiting, verify we're now on the correct page
    const verifyUrl = browserView.webContents.getURL();
    const isNowOnCorrectAccount = verifyUrl.includes('classroom.google.com') && 
                                   verifyUrl.includes(`/u/${accountNumber}/`);
    
    if (isNowOnCorrectAccount) {
      logToRenderer(`[GoogleC] Account switch verified - now on correct Google Classroom page`, 'success');
      
      // Ensure we're on the exact assigned URL before returning (same as initial auth check)
      const assignedUrl = `${GOOGLE_CLASSROOM_URL_BASE}${accountNumber}${GOOGLE_CLASSROOM_ASSIGNMENTS_PATH}`;
      const currentUrl = browserView.webContents.getURL();
      
      // Only navigate if we're not already on the assigned URL
      if (!currentUrl.includes('/a/not-turned-in/all')) {
        logToRenderer(`[GoogleC] Navigating to assigned URL for account /u/${accountNumber}...`, 'info');
        await browserView.webContents.loadURL(assignedUrl);
        // Wait a moment for navigation to settle
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      return { success: true, needsAuth: false };
    } else {
      logToRenderer(`[GoogleC] Account switch wait completed but still not on correct page: ${verifyUrl}`, 'warn');
      return { success: false, needsAuth: true, error: 'Account switch incomplete' };
    }
  }
  
  // Authentication check passed
  logToRenderer(`[GoogleC] Authentication verified - already on correct Google Classroom page`, 'success');
  return { success: true, needsAuth: false };
}

/**
 * Check if scraping has been canceled
 */
function checkScrapingCanceled() {
  if (global.isScrapingCanceled && global.isScrapingCanceled()) {
    logToRenderer('Authentication canceled by user', 'info');
    throw new Error('Scraping canceled by user');
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
    message = `Please add your ${accountType} Google account using the account menu (click the circle with your initial or profile picture in the upper right corner). Scraping will start once you're logged in to the correct account.`;
  }
  
  logToRenderer(`Waiting for ${accountType} authentication...`, 'info');
  
  // Check for cancellation before showing message
  checkScrapingCanceled();
  
  // Show the initial message (blocks entire app)
  logToRenderer(`Attempting to show authentication message: ${message}`, 'info');
  await showNotification(
    'auth',
    'Authentication Required',
    message,
    '🔐'
  );
  logToRenderer('Authentication overlay dismissed', 'info');
  
  // Check for cancellation after message is dismissed
  checkScrapingCanceled();
  
  // Now wait and check periodically for authentication
  let lastUrl = '';
  
  while (true) {
    // Check for cancellation at the start of each loop iteration
    checkScrapingCanceled();
    
    // Wait a bit before checking
    await new Promise(resolve => setTimeout(resolve, 3000)); // 3 seconds
    
    // Check for cancellation after waiting
    checkScrapingCanceled();
    
    const currentUrl = browserView.webContents.getURL();
    
    // Only log if URL changed to reduce noise
    if (currentUrl !== lastUrl) {
      logToRenderer(`Checking authentication status. Current URL: ${currentUrl}`, 'info');
      lastUrl = currentUrl;
    }
    
    // Check if we're still on a login page or in the middle of authentication
    const isOnLoginPage = currentUrl.includes('accounts.google.com') || 
                         currentUrl.includes('signin') || 
                         currentUrl.includes('login') ||
                         currentUrl.includes('auth') ||
                         currentUrl.includes('oauth') ||
                         currentUrl.includes('idpcloud.nycenet.edu');
    
    if (isOnLoginPage) {
      // Still on login page - continue waiting
      continue;
    }
    
    // Check if we're on the correct Google Classroom page for this account
    const isOnCorrectClassroomPage = currentUrl.includes('classroom.google.com') && 
                                    ((accountType === 'nycstudents' && currentUrl.includes('/u/0')) ||
                                     (accountType === 'hsmse' && currentUrl.includes('/u/1')));
    
    if (isOnCorrectClassroomPage) {
      logToRenderer(`${accountType} authentication completed successfully - now on correct Google Classroom page`, 'success');
      break;
    }
    
    // Not on the correct classroom page - keep waiting
    logToRenderer(`Waiting for ${accountType} account authentication...`, 'info');
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
  ensureGoogleAuthentication
};