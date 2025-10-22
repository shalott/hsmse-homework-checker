// Pre-scraping validation system
// Ensures all requirements are met before starting any scraping operations

const fs = require('fs');
const { logToRenderer } = require('core/logger');
const { JUPITER_SECRET_PATH, JUPITER_CONFIG_PATH } = require('config/constants');

/**
 * Run all pre-scraping checks
 * @param {Object} mainWindow - Main window for showing UI elements
 * @returns {Promise<Object>} - Check results with any required actions
 */
async function runPreScrapingChecks(mainWindow) {
  logToRenderer('Running pre-scraping checks...', 'info');
  
  const checks = [
    { name: 'Jupiter Credentials', check: checkJupiterCredentials, critical: true },
    { name: 'Jupiter Configuration', check: checkJupiterConfiguration, critical: false },
    { name: 'Data Directories', check: checkDataDirectories, critical: true }
  ];
  
  const results = {
    success: true,
    checks: [],
    requiresUserAction: false,
    userActionType: null
  };
  
  for (const checkInfo of checks) {
    try {
      logToRenderer(`Checking: ${checkInfo.name}...`, 'info');
      const result = await checkInfo.check(mainWindow);
      
      results.checks.push({
        name: checkInfo.name,
        success: result.success,
        message: result.message,
        critical: checkInfo.critical
      });
      
      if (!result.success) {
        if (checkInfo.critical) {
          results.success = false;
        }
        
        // Handle user action requirements
        if (result.requiresUserAction) {
          results.requiresUserAction = true;
          results.userActionType = result.actionType;
          logToRenderer(`User action required: ${result.message}`, 'instruction');
          break; // Stop checking once we need user action
        } else {
          logToRenderer(`Check failed: ${checkInfo.name} - ${result.message}`, 'warn');
        }
      } else {
        logToRenderer(`✓ ${checkInfo.name}`, 'success');
      }
      
    } catch (error) {
      logToRenderer(`Check error for ${checkInfo.name}: ${error.message}`, 'error');
      results.checks.push({
        name: checkInfo.name,
        success: false,
        message: `Check failed: ${error.message}`,
        critical: checkInfo.critical
      });
      
      if (checkInfo.critical) {
        results.success = false;
      }
    }
  }
  
  if (results.success && !results.requiresUserAction) {
    logToRenderer('All pre-scraping checks passed!', 'success');
  }
  
  return results;
}

/**
 * Check if Jupiter credentials exist and are valid
 */
async function checkJupiterCredentials(mainWindow) {
  try {
    await fs.promises.access(JUPITER_SECRET_PATH);
    const credentials = JSON.parse(await fs.promises.readFile(JUPITER_SECRET_PATH, 'utf8'));
    
    // Validate required fields
    if (!credentials.student_name || !credentials.password) {
      return {
        success: false,
        message: 'Jupiter credentials file exists but is missing required fields',
        requiresUserAction: true,
        actionType: 'jupiter-login'
      };
    }
    
    // Check if loginType is set (should be 'parent' or 'student')
    if (!credentials.loginType) {
      logToRenderer('Jupiter credentials missing loginType - defaulting to parent', 'warn');
      credentials.loginType = 'parent';
      await fs.promises.writeFile(JUPITER_SECRET_PATH, JSON.stringify(credentials, null, 2));
      logToRenderer('Updated Jupiter credentials with loginType: parent', 'info');
    }
    
    return {
      success: true,
      message: `Jupiter credentials found for ${credentials.student_name} (${credentials.loginType} login)`
    };
    
  } catch (error) {
    return {
      success: false,
      message: 'Jupiter credentials not found - please provide login information',
      requiresUserAction: true,
      actionType: 'jupiter-login'
    };
  }
}

/**
 * Check if Jupiter class configuration exists
 */
async function checkJupiterConfiguration(mainWindow) {
  try {
    await fs.promises.access(JUPITER_CONFIG_PATH);
    const config = JSON.parse(await fs.promises.readFile(JUPITER_CONFIG_PATH, 'utf8'));
    
    if (!config.selected_classes || Object.keys(config.selected_classes).length === 0) {
      return {
        success: false,
        message: 'No Jupiter classes selected for scraping'
      };
    }
    
    const classCount = Object.keys(config.selected_classes).length;
    return {
      success: true,
      message: `Jupiter configuration found with ${classCount} selected classes`
    };
    
  } catch (error) {
    return {
      success: false,
      message: 'Jupiter class configuration not found - will skip Jupiter scraping'
    };
  }
}

/**
 * Check if required data directories exist
 */
async function checkDataDirectories(mainWindow) {
  const dirs = ['data', 'data/temp', 'secrets'];
  
  try {
    for (const dir of dirs) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
    
    return {
      success: true,
      message: 'All required directories exist'
    };
    
  } catch (error) {
    return {
      success: false,
      message: `Failed to create required directories: ${error.message}`
    };
  }
}

/**
 * Wait for user to complete required action and then re-run checks
 */
async function waitForUserAction(mainWindow, actionType) {
  logToRenderer(`Waiting for user to complete: ${actionType}`, 'info');
  
  if (actionType === 'jupiter-login') {
    // Show Jupiter login form
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('show-jupiter-login');
    }
    
    // Wait for credentials to be created
    return await waitForJupiterCredentials();
  }
  
  return { success: false, message: `Unknown action type: ${actionType}` };
}

/**
 * Wait for Jupiter credentials file to be created
 */
async function waitForJupiterCredentials() {
  const maxWaitTime = 300000; // 5 minutes
  const pollInterval = 2000; // Check every 2 seconds
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      await fs.promises.access(JUPITER_SECRET_PATH);
      const credentials = JSON.parse(await fs.promises.readFile(JUPITER_SECRET_PATH, 'utf8'));
      
      if (credentials.student_name && credentials.password) {
        logToRenderer('Jupiter credentials provided by user!', 'success');
        return { success: true, message: 'Jupiter credentials created' };
      }
    } catch (error) {
      // File doesn't exist yet, keep waiting
    }
    
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  return { success: false, message: 'Timeout waiting for Jupiter credentials' };
}

module.exports = {
  runPreScrapingChecks,
  waitForUserAction
};