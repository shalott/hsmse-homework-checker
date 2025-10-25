const fs = require('fs').promises;
const path = require('path');
const { DATA_DIR } = require('config/constants');

// File paths
const ASSIGNMENTS_FILE = path.join(DATA_DIR, 'all_assignments.json');

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
];

function parseDueDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  
  const lower = dateStr.toLowerCase().trim();
  
  // Skip non-date strings
  if (['posted', 'no due date', 'unknown'].some(keyword => lower.includes(keyword))) {
    return null;
  }
  
  const today = new Date();
  const currentYear = today.getFullYear();
  
  // Handle relative dates
  if (lower.includes('today')) {
    return formatDateTimeString(today);
  }
  if (lower.includes('yesterday')) {
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    return formatDateTimeString(yesterday);
  }
  if (lower.includes('tomorrow')) {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return formatDateTimeString(tomorrow);
  }
  
  // Check if this is weekday-only (no month names or date numbers)
  const hasMonth = MONTH_NAMES.some(month => lower.includes(month));
  const hasDateNumbers = /\b\d{1,2}[/\-]\d{1,2}|\b\d{1,2}\s*(st|nd|rd|th)?\s*,|\b\d{4}\b/.test(lower);
  
  if (!hasMonth && !hasDateNumbers) {
    const weekdayIndex = WEEKDAYS.findIndex(day => lower.includes(day));
    if (weekdayIndex !== -1) {
      const currentWeekday = today.getDay() === 0 ? 6 : today.getDay() - 1; // Convert to Monday=0
      let daysToAdd = weekdayIndex - currentWeekday;
      if (daysToAdd <= 0) daysToAdd += 7; // Next occurrence
      
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + daysToAdd);
      return formatDateTimeString(targetDate);
    }
  }
  
  // Handle time-only strings (assume today)
  const timeOnlyPattern = /^\s*\d{1,2}:\d{2}\s*(AM|PM)?\s*$/i;
  if (timeOnlyPattern.test(dateStr)) {
    const timeStr = dateStr.trim();
    const todayDateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const fullDateStr = `${todayDateStr} ${timeStr}`;
    const parsed = new Date(fullDateStr);
    if (!isNaN(parsed.getTime())) {
      return formatDateTimeString(parsed);
    }
  }
  
  // Attempt standard date parsing with year assumption
  try {
    let parsed = new Date(dateStr);
    
    // If the parsed date has an obviously wrong year (like 2001), fix it
    if (!isNaN(parsed.getTime())) {
      if (parsed.getFullYear() < 2020 || parsed.getFullYear() > currentYear + 1) {
        // Assume current year or next year
        const month = parsed.getMonth();
        const date = parsed.getDate();
        const hours = parsed.getHours();
        const minutes = parsed.getMinutes();
        
        // Smart year determination
        let year = currentYear;
        
        // Create a test date with current year
        const testDate = new Date(currentYear, month, date, hours, minutes);
        const now = new Date();
        
        // If the assignment date is more than 6 months in the past, 
        // it's likely meant for next year
        const monthsDiff = (now.getFullYear() - testDate.getFullYear()) * 12 + 
                          (now.getMonth() - testDate.getMonth());
        
        if (monthsDiff > 6) {
          year = currentYear + 1;
        }
        // If the assignment date is more than 6 months in the future,
        // it's likely meant for last year (missing assignment)
        else if (monthsDiff < -6) {
          year = currentYear - 1;
        }
        
        parsed = new Date(year, month, date, hours, minutes);
      }
      return formatDateTimeString(parsed);
    }
  } catch (e) {
    // Continue to fallback
  }
  
  return null; // Return null if parsing fails completely
}

function formatDateString(date) {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD format
}

function formatDateTimeString(date) {
  // Return ISO string with time: YYYY-MM-DDTHH:MM:SS.sssZ
  return date.toISOString();
}

/**
 * Cleans up course names by removing room numbers, section numbers, etc.
 * Removes everything from the first word containing a digit onwards.
 * @param {string} courseName - The original course name
 * @returns {string} - The cleaned course name
 */
function cleanCourseName(courseName) {
  if (!courseName) return courseName;
  
  const words = courseName.trim().split(/\s+/);
  const cleanWords = [];
  
  for (const word of words) {
    // Check if word contains any digit
    if (/\d/.test(word)) {
      break; // Stop at first word with a digit
    }
    cleanWords.push(word);
  }
  
  // If we'd have an empty string, return the original
  return cleanWords.length > 0 ? cleanWords.join(' ') : courseName;
}

function createAssignmentObject(name, className, dueDate, url, description = '', maxPoints = 0) {
  // Parse the due date for internal use
  const parsed = parseDueDate(dueDate);

  // Prepare a user-friendly display value for the due date.
  // If we have a parsed ISO timestamp, convert to a local date string
  // (no time) to avoid showing UTC offsets like "T04:00:00.000Z" in the UI.
  let displayDue = '';
  if (parsed) {
    const dt = new Date(parsed);
    if (!isNaN(dt.getTime())) {
      // Format like: "Oct 22, 2025"
      displayDue = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } else {
      displayDue = dueDate || '';
    }
  } else {
    // If there's no parsed date, keep original string or mark as 'No due date'
    displayDue = dueDate && typeof dueDate === 'string' && dueDate.trim() ? dueDate.trim() : '';
  }

  return {
    name,
    class: cleanCourseName(className),
    // Human-friendly date for display (no timezone artifacts)
    due_date: displayDue || 'No due date',
    // Keep an ISO timestamp (or null) for comparisons and filtering
    due_date_parsed: parsed,
    url,
    description,
    max_points: maxPoints
  };
}

async function saveAssignments(assignments, filename = ASSIGNMENTS_FILE) {
  try {
    await fs.writeFile(filename, JSON.stringify(assignments, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`Failed to save assignments to ${filename}:`, error);
    return false;
  }
}

async function loadAssignments(filename = ASSIGNMENTS_FILE) {
  try {
    const data = await fs.readFile(filename, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    console.error(`Failed to load assignments from ${filename}:`, error);
    return null;
  }
}

module.exports = {
  parseDueDate,
  createAssignmentObject,
  cleanCourseName,
  saveAssignments,
  loadAssignments,
  DATA_DIR,
  ASSIGNMENTS_FILE
};