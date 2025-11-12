// Unified notification overlay system
// Uses overlay-notification.html and overlay-notification.css
// Creates a separate always-on-top overlay window

const { BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const {
  OVERLAY_NOTIFICATION_HTML_PATH,
  OVERLAY_NOTIFICATION_CSS_PATH
} = require('config/constants');

// Keep reference to overlay window (reuse it)
let overlayWindow = null;

/**
 * Get the main window (not the overlay window)
 * @returns {BrowserWindow|null} - The main window, or null if not found
 */
function getMainWindow() {
  const { BrowserWindow } = require('electron');
  const allWindows = BrowserWindow.getAllWindows();
  
  // Find the window that's not the overlay window
  return allWindows.find(win => win !== overlayWindow && !win.isDestroyed()) || null;
}

/**
 * Get or create the overlay window
 * @returns {BrowserWindow} - The overlay window
 */
function getOrCreateOverlayWindow() {
  // If overlay window exists and isn't destroyed, reuse it
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }

  // Get main window for positioning
  const mainWindow = getMainWindow();
  if (!mainWindow) {
    throw new Error('Main window not found');
  }

  // Get main window bounds to position overlay
  const mainBounds = mainWindow.getBounds();
  
  // Create a transparent, frameless overlay window as a child of main window
  // Using parent makes it stay above the main window but not above all other apps
  overlayWindow = new BrowserWindow({
    width: mainBounds.width,
    height: mainBounds.height,
    x: mainBounds.x,
    y: mainBounds.y,
    parent: mainWindow, // Make it a child window - stays above parent but not all apps
    frame: false,
    transparent: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: true, // Allow closing via window.close()
    focusable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    show: false // Don't show until content is ready
  });

  // Update overlay position when main window moves/resizes
  const updatePosition = () => {
    const mainWin = getMainWindow();
    if (overlayWindow && !overlayWindow.isDestroyed() && mainWin && !mainWin.isDestroyed()) {
      const bounds = mainWin.getBounds();
      overlayWindow.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      });
    }
  };

  // Set up position tracking
  const setupPositionTracking = () => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.on('move', updatePosition);
      mainWin.on('resize', updatePosition);
      
      // Clean up overlay window when main window is closed
      mainWin.once('closed', () => {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.close();
          overlayWindow = null;
        }
      });
    }
  };
  
  setupPositionTracking();

  return overlayWindow;
}

/**
 * Show a blocking overlay notification in a separate always-on-top window
 * @param {string} type - Notification type: 'success', 'error', 'auth', 'info'
 * @param {string} header - Header text
 * @param {string} message - Message text
 * @param {string} icon - Icon emoji (default: '🎉')
 * @returns {Promise<void>} - Resolves when user dismisses the notification (OK button or Enter/Escape/Space)
 */
async function showNotification(type, header, message, icon = '🎉') {
  // Get main window for positioning
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('Main window not available');
  }

  // Get or create overlay window
  const overlay = getOrCreateOverlayWindow();
  
  // Update position to match main window
  const mainBounds = mainWindow.getBounds();
  overlay.setBounds({
    x: mainBounds.x,
    y: mainBounds.y,
    width: mainBounds.width,
    height: mainBounds.height
  });

  // Read CSS and HTML from external files
  const cssContent = fs.readFileSync(OVERLAY_NOTIFICATION_CSS_PATH, 'utf8');
  const htmlContent = fs.readFileSync(OVERLAY_NOTIFICATION_HTML_PATH, 'utf8');

  // Create HTML content with embedded CSS
  const fullHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Notification</title>
    <style>
      ${cssContent}
      body {
        margin: 0;
        padding: 0;
        overflow: hidden;
      }
    </style>
</head>
<body>
    ${htmlContent}
    <script>
      // Wait for DOM to be ready
      document.addEventListener('DOMContentLoaded', () => {
        // Get references to elements
        const notificationBox = document.querySelector('.notification-box');
        const iconEl = document.getElementById('notification-icon');
        const headerEl = document.getElementById('notification-header');
        const messageEl = document.getElementById('notification-message');
        const okButton = document.getElementById('notification-ok-button');
        
        // Update content
        notificationBox.className = 'notification-box ' + ${JSON.stringify(type)};
        iconEl.textContent = ${JSON.stringify(icon)};
        headerEl.textContent = ${JSON.stringify(header)};
        messageEl.textContent = ${JSON.stringify(message)};
        
        // Handle keyboard events to dismiss overlay
        const handleKeyDown = (event) => {
          if (event.key === 'Enter' || event.key === 'Escape' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            cleanup();
            window.close();
          }
        };
        
        // Cleanup function
        const cleanup = () => {
          document.removeEventListener('keydown', handleKeyDown);
        };
        
        // Handle OK button click
        okButton.addEventListener('click', () => {
          cleanup();
          window.close();
        });
        
        // Add keyboard event listener
        document.addEventListener('keydown', handleKeyDown);
        
        // Focus the OK button
        setTimeout(() => {
          okButton.focus();
        }, 50);
      });
    </script>
</body>
</html>
  `;

  // Hide overlay if it's already visible (in case of rapid successive notifications)
  if (overlay.isVisible()) {
    overlay.hide();
  }

  // Load the HTML content
  await overlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHTML)}`);

  // Show the overlay window when ready
  overlay.once('ready-to-show', () => {
    overlay.show();
    overlay.focus();
  });

  // Wait for the window to be closed (user dismissed notification)
  return new Promise((resolve) => {
    // Remove any existing 'closed' listeners to avoid duplicates
    overlay.removeAllListeners('closed');
    
    overlay.once('closed', () => {
      resolve();
    });
  });
}

module.exports = {
  showNotification
};

