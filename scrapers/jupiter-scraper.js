const { logToRenderer } = require('core/logger');
const { createAssignmentObject } = require('scrapers/assignment-utils');
const { JUPITER_CONFIG_PATH } = require('config/constants');
const fs = require('fs');
const path = require('path');

// Load Jupiter classes configuration
function loadJupiterClassesConfig() {
  try {
    const configData = fs.readFileSync(JUPITER_CONFIG_PATH, 'utf8');
    const config = JSON.parse(configData);
    
    // Filter out metadata fields and return only class selections
    const classSelections = {};
    for (const [key, value] of Object.entries(config)) {
      if (key !== 'last_updated' && (value === 'selected' || value === 'unselected')) {
        classSelections[key] = value;
      }
    }
    
    return classSelections;
  } catch (error) {
    logToRenderer(`[Jupiter] Error loading classes config: ${error.message}`, 'warn');
    return {};
  }
}

// Save all available classes to config, preserving existing selections
function saveAvailableClassesToConfig(availableClasses) {
  try {
    let config = {};
    
    // Load existing config if it exists
    if (fs.existsSync(JUPITER_CONFIG_PATH)) {
      const configData = fs.readFileSync(JUPITER_CONFIG_PATH, 'utf8');
      config = JSON.parse(configData);
    }
    
    // Get existing selections
    const existingSelections = config || {};
    
    // Create new config with all available classes
    const allClasses = {};
    availableClasses.forEach(classInfo => {
      const className = classInfo.name;
      // Preserve existing selection, default to "selected" for new classes
      allClasses[className] = existingSelections[className] || "selected";
    });
    
    // Update config - save directly as the root object
    Object.assign(config, allClasses);
    config.last_updated = new Date().toISOString();
    
    // Save config
    fs.writeFileSync(JUPITER_CONFIG_PATH, JSON.stringify(config, null, 2));
    
    const selectedCount = Object.values(allClasses).filter(status => status === "selected").length;
    logToRenderer(`[Jupiter] Updated config with ${availableClasses.length} available classes (${selectedCount} selected)`, 'info');
    
    return allClasses;
  } catch (error) {
    logToRenderer(`[Jupiter] Error saving available classes to config: ${error.message}`, 'error');
    return {};
  }
}

// Filter available classes to only include selected ones
function filterSelectedClasses(availableClasses, selectedClasses) {
  const selectedClassNames = Object.keys(selectedClasses);
  const filtered = availableClasses.filter(classInfo => {
    return selectedClassNames.includes(classInfo.name);
  });
  
  logToRenderer(`[Jupiter] Filtered from ${availableClasses.length} to ${filtered.length} selected classes`, 'info');
  return filtered;
}

async function scrapeJupiterAssignments(browserView) {
  logToRenderer('[Jupiter] Starting assignment scraping...', 'info');
  
  try {
    // Assume we're already logged in from the access module
    // Get list of available classes from To Do page (this will navigate to To Do page)
    const allClasses = await getAvailableJupiterClasses(browserView);
    logToRenderer(`[Jupiter] Found ${allClasses.length} total classes`, 'info');
    
    // Load config and filter to only selected classes
    const selectedClassesConfig = loadJupiterClassesConfig();
    const classes = filterSelectedClasses(allClasses, selectedClassesConfig);
    
    if (classes.length === 0) {
      logToRenderer('[Jupiter] No selected classes found (check jupiter_classes.json config)', 'warn');
      return { success: true, assignments: [] };
    }
    
    const allAssignments = [];
    
    // Scrape assignments from each class
    for (const classInfo of classes) {
      logToRenderer(`[Jupiter] Processing class: ${classInfo.name}`, 'info');
      
      const success = await navigateToClass(browserView, classInfo);
      if (!success) {
        logToRenderer(`[Jupiter] Failed to navigate to class: ${classInfo.name}`, 'warn');
        continue;
      }
      
      const assignments = await scrapeCurrentClassAssignments(browserView, classInfo.name);
      allAssignments.push(...assignments);
      
      logToRenderer(`[Jupiter] Found ${assignments.length} assignments in ${classInfo.name}`, 'info');
      
      // Navigate back to To Do page
      const backSuccess = await navigateToTodoPage(browserView);
      if (!backSuccess) {
        logToRenderer(`[Jupiter] Warning: Could not return to To Do page after ${classInfo.name}`, 'warn');
      }
    }
    
    logToRenderer(`[Jupiter] Total assignments found: ${allAssignments.length}`, 'success');
    return { success: true, assignments: allAssignments };
    
  } catch (error) {
    logToRenderer(`[Jupiter] Error scraping assignments: ${error.message}`, 'error');
    return { success: false, error: error.message, assignments: [] };
  }
}

async function waitForPageLoad(browserView, timeout = 5000) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeout);
    
    browserView.webContents.once('did-finish-load', () => {
      clearTimeout(timer);
      setTimeout(resolve, 500); // Reduced wait for Jupiter's slow loading
    });
  });
}

async function findTodoButton(browserView) {
  const buttonResult = await browserView.webContents.executeJavaScript(`
    new Promise((resolve) => {
      try {
        // Direct selector for the To Do button - no looping
        const todoButton = document.getElementById("mainpage").getElementsByClassName("btn")[0];
        
        if (todoButton) {
          resolve({ 
            success: true, 
            found: true, 
            text: todoButton.textContent?.trim(),
            script: todoButton.getAttribute('script'),
            elementHTML: todoButton.outerHTML.substring(0, 200)
          });
        } else {
          // Fallback: show what buttons exist for debugging
          const allButtons = Array.from(document.querySelectorAll('div.btn')).map(btn => ({
            text: btn.textContent?.trim(),
            script: btn.getAttribute('script')
          }));
          
          resolve({ 
            success: false, 
            found: false, 
            error: 'To Do button not found',
            buttonCount: allButtons.length,
            allButtons: allButtons
          });
        }
        
      } catch (e) {
        resolve({ success: false, error: e.message });
      }
    });
  `);
  
  return buttonResult.success;
}

async function clickTodoButton(browserView) {
  return browserView.webContents.executeJavaScript(`go('todo')`);
}

async function navigateToTodoPage(browserView) {
  logToRenderer('[Jupiter] Looking for ToDo button...', 'info');
  
  try {
    const found = await findTodoButton(browserView);
    if (!found) return false;
    
    await clickTodoButton(browserView);
    await waitForPageLoad(browserView);
    
    logToRenderer('[Jupiter] ToDo navigation complete', 'success');
    return true;
    
  } catch (error) {
    logToRenderer(`[Jupiter] Error navigating to ToDo: ${error.message}`, 'error');
    return false;
  }
}

async function getAvailableJupiterClasses(browserView) {
  try {
    logToRenderer('[Jupiter] Getting available classes from ToDo page...', 'info');
    
    // Navigate to To Do page first
    const todoSuccess = await navigateToTodoPage(browserView);
    if (!todoSuccess) {
      logToRenderer('[Jupiter] Failed to navigate to To Do page', 'error');
      return [];
    }
    
    return new Promise(async (resolve, reject) => {
      try {
        const classes = await browserView.webContents.executeJavaScript(`
          new Promise((resolve) => {
            try {
              const classes = [];
              
              // Find all class boxes
              const classBoxes = document.querySelectorAll('.classbox');
              console.log('Found', classBoxes.length, 'class boxes');
              
              for (const box of classBoxes) {
                try {
                  // Look for class rows within this classbox
                  const classRows = box.querySelectorAll('tr.hi');
                  console.log('Found', classRows.length, 'class rows in this box');
                  
                  for (const row of classRows) {
                    try {
                      // Extract class name from the div with class "big wrap"
                      const nameDiv = row.querySelector('div.big.wrap');
                      if (nameDiv && nameDiv.textContent.trim()) {
                        const className = nameDiv.textContent.trim();
                        
                        // Extract click parameters from the tr element (for navigation)
                        const clickAttr = row.getAttribute('click');
                        
                        classes.push({
                          name: className,
                          clickAttr: clickAttr,
                          element: row
                        });
                        
                        console.log('Found class:', className, 'click attr:', clickAttr);
                      }
                    } catch (e) {
                      console.warn('Error processing class row:', e);
                    }
                  }
                } catch (e) {
                  console.warn('Error processing class box:', e);
                }
              }
              
              console.log('Total classes found:', classes.length);
              resolve(classes);
            } catch (e) {
              console.error('Error in class discovery:', e);
              resolve([]);
            }
          })
        `);
        
    logToRenderer(`[Jupiter] Discovered ${classes.length} available classes`, 'info');
    
    // Save all available classes to config
    saveAvailableClassesToConfig(classes);
    
    resolve(classes);
      } catch (error) {
        logToRenderer(`[Jupiter] Error executing JavaScript for class discovery: ${error.message}`, 'error');
        resolve([]);
      }
    });
  } catch (error) {
    logToRenderer(`[Jupiter] Error getting available classes: ${error.message}`, 'error');
    return [];
  }
}

async function navigateToClass(browserView, classInfo) {
  try {
    logToRenderer(`[Jupiter] Navigating to class: ${classInfo.name}`, 'info');
    
    return new Promise(async (resolve, reject) => {
      try {
        const clicked = await browserView.webContents.executeJavaScript(`
          new Promise((resolve) => {
            try {
              // Find the specific class row by name
              const classBoxes = document.querySelectorAll('.classbox');
              
              for (const box of classBoxes) {
                const classRows = box.querySelectorAll('tr.hi');
                
                for (const row of classRows) {
                  const nameDiv = row.querySelector('div.big.wrap');
                  if (nameDiv && nameDiv.textContent.trim() === '${classInfo.name.replace(/'/g, "\\'")}') {
                    console.log('Found class row for:', '${classInfo.name.replace(/'/g, "\\'")}');
                    
                    // Get the click attribute (like "gogrades(5768947,4)")
                    const clickAttr = row.getAttribute('click');
                    console.log('Click attribute:', clickAttr);
                    
                    if (clickAttr) {
                      // Execute the click function directly (like we do with go('todo'))
                      eval(clickAttr);
                      resolve({ success: true, clicked: true, clickAttr: clickAttr });
                      return;
                    } else {
                      console.warn('No click attribute found for class row');
                      resolve({ success: false, clicked: false, error: 'No click attribute found' });
                      return;
                    }
                  }
                }
              }
              
              console.warn('Class row not found for:', '${classInfo.name.replace(/'/g, "\\'")}');
              resolve({ success: false, clicked: false, error: 'Class row not found' });
            } catch (e) {
              console.error('Error in class navigation:', e);
              resolve({ success: false, clicked: false, error: e.message });
            }
          })
        `);
        
        if (clicked.success) {
          logToRenderer(`[Jupiter] Successfully executed click for class: ${classInfo.name} (${clicked.clickAttr})`, 'info');
          await waitForPageLoad(browserView);
          resolve(true);
        } else {
          logToRenderer(`[Jupiter] Failed to find/click class: ${classInfo.name} - ${clicked.error}`, 'warn');
          resolve(false);
        }
      } catch (error) {
        logToRenderer(`[Jupiter] Error in executeJavaScript for class ${classInfo.name}: ${error.message}`, 'error');
        resolve(false);
      }
    });
  } catch (error) {
    logToRenderer(`[Jupiter] Error navigating to class ${classInfo.name}: ${error.message}`, 'error');
    return false;
  }
}

async function scrapeCurrentClassAssignments(browserView, className) {
  try {
    logToRenderer(`[Jupiter] Scraping assignments for class: ${className}`, 'info');
    
    return new Promise(async (resolve, reject) => {
      try {
        const assignments = await browserView.webContents.executeJavaScript(`
          new Promise((resolve) => {
            try {
              const assignments = [];
              
              // Find all TR elements that contain the green dot (incomplete assignments)
              // This matches the Python XPath: //tr[td/img[contains(@src, 'dot_green.svg')]]
              const allRows = document.querySelectorAll('tr');
              
              console.log('Found', allRows.length, 'total rows to check');
              
              for (const row of allRows) {
                try {
                  // Check if this row contains a green dot image
                  const greenDot = row.querySelector('td img[src*="dot_green.svg"]');
                  if (!greenDot) continue;
                  
                  const cells = row.querySelectorAll('td');
                  if (cells.length < 8) continue; // Make sure we have enough cells
                  
                  // Extract assignment details (matching Python cell indices)
                  const dueDate = cells[1] ? cells[1].textContent.trim() : '';
                  const assignmentName = cells[2] ? cells[2].textContent.trim() : '';
                  const maxPointsText = cells[7] ? cells[7].textContent.trim() : '';
                  
                  if (!assignmentName) continue;
                  
                  // Parse max points (remove any non-numeric characters)
                  let maxPoints = 0;
                  const pointsMatch = maxPointsText.match(/(\\d+)/);
                  if (pointsMatch) {
                    maxPoints = parseInt(pointsMatch[1], 10);
                  }
                  
                  assignments.push({
                    name: assignmentName,
                    className: '${className.replace(/'/g, "\\'")}',
                    dueDate: dueDate || 'No due date',
                    maxPoints: maxPoints,
                    url: window.location.href // Current class page URL
                  });
                  
                  console.log('Found assignment:', assignmentName, 'due:', dueDate, 'points:', maxPoints);
                  
                } catch (e) {
                  console.warn('Error processing assignment row:', e);
                }
              }
              
              console.log('Scraped', assignments.length, 'assignments from class');
              resolve(assignments);
            } catch (e) {
              console.error('Error in assignment scraping:', e);
              resolve([]);
            }
          })
        `);
        
        logToRenderer(`[Jupiter] Found ${assignments.length} assignments in ${className}`, 'info');
        resolve(assignments);
      } catch (error) {
        logToRenderer(`[Jupiter] Error executing JavaScript for ${className}: ${error.message}`, 'error');
        resolve([]);
      }
    });
  } catch (error) {
    logToRenderer(`[Jupiter] Error scraping assignments for ${className}: ${error.message}`, 'error');
    return [];
  }
}

async function extractAssignmentDetails(browserView, assignment) {
  // For now, we'll skip the detailed navigation since it requires complex
  // back-and-forth navigation. The basic info is sufficient for most use cases.
  // Future enhancement: implement detailed description extraction
  
  return {
    ...assignment,
    description: '' // Could be enhanced to extract full descriptions
  };
}

async function convertToStandardFormat(rawAssignments) {
  return rawAssignments.map(raw => 
    createAssignmentObject(
      raw.name,
      raw.className,
      raw.dueDate,
      raw.url,
      raw.description || '',
      raw.maxPoints || 0
    )
  );
}

module.exports = {
  scrapeJupiterAssignments,
  convertToStandardFormat,
  getAvailableJupiterClasses
};