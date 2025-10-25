const { logToRenderer } = require('core/logger');
const { createAssignmentObject } = require('scrapers/assignment-utils');

// Generate URLs for a specific Google account
function getGoogleClassroomUrls(accountNumber = 0) {
  return {
    ASSIGNED_URL: `https://classroom.google.com/u/${accountNumber}/a/not-turned-in/all`,
    MISSING_URL: `https://classroom.google.com/u/${accountNumber}/a/missing/all`,
    DONE_URL: `https://classroom.google.com/u/${accountNumber}/a/turned-in/all`
  };
}

async function scrapeGoogleClassroomAssignments(browserView, accountNumber = 0) {
  logToRenderer(`[GoogleC] Starting assignment scraping for account /u/${accountNumber}...`, 'info');
  
  const allAssignments = [];
  
  try {
    // Get URLs for the specified account
    const urls = getGoogleClassroomUrls(accountNumber);
    
    // Scrape from each tab type
    const tabs = [
      { url: urls.ASSIGNED_URL, isMissing: false, label: 'assigned' },
      { url: urls.MISSING_URL, isMissing: true, label: 'missing' },
      { url: urls.DONE_URL, isMissing: false, isDoneButMissing: true, label: 'done' }
    ];
    
    for (const tab of tabs) {
      logToRenderer(`[GoogleC] Scraping ${tab.label} assignments for account /u/${accountNumber}...`, 'info');
      
      // Step 1: Load the URL and wait for it to settle
      logToRenderer(`[GoogleC] Loading ${tab.label} tab...`, 'info');
      await browserView.webContents.loadURL(tab.url);
      await waitBriefly(1000); // Wait for page to load and settle
      
      // Check if we were redirected to login page or wrong account
      const currentUrl = browserView.webContents.getURL();
      if (currentUrl.includes('accounts.google.com') || currentUrl.includes('signin')) {
        logToRenderer(`[GoogleC] Authentication required for account /u/${accountNumber}`, 'warn');
        return { success: false, needsAuth: true, error: 'Authentication required', assignments: [] };
      }
      
      // Check if we were redirected to the wrong account (e.g., trying to access /u/1 but got /u/0)
      if (currentUrl.includes('classroom.google.com/u/') && !currentUrl.includes(`/u/${accountNumber}/`)) {
        logToRenderer(`[GoogleC] Account redirect detected: trying to access /u/${accountNumber} but got ${currentUrl}`, 'warn');
        return { success: false, needsAuth: true, error: 'Wrong account - need to switch accounts', assignments: [] };
      }
      
      // Step 3: Expand all content on this tab
      logToRenderer(`[GoogleC] Expanding content on ${tab.label} tab...`, 'info');
      const expansionResult = await expandPageContent(browserView);
      if (expansionResult.earlierClicks > 0 || expansionResult.viewAllClicks > 0) {
        logToRenderer(`[GoogleC] Expanded ${tab.label} content: ${expansionResult.earlierClicks} Earlier buttons, ${expansionResult.viewAllClicks} View All buttons`, 'info');
      }
      
      // Step 4: Wait a bit more for any final content to settle
      logToRenderer(`[GoogleC] Waiting for final content settlement on ${tab.label} tab...`, 'info');
      await waitBriefly(1000);
      
      // Step 5: Extract assignments from the fully expanded page
      logToRenderer(`[GoogleC] Extracting assignments from ${tab.label} tab...`, 'info');
      const basicAssignments = await extractAssignmentsFromExpandedPage(
        browserView, 
        tab.isMissing, 
        tab.isDoneButMissing
      );
      
      // Extract detailed information for each assignment
      logToRenderer(`[GoogleC] Extracting detailed info for ${basicAssignments.length} assignments from ${tab.label} tab...`, 'info');
      const detailedAssignments = [];
      
      for (let i = 0; i < basicAssignments.length; i++) {
        const assignment = basicAssignments[i];
        logToRenderer(`[GoogleC] Getting details for assignment ${i + 1}/${basicAssignments.length}: ${assignment.name}`, 'info');
        
        const details = await extractAssignmentDetails(browserView, assignment.url);
        
        // Merge basic info with detailed info
        const detailedAssignment = {
          ...assignment,
          description: details.description,
          maxPoints: details.maxPoints,
          detailedDueDate: details.dueDate || assignment.dueDate
        };
        
        detailedAssignments.push(detailedAssignment);
        
        // Brief pause between requests to be respectful
        await waitBriefly(1000);
      }
      
      allAssignments.push(...detailedAssignments);
      logToRenderer(`[GoogleC] Found ${detailedAssignments.length} assignments with details in ${tab.label} tab for account /u/${accountNumber}`, 'info');
    }
    
    const uniqueAssignments = deduplicateAssignments(allAssignments);
    logToRenderer(`[GoogleC] Total unique assignments found for account /u/${accountNumber}: ${uniqueAssignments.length}`, 'success');

    return { success: true, assignments: uniqueAssignments };
    
  } catch (error) {
    logToRenderer(`[GoogleC] Error scraping account /u/${accountNumber}: ${error.message}`, 'error');
    return { success: false, error: error.message, assignments: [] };
  }
}

async function waitBriefly(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function expandPageContent(browserView) {
  // Handle "Earlier" buttons - these show older assignments
  const earlierResult = await browserView.webContents.executeJavaScript(`
    (function() {
      const earlierButtons = document.querySelectorAll('button[aria-label*="Earlier"]');
      let clickCount = 0;
      const clickedButtons = [];
      const skippedButtons = [];
      
      for (const button of earlierButtons) {
        if (button.offsetParent !== null) { // Check if button is visible
          try {
            const ariaLabel = button.getAttribute('aria-label');
            const ariaExpanded = button.getAttribute('aria-expanded');
            
            // Only click if it's not already expanded
            if (ariaExpanded !== 'true') {
              button.click();
              clickedButtons.push(ariaLabel);
              clickCount++;
            } else {
              skippedButtons.push(ariaLabel + ' (already expanded)');
            }
          } catch (e) {
            // Can't log errors here, will return them
          }
        }
      }
      
      return { clickCount, clickedButtons, skippedButtons };
    })()
  `);
  
  if (earlierResult.clickCount > 0) {
    logToRenderer(`[GoogleC] Clicked ${earlierResult.clickCount} Earlier buttons: ${earlierResult.clickedButtons.join(', ')}`, 'info');
    await waitBriefly(1000);
  }
  
  if (earlierResult.skippedButtons.length > 0) {
    logToRenderer(`[GoogleC] Skipped ${earlierResult.skippedButtons.length} Earlier buttons: ${earlierResult.skippedButtons.join(', ')}`, 'info');
  }
  
  // Handle "View all" buttons - these expand condensed sections
  const viewAllResult = await browserView.webContents.executeJavaScript(`
    (function() {
      let clickCount = 0;
      const clickedButtons = [];
      
      // Method 1: Look for spans containing "view all" text
      const viewAllSpans = document.querySelectorAll('span');
      for (const span of viewAllSpans) {
        const text = span.textContent ? span.textContent.toLowerCase() : '';
        if (text.includes('view all')) {
          try {
            const button = span.closest('button');
            if (button && button.offsetParent !== null) {
              button.click();
              clickedButtons.push('Method 1: ' + span.textContent.trim());
              clickCount++;
            }
          } catch (e) {
            // Can't log errors here
          }
        }
      }
      
      // Method 2: Look for buttons directly containing "view all" text
      const viewAllButtons = document.querySelectorAll('button');
      for (const button of viewAllButtons) {
        const text = button.textContent ? button.textContent.toLowerCase() : '';
        if (text.includes('view all') && button.offsetParent !== null) {
          try {
            button.click();
            clickedButtons.push('Method 2: ' + button.textContent.trim());
            clickCount++;
          } catch (e) {
            // Can't log errors here
          }
        }
      }
      
      // Method 3: Look for aria-label containing "view all"
      const ariaButtons = document.querySelectorAll('button[aria-label*="view"], button[aria-label*="View"]');
      for (const button of ariaButtons) {
        const ariaLabel = button.getAttribute('aria-label').toLowerCase();
        if (ariaLabel.includes('view all') && button.offsetParent !== null) {
          try {
            button.click();
            clickedButtons.push('Method 3: ' + button.getAttribute('aria-label'));
            clickCount++;
          } catch (e) {
            // Can't log errors here
          }
        }
      }
      
      return { clickCount, clickedButtons };
    })()
  `);
  
  if (viewAllResult.clickCount > 0) {
    logToRenderer(`[GoogleC] Clicked ${viewAllResult.clickCount} View All buttons: ${viewAllResult.clickedButtons.join(', ')}`, 'info');
    await waitBriefly(1000);
  }
  
  return { 
    earlierClicks: earlierResult.clickCount, 
    viewAllClicks: viewAllResult.clickCount 
  };
}

async function extractAssignmentsFromExpandedPage(browserView, isMissing = false, isDoneButMissing = false) {
  // Page content should already be expanded by this point
  logToRenderer(`[GoogleC] Extracting assignments from expanded page...`, 'info');
  
  const result = await browserView.webContents.executeJavaScript(`
    (function() {
      const assignments = [];
      const allLinks = document.querySelectorAll('a[href*="details"]');
      let processedLinks = 0;
      let skippedLinks = 0;
      
      for (const link of allLinks) {
        try {
          processedLinks++;
          const pTags = link.querySelectorAll('p');
          
          if (pTags.length >= 2) {
            let assignmentName = pTags[0].textContent.trim();
            let className = pTags[1].textContent.trim();
            
            if (!assignmentName || !className) {
              skippedLinks++;
              continue;
            }
            
            const fullHref = link.href.startsWith('http') 
              ? link.href 
              : window.location.origin + link.href;
            
            // Filter for done-but-missing assignments
            let shouldInclude = true;
            if (${isDoneButMissing}) {
              const container = link.closest('li');
              if (container) {
                const containerText = container.innerHTML
                  .replace(/<[^>]*>/g, ' ')
                  .replace(/\\s+/g, ' ')
                  .trim()
                  .toLowerCase();
                
                const hasNotTurnedIn = containerText.includes('not turned in');
                const hasMissing = containerText.includes('missing');
                const hasZeroPoints = /\\b0\\s*\\//.test(containerText);
                
                shouldInclude = (hasNotTurnedIn || hasMissing) && hasZeroPoints;
              } else {
                shouldInclude = false;
              }
            }
            
            if (shouldInclude) {
              // Extract due date from various possible locations
              let dueDate = '';
              const container = link.closest('li');
              if (container) {
                const dueDateElements = container.querySelectorAll('[data-testid*="due"], .due-date, .assignment-due-date');
                if (dueDateElements.length > 0) {
                  dueDate = dueDateElements[0].textContent.replace(/^(Due|due)\\s*/i, '').trim();
                }
                
                // Fallback: look for date patterns in container text
                if (!dueDate) {
                  const textContent = container.textContent;
                  const dateMatch = textContent.match(/(?:Due|due)\\s*:?\\s*([^\\n\\r]+?)(?:\\n|\\r|$)/i);
                  if (dateMatch) {
                    dueDate = dateMatch[1].trim();
                  }
                }
              }
              
              assignments.push({
                name: assignmentName,
                className: className,
                dueDate: dueDate || 'No due date',
                url: fullHref,
                isMissing: ${isMissing} || ${isDoneButMissing}
              });
            } else {
              skippedLinks++;
            }
          } else {
            skippedLinks++;
          }
        } catch (e) {
          skippedLinks++;
        }
      }
      
      return { 
        assignments, 
        totalLinks: allLinks.length,
        processedLinks,
        skippedLinks
      };
    })()
  `);
  
  logToRenderer(`[GoogleC] Processed ${result.processedLinks}/${result.totalLinks} links, skipped ${result.skippedLinks}, found ${result.assignments.length} valid assignments`, 'info');
  
  return result.assignments;
}

async function extractAssignmentDetails(browserView, assignmentUrl) {
  /**
   * Extract detailed information from an assignment's details page
   * Returns: { description, maxPoints, dueDate }
   */
  let description = '';
  let maxPoints = 0;
  let dueDate = '';
  
  try {
    logToRenderer(`[GoogleC] Visiting details page: ${assignmentUrl}`, 'info');
    await browserView.webContents.loadURL(assignmentUrl);
    await waitBriefly(1000); // Wait for page to load
    
    // Extract all the details in one JavaScript execution
    const details = await browserView.webContents.executeJavaScript(`
      (function() {
        let description = '';
        let maxPoints = 0;
        let dueDate = '';
        
        // Extract description from div with guided_help_id containing "assignmentInstructions"
        try {
          const descriptionDiv = document.querySelector('div[guidedhelpid*="assignmentInstructions"]');
          if (descriptionDiv) {
            const descriptionSpan = descriptionDiv.querySelector('span');
            if (descriptionSpan) {
              description = descriptionSpan.textContent.trim();
            }
          }
        } catch (e) {
          // Description extraction failed
        }
        
        // Extract max points from text containing "[number] points"
        try {
          const pointsElements = document.querySelectorAll('*');
          for (const element of pointsElements) {
            const text = element.textContent;
            if (text && (text.includes('points') || text.includes('Points'))) {
              const pointsMatch = text.match(/(\\d+)\\s+[Pp]oints/);
              if (pointsMatch) {
                maxPoints = parseInt(pointsMatch[1]);
                break;
              }
            }
          }
        } catch (e) {
          // Points extraction failed
        }
        
        // Extract due date from main content area - following Python approach exactly
        try {
          let mainText = '';
          let foundMainDiv = false;
          
          // Step 1: Get the FIRST div with role="main" (exact Python approach)
          const mainDiv = document.querySelector('div[role="main"]');
          if (mainDiv) {
            // Use innerHTML and strip HTML tags with spaces, like Python version
            const html = mainDiv.innerHTML || '';
            mainText = html.replace(/<[^>]*>/g, ' ').replace(/\\s+/g, ' ').trim();
            foundMainDiv = true;
          } else {
            // Fallback to body text if no main div found, also strip HTML
            const html = document.body.innerHTML || '';
            mainText = html.replace(/<[^>]*>/g, ' ').replace(/\\s+/g, ' ').trim();
          }
          
          // Step 2: Apply the exact regex pattern from Python but be more selective
          if (mainText) {
            // Try to find the main "Due" statement, not just any "Due" text
            // Look for "Due" followed by a date/time pattern more specifically
            let dueMatch = mainText.match(/Due\\s+([A-Za-z]+(?:\\s+\\d{1,2})?(?:,\\s*\\d{1,2}:\\d{2}\\s*[AP]M)?)/i);
            
            // If that doesn't work, try the broader pattern but be more careful
            if (!dueMatch) {
              dueMatch = mainText.match(/Due\\s*([^,\\n]+?)(?:,\\s*([^,\\n]+?))?(?:\\s|$)/i);
            }
            if (dueMatch) {
              let datePart = dueMatch[1].trim();
              let timePart = dueMatch[2] ? dueMatch[2].trim() : '';
              
              // Step 3: Check for time-only pattern (implies today)
              const timeOnlyPattern = /^\\d{1,2}:\\d{2}\\s*(AM|PM)$/i;
              if (timeOnlyPattern.test(datePart)) {
                // It's just a time, so it means today
                const today = new Date().toLocaleDateString('en-US', { 
                  month: 'long', 
                  day: 'numeric' 
                });
                dueDate = today + ', ' + datePart;
              } else {
                // Normal date format
                dueDate = datePart + (timePart ? ', ' + timePart : '');
              }
              
              return { 
                description, 
                maxPoints, 
                dueDate
              };
            } else {
              // No due date match found
              return { 
                description, 
                maxPoints, 
                dueDate: ''
              };
            }
          } else {
            // No main text available
            return { 
              description, 
              maxPoints, 
              dueDate: ''
            };
          }
        } catch (e) {
          // Due date extraction failed
          return { 
            description, 
            maxPoints, 
            dueDate: ''
          };
        }
        
        // If we get here, return basic info without debug
        return { description, maxPoints, dueDate };
      })()
    `);
    
    return { 
      description: details.description || '', 
      maxPoints: details.maxPoints || 0, 
      dueDate: details.dueDate || '' 
    };
    
  } catch (error) {
    logToRenderer(`[GoogleC] Error extracting assignment details from ${assignmentUrl}: ${error.message}`, 'warning');
    return { description: '', maxPoints: 0, dueDate: '' };
  }
}

function deduplicateAssignments(assignments) {
  const seen = new Set();
  return assignments.filter(assignment => {
    const key = `${assignment.name}|${assignment.className}|${assignment.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function convertToStandardFormat(rawAssignments) {
  return rawAssignments.map(raw => 
    createAssignmentObject(
      raw.name,
      raw.className,
      raw.detailedDueDate || raw.dueDate,
      raw.url,
      raw.description || '', // Now we have description from detail pages
      raw.maxPoints || 0     // Now we have points info from detail pages
    )
  );
}

module.exports = {
  scrapeGoogleClassroomAssignments,
  convertToStandardFormat
};