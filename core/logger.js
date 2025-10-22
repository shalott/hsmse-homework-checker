// Centralized logging utilities for HSMSE Homework Checker

const fs = require('fs');
const path = require('path');

let mainWindow = null;
let logsWindow = null;

// Ensure logs directory exists
const LOGS_DIR = path.join(__dirname, '..', 'data', 'temp');
const LOG_FILE = path.join(LOGS_DIR, 'app.log');

// Create logs directory if it doesn't exist
try {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
} catch (error) {
  console.error('Failed to create logs directory:', error);
}

// Helper function to write to log file
function writeToLogFile(message, type, timestamp) {
  try {
    const logEntry = `[${timestamp}] [${type.toUpperCase()}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, logEntry, 'utf8');
  } catch (error) {
    console.error('Failed to write to log file:', error);
  }
}

// Initialize the logger with the main window reference
function initializeLogger(window) {
  mainWindow = window;
}

// Set the logs window reference
function setLogsWindow(window) {
  logsWindow = window;
}

// Main logging function
function logToRenderer(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  
  // Always write to log file first
  writeToLogFile(message, type, timestamp);
  
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
       const logData = { message, type, timestamp };
       
       // Send to main window
       if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
          try {
            mainWindow.webContents.send('log-message', logData);
          } catch (error) {
            console.log(`[ERROR] Failed to send log to main renderer: ${error.message}`);
          }
       }
       
       // Send to logs window
       if (logsWindow && !logsWindow.isDestroyed() && logsWindow.webContents && !logsWindow.webContents.isDestroyed()) {
          try {
            logsWindow.webContents.send('log-message', logData);
          } catch (error) {
            console.log(`[ERROR] Failed to send log to logs window: ${error.message}`);
          }
       }
    }
    return;
  }

  // For all other log types, log to console and send to the 'log-message' channel
  console.log(`[${type.toUpperCase()}] ${message}`);
  
  const logData = { 
    message, 
    type, 
    timestamp 
  };
  
  // Send to main window
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    try {
      mainWindow.webContents.send('log-message', logData);
    } catch (error) {
      console.log(`[ERROR] Failed to send log to main renderer: ${error.message}`);
    }
  }
  
  // Also send to logs window if it exists
  if (logsWindow && !logsWindow.isDestroyed() && logsWindow.webContents && !logsWindow.webContents.isDestroyed()) {
    try {
      logsWindow.webContents.send('log-message', logData);
    } catch (error) {
      console.log(`[ERROR] Failed to send log to logs window: ${error.message}`);
    }
  }
}

module.exports = {
  initializeLogger,
  logToRenderer,
  setLogsWindow
};