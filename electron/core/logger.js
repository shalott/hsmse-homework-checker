// Centralized logging utilities for HSMSE Homework Checker

let mainWindow = null;

// Initialize the logger with the main window reference
function initializeLogger(window) {
  mainWindow = window;
}

// Main logging function
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

module.exports = {
  initializeLogger,
  logToRenderer
};