// Configuration constants for HSMSE Homework Checker

const { app } = require('electron');
const path = require('path');

// Google Classroom configuration
const GOOGLE_CLASSROOM_URL_BASE = 'https://classroom.google.com/u/';
const GOOGLE_CLASSROOM_ASSIGNMENTS_PATH = '/a/not-turned-in/all';

// Jupiter Ed configuration
const JUPITER_LOGIN_URL = 'https://login.jupitered.com/login/index.php?89583';
const JUPITER_SECRET_PATH = path.join(app.getPath('userData'), 'secrets', 'jupiter_secret.json');

// UI Layout constants
const BROWSER_VIEW_BOUNDS = {
  x: 280,  // Start after sidebar
  y: 90,   // Below instructions panel + tabs
  widthOffset: 300,  // Full width minus sidebar and padding
  heightOffset: 160  // Full height minus instructions, tabs, and status bar
};

module.exports = {
  GOOGLE_CLASSROOM_URL_BASE,
  GOOGLE_CLASSROOM_ASSIGNMENTS_PATH,
  JUPITER_LOGIN_URL,
  JUPITER_SECRET_PATH,
  BROWSER_VIEW_BOUNDS
};