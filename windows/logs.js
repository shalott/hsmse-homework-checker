// Logs Window JavaScript

const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// Load existing log file on startup
async function loadExistingLogs() {
  try {
    // Request log file path from main process
    const logFilePath = await ipcRenderer.invoke('get-log-file-path');
    
    if (fs.existsSync(logFilePath)) {
      const logContent = fs.readFileSync(logFilePath, 'utf8');
      const lines = logContent.split('\n').filter(line => line.trim());
      
      // Clear the loading message
      const container = document.getElementById('logs-container');
      container.innerHTML = '';
      
      // Add session start header
      addLogEntry('==========================================', 'info');
      addLogEntry('START OF SESSION', 'info');
      addLogEntry('==========================================', 'info');
      
      // Add existing log entries
      lines.forEach(line => {
        if (line.trim()) {
          // Parse log line format: [timestamp] [type] message
          const match = line.match(/^\[([^\]]+)\] \[([^\]]+)\] (.+)$/);
          if (match) {
            const [, timestamp, type, message] = match;
            addLogEntry(message, type, timestamp);
          } else {
            // Fallback for unparsed lines
            addLogEntry(line, 'info');
          }
        }
      });
      
      // Scroll to bottom
      container.scrollTop = container.scrollHeight;
    }
  } catch (error) {
    console.error('Error loading existing logs:', error);
    addLogEntry('Error loading existing logs: ' + error.message, 'error');
  }
}

// Add a log entry to the display
function addLogEntry(message, type = 'info', timestamp = null) {
  const container = document.getElementById('logs-container');
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + type;
  
  const time = timestamp || new Date().toLocaleTimeString();
  entry.innerHTML = '<span class="log-timestamp">' + time + '</span>' + message;
  
  container.appendChild(entry);
  
  // Only auto-scroll if user is already at the bottom (within last 2-3 entries)
  const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 100;
  if (isAtBottom) {
    container.scrollTop = container.scrollHeight;
  }
  
  // Limit to last 500 entries to prevent memory issues
  while (container.children.length > 500) {
    container.removeChild(container.firstChild);
  }
}

// Listen for log messages from main process
ipcRenderer.on('log-message', (event, data) => {
  addLogEntry(data.message, data.type, data.timestamp);
});

// Load existing logs when window opens
document.addEventListener('DOMContentLoaded', () => {
  loadExistingLogs();
});
