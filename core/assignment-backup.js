/**
 * Assignment Backup and Fallback System
 * Handles creating backups, detecting anomalies, and managing fallbacks for assignment data
 */

const fs = require('fs');
const path = require('path');
const { logToRenderer } = require('./logger');

class AssignmentBackup {
  constructor() {
    this.backupDir = path.join(__dirname, '..', 'data', 'backups');
    this.currentFile = path.join(__dirname, '..', 'data', 'all_assignments.json');
    this.ensureBackupDirectory();
  }

  /**
   * Ensure backup directory exists
   */
  ensureBackupDirectory() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
      logToRenderer('Created backup directory', 'info');
    }
  }

  /**
   * Create a timestamped backup of current assignments file
   * @returns {Object} - Backup result with success status and backup path
   */
  async createBackup() {
    try {
      if (!fs.existsSync(this.currentFile)) {
        logToRenderer('No existing assignments file to backup', 'info');
        return { success: true, message: 'No existing file to backup' };
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.backupDir, `assignments_${timestamp}.json`);
      
      // Copy current file to backup location
      fs.copyFileSync(this.currentFile, backupPath);
      
      logToRenderer(`Created backup: ${path.basename(backupPath)}`, 'success');
      return { 
        success: true, 
        backupPath, 
        message: `Backup created successfully` 
      };
    } catch (error) {
      logToRenderer(`Failed to create backup: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  /**
   * Get the most recent backup file
   * @returns {Object} - Most recent backup info or null if none found
   */
  getMostRecentBackup() {
    try {
      if (!fs.existsSync(this.backupDir)) {
        return null;
      }

      const backupFiles = fs.readdirSync(this.backupDir)
        .filter(file => file.startsWith('assignments_') && file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(this.backupDir, file),
          mtime: fs.statSync(path.join(this.backupDir, file)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime);

      return backupFiles.length > 0 ? backupFiles[0] : null;
    } catch (error) {
      logToRenderer(`Error finding recent backup: ${error.message}`, 'error');
      return null;
    }
  }

  /**
   * Load assignments from the most recent backup
   * @returns {Object} - Backup assignments data or null if none found
   */
  loadMostRecentBackup() {
    try {
      const recentBackup = this.getMostRecentBackup();
      if (!recentBackup) {
        return null;
      }

      const backupData = JSON.parse(fs.readFileSync(recentBackup.path, 'utf8'));
      logToRenderer(`Loaded backup from ${recentBackup.name}`, 'info');
      return {
        data: backupData,
        backupDate: recentBackup.mtime,
        backupFile: recentBackup.name
      };
    } catch (error) {
      logToRenderer(`Error loading backup: ${error.message}`, 'error');
      return null;
    }
  }

  /**
   * Analyze scraping results for potential anomalies and failures
   * @param {Object} newResults - New scraping results with google0, google1, jupiter
   * @param {Object} previousData - Previous assignment data for comparison
   * @returns {Object} - Analysis results with anomalies and failures detected
   */
  analyzeResults(newResults, previousData) {
    const analysis = {
      anomalies: [],
      failures: [],
      suspiciousResults: false,
      criticalFailures: false,
      previousCounts: {},
      newCounts: {},
      totalSources: 3,
      failedSources: 0,
      successfulSources: 0
    };

    if (!previousData || !previousData.assigned) {
      logToRenderer('No previous data for comparison', 'info');
      return analysis;
    }

    // Count assignments by source in previous data
    const previousBySource = this.countAssignmentsBySource(previousData.assigned);
    analysis.previousCounts = previousBySource;

    // Analyze each scraper result
    const scraperResults = {
      google0: newResults.google0Result,
      google1: newResults.google1Result, 
      jupiter: newResults.jupiterResult
    };

    for (const [source, result] of Object.entries(scraperResults)) {
      const newCount = result && result.assignments ? result.assignments.length : 0;
      const previousCount = previousBySource[this.mapSourceName(source)] || 0;
      const isSuccess = result && result.success;
      
      analysis.newCounts[source] = newCount;

      // Categorize the result type
      if (!result || !isSuccess) {
        // Complete scraping failure
        analysis.failures.push({
          source: source,
          sourceDisplay: this.getSourceDisplayName(source),
          type: 'scraping_failure',
          error: result ? result.error : 'No result returned',
          previousCount: previousCount,
          lastBackupDate: this.getMostRecentBackup()?.mtime
        });
        analysis.failedSources++;
        analysis.criticalFailures = true;
      } else if (newCount === 0 && previousCount > 2) {
        // Suspicious zero results (scraping succeeded but no assignments found)
        analysis.anomalies.push({
          source: source,
          sourceDisplay: this.getSourceDisplayName(source),
          type: 'suspicious_zero',
          newCount: newCount,
          previousCount: previousCount,
          lastBackupDate: this.getMostRecentBackup()?.mtime
        });
        analysis.suspiciousResults = true;
        analysis.successfulSources++;
      } else {
        // Normal successful result
        analysis.successfulSources++;
      }
    }

    // Log analysis results
    if (analysis.criticalFailures) {
      logToRenderer(`Critical: ${analysis.failedSources} of ${analysis.totalSources} scrapers failed completely`, 'error');
    }
    
    if (analysis.suspiciousResults) {
      logToRenderer(`Warning: ${analysis.anomalies.length} scrapers returned suspicious zero results`, 'warning');
    }

    if (analysis.successfulSources === analysis.totalSources) {
      logToRenderer(`All ${analysis.totalSources} scrapers completed successfully`, 'success');
    }

    return analysis;
  }

  /**
   * Count assignments by source from assignment array
   * @param {Array} assignments - Array of assignment objects
   * @returns {Object} - Count by source
   */
  countAssignmentsBySource(assignments) {
    const counts = {};
    assignments.forEach(assignment => {
      const source = assignment.source || 'unknown';
      counts[source] = (counts[source] || 0) + 1;
    });
    return counts;
  }

  /**
   * Map internal source names to data source names
   * @param {string} sourceName - Internal source name (google0, google1, jupiter)
   * @returns {string} - Data source name
   */
  mapSourceName(sourceName) {
    const mapping = {
      'google0': 'google_classroom',
      'google1': 'google_classroom', 
      'jupiter': 'jupiter'
    };
    return mapping[sourceName] || sourceName;
  }

  /**
   * Get display name for source
   * @param {string} sourceName - Internal source name
   * @returns {string} - User-friendly display name
   */
  getSourceDisplayName(sourceName) {
    const mapping = {
      'google0': 'Google Classroom (Account 1)',
      'google1': 'Google Classroom (Account 2)',
      'jupiter': 'Jupiter Ed'
    };
    return mapping[sourceName] || sourceName;
  }

  /**
   * Merge assignments from backup for specified sources
   * @param {Object} currentResults - Current scraping results
   * @param {Array} sourcesToRestore - Array of source names to restore from backup
   * @returns {Object} - Updated results with backup data merged in
   */
  async mergeFromBackup(currentResults, sourcesToRestore) {
    try {
      const backup = this.loadMostRecentBackup();
      if (!backup) {
        logToRenderer('No backup available for merge', 'error');
        return currentResults;
      }

      const backupAssignments = backup.data.assigned || [];
      let mergedResults = { ...currentResults };

      for (const source of sourcesToRestore) {
        const sourceDataName = this.mapSourceName(source);
        const backupAssignmentsForSource = backupAssignments.filter(
          assignment => assignment.source === sourceDataName
        );

        logToRenderer(`Merging ${backupAssignmentsForSource.length} assignments from backup for ${this.getSourceDisplayName(source)}`, 'info');

        // Update the specific scraper result
        if (source === 'google0' && mergedResults.google0Result) {
          mergedResults.google0Result.assignments = backupAssignmentsForSource;
          mergedResults.google0Result.success = true;
        } else if (source === 'google1' && mergedResults.google1Result) {
          mergedResults.google1Result.assignments = backupAssignmentsForSource;
          mergedResults.google1Result.success = true;
        } else if (source === 'jupiter' && mergedResults.jupiterResult) {
          mergedResults.jupiterResult.assignments = backupAssignmentsForSource;
          mergedResults.jupiterResult.success = true;
        }
      }

      logToRenderer(`Successfully merged backup data for ${sourcesToRestore.length} sources`, 'success');
      return mergedResults;
    } catch (error) {
      logToRenderer(`Error merging from backup: ${error.message}`, 'error');
      return currentResults;
    }
  }

  /**
   * Clean up old backup files, keeping only the most recent N backups
   * @param {number} keepCount - Number of backups to keep (default: 10)
   */
  cleanupOldBackups(keepCount = 10) {
    try {
      if (!fs.existsSync(this.backupDir)) {
        return;
      }

      const backupFiles = fs.readdirSync(this.backupDir)
        .filter(file => file.startsWith('assignments_') && file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(this.backupDir, file),
          mtime: fs.statSync(path.join(this.backupDir, file)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime);

      if (backupFiles.length > keepCount) {
        const filesToDelete = backupFiles.slice(keepCount);
        filesToDelete.forEach(file => {
          fs.unlinkSync(file.path);
          logToRenderer(`Cleaned up old backup: ${file.name}`, 'info');
        });
        
        logToRenderer(`Cleaned up ${filesToDelete.length} old backup files`, 'info');
      }
    } catch (error) {
      logToRenderer(`Error cleaning up backups: ${error.message}`, 'error');
    }
  }
}

module.exports = AssignmentBackup;