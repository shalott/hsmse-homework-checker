// Configuration constants for HSMSE Homework Checker

const path = require('path');

// Base application directory (project root)
const APP_DIR = path.resolve(__dirname, '..');

// Core application directory paths
const CORE_DIR = path.join(APP_DIR, 'core');
const CONFIG_DIR = path.join(APP_DIR, 'config');
const ACCESS_DIR = path.join(APP_DIR, 'access');
const SCRAPERS_DIR = path.join(APP_DIR, 'scrapers');

// Data directory paths
const DATA_DIR = path.join(APP_DIR, 'data');
const TEMP_DIR = path.join(DATA_DIR, 'temp');
const SECRETS_DIR = path.join(APP_DIR, 'secrets');

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
  DATA_DIR,
  TEMP_DIR,
  SECRETS_DIR,
  GOOGLE_CLASSROOM_URL_BASE,
  GOOGLE_CLASSROOM_ASSIGNMENTS_PATH,
  JUPITER_LOGIN_URL,
  JUPITER_SECRET_PATH,
  JUPITER_CONFIG_PATH,
  BROWSER_VIEW_BOUNDS
};