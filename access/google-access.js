// Google Classroom access management

const { logToRenderer } = require('core/logger');
const {
  GOOGLE_CLASSROOM_URL_BASE,
  GOOGLE_CLASSROOM_ASSIGNMENTS_PATH
} = require('config/constants');

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
  checkGoogleAccess
};