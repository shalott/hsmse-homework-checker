const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { logToRenderer } = require('./logger');

class AutoStartup {
  constructor() {
    this.platform = process.platform;
  }

  /**
   * Enable auto-startup for the app
   * @param {boolean} enabled - Whether to enable auto-startup
   */
  async enableAutoStartup(enabled = true) {
    try {
      if (enabled) {
        await this.setAutoStartup(true);
        logToRenderer('Auto-startup enabled', 'success');
      } else {
        await this.setAutoStartup(false);
        logToRenderer('Auto-startup disabled', 'info');
      }
      return { success: true };
    } catch (error) {
      logToRenderer(`Error managing auto-startup: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if auto-startup is currently enabled
   */
  async isAutoStartupEnabled() {
    try {
      return await this.checkAutoStartupStatus();
    } catch (error) {
      logToRenderer(`Error checking auto-startup status: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * Set auto-startup based on platform
   * @param {boolean} enabled - Whether to enable auto-startup
   */
  async setAutoStartup(enabled) {
    switch (this.platform) {
      case 'win32':
        await this.setWindowsAutoStartup(enabled);
        break;
      case 'darwin':
        await this.setMacAutoStartup(enabled);
        break;
      case 'linux':
        await this.setLinuxAutoStartup(enabled);
        break;
      default:
        throw new Error(`Unsupported platform: ${this.platform}`);
    }
  }

  /**
   * Check auto-startup status based on platform
   */
  async checkAutoStartupStatus() {
    switch (this.platform) {
      case 'win32':
        return await this.checkWindowsAutoStartup();
      case 'darwin':
        return await this.checkMacAutoStartup();
      case 'linux':
        return await this.checkLinuxAutoStartup();
      default:
        return false;
    }
  }

  /**
   * Windows auto-startup using registry
   */
  async setWindowsAutoStartup(enabled) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    const appName = 'HSMSE Homework Checker';
    const appPath = `"${process.execPath}"`;
    const registryKey = 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

    try {
      if (enabled) {
        // Add to startup registry
        await execAsync(`reg add "${registryKey}" /v "${appName}" /t REG_SZ /d ${appPath} /f`);
        logToRenderer('Windows auto-startup enabled via registry', 'info');
      } else {
        // Remove from startup registry
        await execAsync(`reg delete "${registryKey}" /v "${appName}" /f`);
        logToRenderer('Windows auto-startup disabled via registry', 'info');
      }
    } catch (error) {
      // Registry operations might fail, try alternative method
      await this.setWindowsAutoStartupAlternative(enabled);
    }
  }

  /**
   * Alternative Windows auto-startup using startup folder
   */
  async setWindowsAutoStartupAlternative(enabled) {
    const os = require('os');
    const startupFolder = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    const shortcutPath = path.join(startupFolder, 'HSMSE Homework Checker.lnk');

    try {
      if (enabled) {
        // Create shortcut in startup folder
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);

        // Use PowerShell to create shortcut
        const psCommand = `
          $WshShell = New-Object -comObject WScript.Shell
          $Shortcut = $WshShell.CreateShortcut("${shortcutPath}")
          $Shortcut.TargetPath = "${process.execPath}"
          $Shortcut.Save()
        `;
        
        await execAsync(`powershell -Command "${psCommand}"`);
        logToRenderer('Windows auto-startup enabled via startup folder', 'info');
      } else {
        // Remove shortcut from startup folder
        if (fs.existsSync(shortcutPath)) {
          fs.unlinkSync(shortcutPath);
        }
        logToRenderer('Windows auto-startup disabled via startup folder', 'info');
      }
    } catch (error) {
      throw new Error(`Failed to set Windows auto-startup: ${error.message}`);
    }
  }

  /**
   * Check Windows auto-startup status
   */
  async checkWindowsAutoStartup() {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    try {
      const appName = 'HSMSE Homework Checker';
      const registryKey = 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
      
      const { stdout } = await execAsync(`reg query "${registryKey}" /v "${appName}"`);
      return stdout.includes(appName);
    } catch (error) {
      // Check startup folder as alternative
      const os = require('os');
      const startupFolder = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
      const shortcutPath = path.join(startupFolder, 'HSMSE Homework Checker.lnk');
      return fs.existsSync(shortcutPath);
    }
  }

  /**
   * macOS auto-startup using LaunchAgents
   */
  async setMacAutoStartup(enabled) {
    const os = require('os');
    const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.hsmse.homework-checker.plist');

    try {
      if (enabled) {
        // Create LaunchAgent plist
        const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.hsmse.homework-checker</string>
    <key>ProgramArguments</key>
    <array>
        <string>${process.execPath}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
</dict>
</plist>`;

        // Ensure LaunchAgents directory exists
        const launchAgentsDir = path.dirname(plistPath);
        if (!fs.existsSync(launchAgentsDir)) {
          fs.mkdirSync(launchAgentsDir, { recursive: true });
        }

        fs.writeFileSync(plistPath, plistContent);
        logToRenderer('macOS auto-startup enabled via LaunchAgent', 'info');
      } else {
        // Remove LaunchAgent plist
        if (fs.existsSync(plistPath)) {
          fs.unlinkSync(plistPath);
        }
        logToRenderer('macOS auto-startup disabled via LaunchAgent', 'info');
      }
    } catch (error) {
      throw new Error(`Failed to set macOS auto-startup: ${error.message}`);
    }
  }

  /**
   * Check macOS auto-startup status
   */
  async checkMacAutoStartup() {
    const os = require('os');
    const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.hsmse.homework-checker.plist');
    return fs.existsSync(plistPath);
  }

  /**
   * Linux auto-startup using .desktop file
   */
  async setLinuxAutoStartup(enabled) {
    const os = require('os');
    const autostartDir = path.join(os.homedir(), '.config', 'autostart');
    const desktopPath = path.join(autostartDir, 'hsmse-homework-checker.desktop');

    try {
      if (enabled) {
        // Ensure autostart directory exists
        if (!fs.existsSync(autostartDir)) {
          fs.mkdirSync(autostartDir, { recursive: true });
        }

        // Create .desktop file
        const desktopContent = `[Desktop Entry]
Type=Application
Name=HSMSE Homework Checker
Exec=${process.execPath}
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
`;

        fs.writeFileSync(desktopPath, desktopContent);
        logToRenderer('Linux auto-startup enabled via .desktop file', 'info');
      } else {
        // Remove .desktop file
        if (fs.existsSync(desktopPath)) {
          fs.unlinkSync(desktopPath);
        }
        logToRenderer('Linux auto-startup disabled via .desktop file', 'info');
      }
    } catch (error) {
      throw new Error(`Failed to set Linux auto-startup: ${error.message}`);
    }
  }

  /**
   * Check Linux auto-startup status
   */
  async checkLinuxAutoStartup() {
    const os = require('os');
    const autostartDir = path.join(os.homedir(), '.config', 'autostart');
    const desktopPath = path.join(autostartDir, 'hsmse-homework-checker.desktop');
    return fs.existsSync(desktopPath);
  }
}

// Create singleton instance
const autoStartup = new AutoStartup();

module.exports = autoStartup;
