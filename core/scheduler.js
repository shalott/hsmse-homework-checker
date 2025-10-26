const { app } = require('electron');
const { logToRenderer } = require('./logger');

class Scheduler {
  constructor() {
    this.scheduledJob = null;
    this.isRunning = false;
    this.lastRunTime = null;
    this.nextRunTime = null;
  }

  /**
   * Schedule a daily scraping job at the specified time
   * @param {string} timeString - Time in HH:MM format (24-hour)
   * @param {boolean} enabled - Whether scheduling is enabled
   */
  scheduleDailyScraping(timeString, enabled = true) {
    // Clear existing schedule
    this.clearSchedule();

    if (!enabled) {
      logToRenderer('Daily scheduling disabled', 'info');
      return;
    }

    try {
      const [hours, minutes] = timeString.split(':').map(Number);
      
      if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        throw new Error('Invalid time format. Use HH:MM (24-hour format)');
      }

      // Calculate next run time
      const now = new Date();
      const scheduledTime = new Date();
      scheduledTime.setHours(hours, minutes, 0, 0);

      // If the time has already passed today, schedule for tomorrow
      if (scheduledTime <= now) {
        scheduledTime.setDate(scheduledTime.getDate() + 1);
      }

      this.nextRunTime = scheduledTime;
      
      // Calculate milliseconds until next run
      const msUntilNext = scheduledTime.getTime() - now.getTime();
      
      logToRenderer(`Scheduled daily scraping for ${timeString} (${scheduledTime.toLocaleString()})`, 'success');
      
      // Set up the timeout
      this.scheduledJob = setTimeout(() => {
        this.runScheduledScraping();
        // Reschedule for the next day
        this.scheduleDailyScraping(timeString, enabled);
      }, msUntilNext);

      logToRenderer(`Next scheduled run in ${Math.round(msUntilNext / (1000 * 60 * 60))} hours`, 'info');
      
    } catch (error) {
      logToRenderer(`Error scheduling daily scraping: ${error.message}`, 'error');
    }
  }

  /**
   * Clear the current schedule
   */
  clearSchedule() {
    if (this.scheduledJob) {
      clearTimeout(this.scheduledJob);
      this.scheduledJob = null;
      logToRenderer('Cleared existing schedule', 'info');
    }
  }

  /**
   * Run the scheduled scraping
   */
  async runScheduledScraping() {
    if (this.isRunning) {
      logToRenderer('Scheduled scraping already running, skipping', 'warn');
      return;
    }

    this.isRunning = true;
    this.lastRunTime = new Date();
    
    logToRenderer('=== STARTING SCHEDULED SCRAPING ===', 'info');
    logToRenderer(`Scheduled run started at ${this.lastRunTime.toLocaleString()}`, 'info');

    try {
      // Get the main window reference
      const { BrowserWindow } = require('electron');
      const mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
      
      if (!mainWindow) {
        logToRenderer('No main window found for scheduled scraping', 'error');
        return;
      }
      
      // Call the main scraping function via IPC
      const { ipcMain } = require('electron');
      
      // We need to simulate the IPC call since we're in the main process
      // Import the main scraping function directly
      const mainModule = require('../main.js');
      const result = await mainModule.runScrapingProcess();
      
      if (result && result.success) {
        logToRenderer(`Scheduled scraping completed successfully: ${result.totalAssignments} assignments found`, 'success');
      } else {
        logToRenderer(`Scheduled scraping completed with issues: ${result?.error || 'Unknown error'}`, 'warn');
      }
      
    } catch (error) {
      logToRenderer(`Scheduled scraping failed: ${error.message}`, 'error');
    } finally {
      this.isRunning = false;
      logToRenderer('=== SCHEDULED SCRAPING COMPLETED ===', 'info');
    }
  }

  /**
   * Get the status of the scheduler
   */
  getStatus() {
    return {
      isScheduled: this.scheduledJob !== null,
      isRunning: this.isRunning,
      lastRunTime: this.lastRunTime,
      nextRunTime: this.nextRunTime,
      nextRunInMs: this.nextRunTime ? this.nextRunTime.getTime() - Date.now() : null
    };
  }

  /**
   * Stop the scheduler
   */
  stop() {
    this.clearSchedule();
    this.isRunning = false;
    logToRenderer('Scheduler stopped', 'info');
  }
}

// Create a singleton instance
const scheduler = new Scheduler();

module.exports = scheduler;
