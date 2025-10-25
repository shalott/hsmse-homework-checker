// Startup validation system
// Ensures all required directories exist and are writable at app startup

const fs = require('fs');
const { logToRenderer } = require('./logger');
const { DATA_DIR, TEMP_DIR, SECRETS_DIR, BACKUPS_DIR } = require('config/constants');

/**
 * Run startup validation checks
 * This runs once when the app starts and ensures all directories exist
 * @returns {Promise<Object>} - Validation results
 */
async function runStartupValidation() {
  logToRenderer('Running startup validation...', 'info');
  
  try {
    // Create all required directories
    const dirs = [DATA_DIR, TEMP_DIR, SECRETS_DIR, BACKUPS_DIR];
    
    for (const dir of dirs) {
      await fs.promises.mkdir(dir, { recursive: true });
      logToRenderer(`✓ Directory created/verified: ${dir}`, 'success');
    }
    
    // Test write permissions
    await testWritePermissions();
    
    logToRenderer('Startup validation completed successfully!', 'success');
    return {
      success: true,
      message: 'All required directories exist and are writable'
    };
    
  } catch (error) {
    logToRenderer(`Startup validation failed: ${error.message}`, 'error');
    return {
      success: false,
      message: `Failed to create required directories: ${error.message}`
    };
  }
}

/**
 * Test write permissions for all directories
 */
async function testWritePermissions() {
  const testFiles = [
    { dir: DATA_DIR, file: 'test_write.tmp' },
    { dir: TEMP_DIR, file: 'test_write.tmp' },
    { dir: SECRETS_DIR, file: 'test_write.tmp' },
    { dir: BACKUPS_DIR, file: 'test_write.tmp' }
  ];
  
  for (const { dir, file } of testFiles) {
    const testPath = require('path').join(dir, file);
    try {
      await fs.promises.writeFile(testPath, 'test');
      await fs.promises.unlink(testPath);
      logToRenderer(`✓ Write test passed: ${dir}`, 'info');
    } catch (error) {
      throw new Error(`Write test failed for ${dir}: ${error.message}`);
    }
  }
}

module.exports = {
  runStartupValidation
};
