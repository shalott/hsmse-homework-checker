// Scraping validation system
// Ensures all requirements are met before starting any scraping operations

const fs = require('fs');
const { logToRenderer } = require('./logger');
const { JUPITER_SECRET_PATH, JUPITER_CONFIG_PATH } = require('config/constants');

/**
 * Run all pre-scraping checks
 * @param {Object} mainWindow - Main window for showing UI elements
 * @param {Object} appSettings - App settings to determine which checks to run
 * @returns {Promise<Object>} - Check results with any required actions
 */
async function runScrapingValidation(mainWindow, appSettings) {
  logToRenderer('Running scraping validation...', 'info');
  
  const checks = [];
  
  // Only check Jupiter if it's enabled in settings
  if (appSettings && appSettings.scrape_jupiter) {
    checks.push(
      { name: 'Jupiter Credentials', check: checkJupiterCredentials, critical: true },
      { name: 'Jupiter Configuration', check: checkJupiterConfiguration, critical: false }
    );
  } else {
    logToRenderer('Jupiter scraping disabled in settings - skipping Jupiter validation', 'info');
  }
  
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
    logToRenderer('All scraping validation checks passed!', 'success');
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
        message: 'Jupiter credentials incomplete - please enter your student name and password in Settings',
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
      message: 'We need your Jupiter Ed settings first!',
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
    
    logToRenderer(`[Jupiter] Checking configuration: ${JSON.stringify(config)}`, 'info');
    
    // Filter out metadata fields and get only class selections
    const classSelections = {};
    for (const [key, value] of Object.entries(config)) {
      if (key !== 'last_updated' && (value === 'selected' || value === 'unselected')) {
        classSelections[key] = value;
      }
    }
    
    logToRenderer(`[Jupiter] Found ${Object.keys(classSelections).length} class selections`, 'info');
    
    if (Object.keys(classSelections).length === 0) {
      logToRenderer('[Jupiter] No class selections found - will prompt for class selection', 'warn');
      return {
        success: false,
        message: 'We need your Jupiter Ed settings first!',
        requiresUserAction: true,
        actionType: 'jupiter-class-selection'
      };
    }
    
    const selectedCount = Object.values(classSelections).filter(status => status === 'selected').length;
    logToRenderer(`[Jupiter] Configuration valid: ${selectedCount} selected classes out of ${Object.keys(classSelections).length} total classes`, 'success');
    
    // Configuration is valid as long as it exists - even if no classes are selected, that's a user choice
    return {
      success: true,
      message: `Jupiter configuration found with ${selectedCount} selected classes out of ${Object.keys(classSelections).length} total classes`
    };
    
  } catch (error) {
    return {
      success: false,
      message: 'We need your Jupiter Ed settings first!',
      requiresUserAction: true,
      actionType: 'jupiter-class-selection'
    };
  }
}


module.exports = {
  runScrapingValidation
};
