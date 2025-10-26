// Configuration constants for HSMSE Homework Checker

const path = require('path');

// Check if we're running in development mode (npm start)
let isDevelopment = false;
try {
  const { app } = require('electron');
  isDevelopment = process.env.NODE_ENV === 'development' || 
                 process.env.npm_lifecycle_event === 'start' ||
                 !app.isPackaged;
} catch (e) {
  // Fallback if electron not available
  isDevelopment = process.env.NODE_ENV === 'development' || 
                 process.env.npm_lifecycle_event === 'start';
}

// Base application directory (project root)
let userDataRoot;

if (isDevelopment) {
  // Development mode: use local project directory
  userDataRoot = path.resolve(__dirname, '..');
  console.log('Running in development mode, using local directories');
  console.log('Development mode detected because:', {
    NODE_ENV: process.env.NODE_ENV,
    npm_lifecycle_event: process.env.npm_lifecycle_event,
    isPackaged: require('electron').app?.isPackaged
  });
} else {
  // Production mode: use Electron's userData directory
  try {
    const electron = require('electron');
    if (electron.app) {
      // Main process
      userDataRoot = electron.app.getPath('userData');
      console.log('Running in production mode (main process), using userData directory:', userDataRoot);
    } else if (electron.remote && electron.remote.app) {
      // Renderer process with remote
      userDataRoot = electron.remote.app.getPath('userData');
      console.log('Running in production mode (renderer process), using userData directory:', userDataRoot);
    } else {
      // Renderer process without remote - use OS userData directory
      const os = require('os');
      const appName = 'HSMSE HW';
      
      // Cross-platform userData directory
      if (process.platform === 'darwin') {
        // macOS
        userDataRoot = path.join(os.homedir(), 'Library', 'Application Support', appName);
      } else if (process.platform === 'win32') {
        // Windows
        userDataRoot = path.join(os.homedir(), 'AppData', 'Roaming', appName);
      } else {
        // Linux and others
        userDataRoot = path.join(os.homedir(), '.config', appName);
      }
      
      console.log('Running in production mode (renderer process), using OS userData directory:', userDataRoot);
    }
  } catch (e) {
    console.log('Error getting userData root:', e);
    userDataRoot = path.resolve(__dirname, '..');
  }
}

const APP_DIR = userDataRoot;

// Core application directory paths
const CORE_DIR = path.join(APP_DIR, 'core');
const CONFIG_DIR = path.join(APP_DIR, 'config');
const ACCESS_DIR = path.join(APP_DIR, 'access');
const SCRAPERS_DIR = path.join(APP_DIR, 'scrapers');
const WINDOWS_DIR = path.join(APP_DIR, 'windows');

// Data directory paths
const DATA_DIR = path.join(APP_DIR, 'data');
const TEMP_DIR = path.join(DATA_DIR, 'temp');
const SECRETS_DIR = path.join(APP_DIR, 'secrets');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

// Main data files
const ASSIGNMENTS_FILE = path.join(DATA_DIR, 'all_assignments.json');
const LOG_FILE = path.join(TEMP_DIR, 'app.log');
const APP_SETTINGS_FILE = path.join(DATA_DIR, 'app_settings.json');

// Google Classroom configuration
const GOOGLE_CLASSROOM_URL_BASE = 'https://classroom.google.com/u/';
const GOOGLE_CLASSROOM_ASSIGNMENTS_PATH = '/a/not-turned-in/all';

// Jupiter Ed configuration
const JUPITER_LOGIN_URL = 'https://login.jupitered.com/login/index.php?89583';
const JUPITER_SECRET_PATH = path.join(SECRETS_DIR, 'jupiter_secret.json');
const JUPITER_CONFIG_PATH = path.join(DATA_DIR, 'jupiter_classes.json');

// UI Layout constants
const BROWSER_VIEW_BOUNDS = {
  x: 280,  // Start after sidebar
  y: 0,    // No instructions panel in browser view
  widthOffset: 300,  // Full width minus sidebar and padding
  heightOffset: 240  // Full height minus logs pane (200px) and status bar (40px)
};

module.exports = {
  APP_DIR,
  CORE_DIR,
  CONFIG_DIR,
  ACCESS_DIR,
  SCRAPERS_DIR,
  WINDOWS_DIR,
  DATA_DIR,
  TEMP_DIR,
  SECRETS_DIR,
  BACKUPS_DIR,
  ASSIGNMENTS_FILE,
  LOG_FILE,
  APP_SETTINGS_FILE,
  GOOGLE_CLASSROOM_URL_BASE,
  GOOGLE_CLASSROOM_ASSIGNMENTS_PATH,
  JUPITER_LOGIN_URL,
  JUPITER_SECRET_PATH,
  JUPITER_CONFIG_PATH,
  BROWSER_VIEW_BOUNDS
};