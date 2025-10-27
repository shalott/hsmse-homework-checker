const { app, Menu } = require('electron');

// Create application menu
function createApplicationMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Update Assignments Now',
          accelerator: 'CmdOrCtrl+U',
          click: async () => {
            try {
              const { startScraping } = require('../main.js');
              await startScraping();
            } catch (error) {
              const { logToRenderer } = require('core/logger');
              logToRenderer(`Error starting scraping from menu: ${error.message}`, 'error');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            const { createSettingsWindow } = require('../main.js');
            createSettingsWindow();
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            // Hide to system tray (keep app running)
            const { BrowserWindow, app } = require('electron');
            const mainWindow = BrowserWindow.getFocusedWindow();
            if (mainWindow) {
              mainWindow.hide();
              // On macOS, also hide the dock icon
              if (process.platform === 'darwin') {
                app.dock.hide();
              }
            }
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          role: 'undo'
        },
        {
          label: 'Redo',
          accelerator: 'Shift+CmdOrCtrl+Z',
          role: 'redo'
        },
        { type: 'separator' },
        {
          label: 'Cut',
          accelerator: 'CmdOrCtrl+X',
          role: 'cut'
        },
        {
          label: 'Copy',
          accelerator: 'CmdOrCtrl+C',
          role: 'copy'
        },
        {
          label: 'Paste',
          accelerator: 'CmdOrCtrl+V',
          role: 'paste'
        },
        {
          label: 'Select All',
          accelerator: 'CmdOrCtrl+A',
          role: 'selectall'
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'View Logs',
          accelerator: 'CmdOrCtrl+L',
          click: () => {
            const { createLogsWindow } = require('../main.js');
            createLogsWindow();
          }
        },
        { type: 'separator' },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: (item, focusedWindow) => {
            if (focusedWindow) {
              focusedWindow.reload();
            }
          }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: (item, focusedWindow) => {
            if (focusedWindow) {
              focusedWindow.webContents.toggleDevTools();
            }
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About This App',
          click: async () => {
            const { BrowserWindow } = require('electron');
            const { APP_NAME, HELP_FILE_PATH, HELP_CSS_PATH } = require('../config/constants');
            
            // Create a new window for the help content
            const helpWindow = new BrowserWindow({
              width: 700,
              height: 600,
              resizable: true,
              minimizable: true,
              maximizable: true,
              title: `About ${APP_NAME}`,
              webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
              }
            });
            
            // Load the help HTML file
            helpWindow.loadFile(HELP_FILE_PATH);
            
            // Inject the CSS path into the HTML
            helpWindow.webContents.once('dom-ready', () => {
              helpWindow.webContents.executeJavaScript(`
                const link = document.querySelector('link[href="help.css"]');
                if (link) {
                  link.href = '${HELP_CSS_PATH.replace(/\\/g, '/')}';
                }
              `);
            });
            
            // Show the window
            helpWindow.show();
          }
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Minimize',
          accelerator: 'CmdOrCtrl+M',
          click: (item, focusedWindow) => {
            if (focusedWindow) {
              focusedWindow.minimize();
            }
          }
        },
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          click: (item, focusedWindow) => {
            if (focusedWindow) {
              focusedWindow.close();
            }
          }
        }
      ]
    }
  ];

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        {
          label: 'About ' + app.getName(),
          role: 'about'
        },
        { type: 'separator' },
        {
          label: 'Services',
          role: 'services',
          submenu: []
        },
        { type: 'separator' },
        {
          label: 'Hide ' + app.getName(),
          accelerator: 'Command+H',
          role: 'hide'
        },
        {
          label: 'Hide Others',
          accelerator: 'Command+Shift+H',
          role: 'hideothers'
        },
        {
          label: 'Show All',
          role: 'unhide'
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'Command+Q',
          click: () => {
            // Hide to system tray (keep app running)
            const { BrowserWindow, app } = require('electron');
            const mainWindow = BrowserWindow.getFocusedWindow();
            if (mainWindow) {
              mainWindow.hide();
              // On macOS, also hide the dock icon
              if (process.platform === 'darwin') {
                app.dock.hide();
              }
            }
          }
        }
      ]
    });

    // Window menu
    template[5].submenu = [
      {
        label: 'Close',
        accelerator: 'CmdOrCtrl+W',
        role: 'close'
      },
      {
        label: 'Minimize',
        accelerator: 'CmdOrCtrl+M',
        role: 'minimize'
      },
      {
        label: 'Zoom',
        role: 'zoom'
      },
      { type: 'separator' },
      {
        label: 'Bring All to Front',
        role: 'front'
      }
    ];
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  
  const { logToRenderer } = require('core/logger');
  logToRenderer('Application menu created', 'info');
}

module.exports = { createApplicationMenu };
