const { logToRenderer } = require('core/logger');
const fs = require('fs').promises;
const path = require('path');

const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1lZ-Pr_S8J24ZN30XKfBzs1sJf4N3GFygJaUQe1wsf2s/edit';

/**
 * Tries to access the Google Spreadsheet with a given authuser.
 * @param {BrowserView} browserView - The BrowserView to use for loading.
 * @param {number} authuser - The authuser value (0 or 1).
 * @returns {Promise<{success: boolean, content?: string}>}
 */
async function tryAccess(browserView, authuser) {
  const url = `${SPREADSHEET_URL}?authuser=${authuser}`;
  logToRenderer(`Attempting to access Google Sheet with authuser=${authuser}`, 'info');

  try {
    await browserView.webContents.loadURL(url);
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for page to settle

    const pageTitle = await browserView.webContents.getTitle();
    const pageUrl = browserView.webContents.getURL();

    if (pageTitle.includes('Google Sheets') && !pageUrl.includes('accounts.google.com')) {
      logToRenderer(`Successfully accessed Google Sheet with authuser=${authuser}`, 'success');
      const content = await browserView.webContents.executeJavaScript('document.documentElement.outerHTML', true);
      return { success: true, content };
    } else {
      logToRenderer(`Failed to access sheet with authuser=${authuser}. Title: ${pageTitle}`, 'warn');
      return { success: false };
    }
  } catch (error) {
    logToRenderer(`Error accessing Google Sheet with authuser=${authuser}: ${error.message}`, 'error');
    return { success: false };
  }
}

/**
 * Handles accessing the Google Spreadsheet by trying authuser=0, then authuser=1.
 * If successful, it saves the page content to a temp file.
 * @param {BrowserView} browserView - The BrowserView to use.
 * @returns {Promise<{success: boolean}>}
 */
async function handleGoogleSheetsAccess(browserView) {
  logToRenderer('Starting Google Sheets access workflow...', 'info');

  let result = await tryAccess(browserView, 0);

  if (!result.success) {
    logToRenderer('Access with authuser=0 failed. Trying authuser=1.', 'info');
    result = await tryAccess(browserView, 1);
  }

  if (result.success) {
    logToRenderer('Successfully accessed Google Sheet.', 'success');
    // The new scraper will handle the rest. This function just ensures access.
    return { success: true };
  }

  logToRenderer('Could not access Google Sheet with either authuser.', 'error');
  return { success: false };
}

module.exports = { handleGoogleSheetsAccess };
