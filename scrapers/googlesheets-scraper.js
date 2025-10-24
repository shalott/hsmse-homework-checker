const { logToRenderer } = require('core/logger');
const { TEMP_DIR } = require('config/constants');
const fs = require('fs');
const path = require('path');

/**
 * A helper function to introduce a delay.
 * @param {number} ms - Milliseconds to wait.
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Sends a keyboard event (and its corresponding keyup).
 * @param {BrowserView} browserView
 * @param {object} input - e.g., { type: 'keyDown', keyCode: 'F', modifiers: ['control', 'alt'] }
 */
async function sendKeyPress(browserView, input) {
  await browserView.webContents.sendInputEvent({ ...input, type: 'keyDown' });
  await delay(50); // Short delay between down and up
  await browserView.webContents.sendInputEvent({ ...input, type: 'char' });
  await delay(50); // Short delay between down and up
  await browserView.webContents.sendInputEvent({ ...input, type: 'keyUp' });
  await delay(150); // Delay after key press to allow UI to react
}

/**
 * Navigates the Google Sheets menu using keyboard shortcuts.
 * @param {BrowserView} browserView - The BrowserView containing the Google Sheet.
 */
async function triggerCsvDownloadViaKeyboard(browserView) {
  logToRenderer('Triggering TSV download via keyboard...', 'info');
    
  // Give the page a moment to be ready
  await delay(200);
  
  // Strategy 2: Ctrl + Alt + F to open File menu
  logToRenderer('Opening File menu with Ctrl+Alt+F', 'info');
  await sendKeyPress(browserView, { keyCode: 'F', modifiers: ['control', 'alt'] });
  
  // Wait for menu to appear
  await delay(50);
  
  // Navigate menu by typing "D" for Download
  logToRenderer('Navigating to Download...', 'info');
  await sendKeyPress(browserView, { keyCode: 'D'});
  await delay(50);
  
  // Type "T" for Tab-separated values (.tsv)
  await sendKeyPress(browserView, { keyCode: 'T' });
  await delay(50);
  
  // Press Enter to trigger download
  // await browserView.webContents.sendInputEvent({ type: 'char', keyCode: 'Return' });
  
  logToRenderer('TSV download triggered', 'info');

}


/**
 * Intercepts the TSV download and returns its content as a string.
 * @param {BrowserView} browserView - The BrowserView to listen on for downloads.
 * @returns {Promise<string>} - The TSV data as a string.
 */
function captureCsvDownload(browserView) {
  return new Promise((resolve, reject) => {
    logToRenderer('Setting up TSV download capture...', 'info');
    
    let downloadHandler = null;
    
    const cleanup = () => {
      if (downloadHandler) {
        browserView.webContents.session.removeListener('will-download', downloadHandler);
      }
    };
    
    const timeout = setTimeout(() => {
      cleanup();
      logToRenderer('TSV download timed out after 20 seconds', 'error');
      reject(new Error('TSV download timeout'));
    }, 20000);
    
    downloadHandler = (event, item) => {
      clearTimeout(timeout);
      
      // Create timestamped filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `googlesheets.tsv`;
      const savePath = path.join(TEMP_DIR, filename);
      
      // Ensure temp directory exists
      if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
      }
      
      item.setSavePath(savePath);
      logToRenderer(`Downloading TSV to ${filename}...`, 'info');
      
      item.once('done', (event, state) => {
        cleanup();
        
        if (state === 'completed') {
          try {
            const tsvData = fs.readFileSync(savePath, 'utf8');
            logToRenderer(`Successfully downloaded TSV (${tsvData.length} bytes)`, 'success');
            resolve(tsvData);
          } catch (error) {
            logToRenderer(`Failed to read downloaded TSV: ${error.message}`, 'error');
            reject(error);
          }
        } else {
          logToRenderer(`Download failed with state: ${state}`, 'error');
          reject(new Error(`Download failed: ${state}`));
        }
      });
    };
    
    browserView.webContents.session.once('will-download', downloadHandler);
  });
}


/**
 * Parses the raw TSV data to find assignments.
 * @param {string} tsvData - The raw TSV data.
 * @returns {Array<Object>} - An array of standardized assignment objects.
 */
/**
 * Extracts a due date from homework text if it contains "due" followed by a date
 * @param {string} text - The homework text
 * @returns {Date|null} - Parsed date or null if not found
 */
function extractDueDate(text) {
  // Look for "due" followed by a date in format "Month Day" or "MM/DD"
  const dueMatch = text.match(/due\s+([A-Za-z]+\s+\d{1,2}|\d{1,2}\/\d{1,2})/i);
  if (!dueMatch) return null;
  
  const dateStr = dueMatch[1];
  const currentYear = new Date().getFullYear();
  
  // Try parsing MM/DD format
  if (dateStr.includes('/')) {
    const [month, day] = dateStr.split('/').map(n => parseInt(n));
    const date = new Date(currentYear, month - 1, day);
    if (!isNaN(date.getTime())) {
      date.setHours(0, 0, 0, 0);
      return date;
    }
  } else {
    // Try parsing "Month Day" format
    const date = new Date(`${dateStr}, ${currentYear}`);
    if (!isNaN(date.getTime())) {
      date.setHours(0, 0, 0, 0);
      return date;
    }
  }
  
  return null;
}

function parseTsvForAssignments(tsvData) {
  logToRenderer('Parsing TSV data for assignments...', 'info');
  const assignments = [];
  const courseName = "Geometry";
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize to midnight for comparison
  
  // Calculate cutoff date (3 days ago)
  const cutoffDate = new Date(today);
  cutoffDate.setDate(today.getDate() - 3);
  
  // Split into lines
  const lines = tsvData.split('\n');
  logToRenderer(`Processing ${lines.length} lines from TSV`, 'info');
  logToRenderer(`Cutoff date: ${cutoffDate.toLocaleDateString()} (3 days ago)`, 'info');
  
  // Calculate future cutoff (3 weeks from today)
  const futureCutoffDate = new Date(today);
  futureCutoffDate.setDate(today.getDate() + 21); // 3 weeks = 21 days
  logToRenderer(`Future cutoff date: ${futureCutoffDate.toLocaleDateString()} (3 weeks ahead)`, 'info');
  
  // Regular expression to match date strings like "October 21, 2025"
  const datePattern = /^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/;
  
  // Track pending homework assignment waiting for a due date (persists across weeks)
  let pendingHw = null;
  let weekCount = 0;
  
  for (const line of lines) {
    // Split on tabs, preserving empty cells
    const cells = line.split('\t');
    
    if (cells.length < 2) continue; // Need at least date + one day column
    
    const firstCell = cells[0].trim();
    const dateMatch = firstCell.match(datePattern);
    
    if (!dateMatch) continue; // Not a valid week row
    
    weekCount++;
    
    // Parse the Monday date
    const mondayDate = new Date(firstCell);
    if (isNaN(mondayDate.getTime())) continue; // Invalid date
    
    mondayDate.setHours(0, 0, 0, 0);
    logToRenderer(`Processing week ${weekCount}: ${mondayDate.toLocaleDateString()}`, 'info');
    
    // Process Mon-Fri (cells 1-5, since cell 0 is the date)
    const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    
    for (let dayIndex = 0; dayIndex < 5 && dayIndex + 1 < cells.length; dayIndex++) {
      const cellContent = cells[dayIndex + 1].trim();
      
      // Calculate the date for this cell
      const cellDate = new Date(mondayDate);
      cellDate.setDate(mondayDate.getDate() + dayIndex);
      
      // Stop processing if we've gone more than 3 weeks into the future
      if (cellDate > futureCutoffDate) {
        logToRenderer(`Stopping processing: reached date ${cellDate.toLocaleDateString()} which is beyond 3-week cutoff`, 'info');
        return assignments;
      }
      
      // Don't skip past dates anymore - we need to process them to find homework assignments
      // but we'll filter by due date later
      
      logToRenderer(`  ${weekdayNames[dayIndex]} (${cellDate.toLocaleDateString()}): "${cellContent}"`, 'info');
      
      // Check if this is a valid class day
      const isNoClass = cellContent === '' || 
                       cellContent.includes('No Classes') || 
                       cellContent.includes('School Closed');
      
      if (isNoClass) {
        logToRenderer(`    -> No class`, 'info');
        continue;
      }
      
      // Check if it's just a section number (class meets but no assignment yet)
      const isSectionOnly = /^\d+-\d+$|^\d+\.\d+$/.test(cellContent);
      
      // This is a valid class day
      // If we have a pending homework, assign it to this date
      if (pendingHw) {
        const dueDate = new Date(cellDate);
        logToRenderer(`    -> Assigning pending HW "${pendingHw.name}" due ${dueDate.toLocaleDateString()}`, 'info');
        
        // Only add if due date is within acceptable range (not more than 3 days past)
        if (dueDate >= cutoffDate) {
          pendingHw.due_date = dueDate.toISOString();
          pendingHw.due_date_parsed = dueDate.toISOString();
          assignments.push(pendingHw);
          logToRenderer(`    -> HW added (due date is within range)`, 'info');
        } else {
          logToRenderer(`    -> HW skipped (due date too old: ${dueDate.toLocaleDateString()})`, 'info');
        }
        pendingHw = null;
      }
      
      if (isSectionOnly) {
        logToRenderer(`    -> Section only (${cellContent})`, 'info');
        continue;
      }
      
      // Check for TEST
      if (cellContent.toUpperCase().includes('TEST')) {
        logToRenderer(`    -> Found TEST`, 'info');
        assignments.push({
          name: 'Geometry Test',
          class: courseName,
          due_date: cellDate.toISOString(),
          due_date_parsed: cellDate.toISOString(),
          url: '',
          description: cellContent,
          max_points: 0
        });
      }
      
      // Check for HW
      const hwMatch = cellContent.match(/HW.*/i);
      if (hwMatch) {
        logToRenderer(`    -> Found HW: "${hwMatch[0]}"`, 'info');
        
        // Check if there's a "due" date specified in the homework text
        const explicitDueDate = extractDueDate(hwMatch[0]);
        
        if (explicitDueDate) {
          logToRenderer(`    -> HW has explicit due date: ${explicitDueDate.toLocaleDateString()}`, 'info');
          // Homework has explicit due date, add it if within cutoff range
          if (explicitDueDate >= cutoffDate) {
            assignments.push({
              name: hwMatch[0],
              class: courseName,
              due_date: explicitDueDate.toISOString(),
              due_date_parsed: explicitDueDate.toISOString(),
              url: '',
              description: `Assigned ${weekdayNames[dayIndex]}, ${cellDate.toLocaleDateString()}`,
              max_points: 0
            });
            logToRenderer(`    -> HW added (explicit due date is within range)`, 'info');
          } else {
            logToRenderer(`    -> HW skipped (explicit due date too old: ${explicitDueDate.toLocaleDateString()})`, 'info');
          }
        } else {
          logToRenderer(`    -> HW pending, waiting for next class date`, 'info');
          // Create pending homework assignment (due date will be set when we find next class)
          pendingHw = {
            name: hwMatch[0],
            class: courseName,
            due_date: null, // Will be set when we find next class date
            due_date_parsed: null,
            url: '',
            description: `Assigned ${weekdayNames[dayIndex]}, ${cellDate.toLocaleDateString()}`,
            max_points: 0
          };
        }
      }
    }
  }
  
  // If there's still a pending homework at the end of all data, log a warning
  if (pendingHw) {
    logToRenderer(`Warning: Homework assignment "${pendingHw.name}" has no determinable due date in available data`, 'warn');
  }
  
  logToRenderer(`TSV parsing complete: found ${assignments.length} assignments (${weekCount} weeks processed)`, 'success');
  return assignments;
}

/**
 * Main function to orchestrate the Google Sheets scraping process.
 * @param {BrowserView} browserView - The BrowserView for the workflow.
 * @returns {Promise<{success: boolean, assignments: Array<Object>, error?: string}>}
 */
async function scrapeGoogleSheets(browserView) {
  try {
    logToRenderer('Starting Google Sheets TSV download process via keyboard...', 'info');

    // Set up the download listener BEFORE triggering the download.
    const tsvDataPromise = captureCsvDownload(browserView);

    // Trigger the download by simulating keyboard input.
    await triggerCsvDownloadViaKeyboard(browserView);

    // Wait for the download to be captured.
    const tsvData = await tsvDataPromise;
    logToRenderer('Successfully captured TSV data in memory.', 'success');

    // Parse the data.
    const assignments = parseTsvForAssignments(tsvData);

    return { success: true, assignments };

  } catch (error) {
    logToRenderer(`Error scraping Google Sheets via TSV: ${error.message}`, 'error');
    return { success: false, assignments: [], error: error.message };
  }
}

module.exports = {
  scrapeGoogleSheets,
};
