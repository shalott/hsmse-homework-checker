// Settings Window JavaScript

const { ipcRenderer } = require('electron');

// DOM elements
const statusMessage = document.getElementById('status-message');
const credentialsForm = document.getElementById('jupiter-credentials-form');
const classSelection = document.getElementById('class-selection');
const loadClassesBtn = document.getElementById('load-classes');
const saveClassesBtn = document.getElementById('save-classes');
const testCredentialsBtn = document.getElementById('test-credentials');
const selectAllBtn = document.getElementById('select-all-classes');
const deselectAllBtn = document.getElementById('deselect-all-classes');
const closeBtn = document.getElementById('close-settings');
const saveAppSettingsBtn = document.getElementById('save-app-settings');
const saveAndExitBtn = document.getElementById('save-and-exit');

// Show status message
function showStatus(message, type = 'info', scrollToMessage = false) {
  // For success messages, use overlay instead of top status
  if (type === 'success') {
    const overlay = document.createElement('div');
    overlay.className = 'local-success-overlay';
    overlay.textContent = `✓ ${message}`;
    
    const container = document.querySelector('.settings-container');
    container.appendChild(overlay);
    
    // Remove after 5 seconds
    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }, 5000);
    return;
  }
  
  // For other message types, use the top status message
  statusMessage.textContent = message;
  statusMessage.className = `status-message status-${type}`;
  statusMessage.classList.remove('hidden');
  
  // Only scroll to message if explicitly requested
  if (scrollToMessage) {
    statusMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  
  setTimeout(() => {
    statusMessage.classList.add('hidden');
  }, 5000);
}


// Load existing credentials
async function loadCredentials() {
  try {
    const credentials = await ipcRenderer.invoke('get-jupiter-credentials');
    const deleteBtn = document.getElementById('delete-credentials');
    
    if (credentials) {
      document.getElementById('student-name').value = credentials.student_name || '';
      document.getElementById('password').value = credentials.password || '';
      const loginType = credentials.loginType || 'student';
      document.getElementById(`login-${loginType}`).checked = true;
      
      // Show delete button if credentials exist
      if (deleteBtn) {
        deleteBtn.style.display = 'inline-block';
      }
    } else {
      // Hide delete button if no credentials
      if (deleteBtn) {
        deleteBtn.style.display = 'none';
      }
    }
  } catch (error) {
    console.error('Error loading credentials:', error);
  }
}

// Load existing class selection
async function loadClassSelection() {
  try {
    const config = await ipcRenderer.invoke('get-jupiter-config');
    if (config && Object.keys(config).length > 0) {
      displayClassesFromConfig(config);
      return config;
    }
  } catch (error) {
    console.error('Error loading class selection:', error);
  }
  return {};
}

// Display classes from config
function displayClassesFromConfig(classesConfig) {
  classSelection.innerHTML = '';
  
  if (Object.keys(classesConfig).length === 0) {
    classSelection.innerHTML = '<p>No classes configured. Click "Load Classes" to fetch from Jupiter Ed.</p>';
    return;
  }

  Object.entries(classesConfig).forEach(([className, status], index) => {
    // Skip non-class properties like last_updated
    if (className === 'last_updated') return;
    
    const classItem = document.createElement('div');
    classItem.className = 'class-item';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `class-${index}`;
    checkbox.value = className;
    checkbox.checked = status === "selected";
    checkbox.classList.add('jupiter-class-checkbox');
    
    const label = document.createElement('label');
    label.htmlFor = `class-${index}`;
    label.textContent = className;
    
    classItem.appendChild(checkbox);
    classItem.appendChild(label);
    classSelection.appendChild(classItem);
  });
}

// Save credentials
credentialsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  try {
    const result = await saveJupiterCredentials();
    
    if (result.success) {
      // Show success message using overlay
      showStatus('Credentials saved successfully! Now continue to the Class Selection section below to choose which classes to scrape.', 'success');
      
      // Show the delete button after successful save
      const deleteBtn = document.getElementById('delete-credentials');
      if (deleteBtn) {
        deleteBtn.style.display = 'inline-block';
      }
    } else {
      showStatus(`Error saving credentials: ${result.error}`, 'error');
    }
  } catch (error) {
    showStatus(`Error saving credentials: ${error.message}`, 'error');
  }
});

// Test credentials
testCredentialsBtn.addEventListener('click', async () => {
  const credentials = {
    student_name: document.getElementById('student-name').value,
    password: document.getElementById('password').value,
    loginType: document.querySelector('input[name="login-type"]:checked').value
  };

  if (!credentials.student_name || !credentials.password) {
    showStatus('Please enter both student name and password', 'error');
    return;
  }

  try {
    showStatus('Testing credentials... Opening Jupiter Ed login page', 'info');
    const result = await ipcRenderer.invoke('test-jupiter-login', credentials);
    if (result.success) {
      showStatus('Login test successful! Credentials saved successfully! Now continue to the Class Selection section below to choose which classes to scrape.', 'success');
      // Reload class selection to show any newly loaded classes
      loadClassSelection();
    } else {
      showStatus(`Login test failed: ${result.error}. Check the browser window for details.`, 'error');
    }
  } catch (error) {
    showStatus(`Error testing credentials: ${error.message}`, 'error');
  }
});

// Load classes
loadClassesBtn.addEventListener('click', async () => {
  try {
    showStatus('Loading classes from Jupiter Ed... This will open a browser window.', 'info');
    const result = await ipcRenderer.invoke('load-jupiter-classes');
    
    if (result.success && result.classes) {
      displayClasses(result.classes);
      showStatus(`Loaded ${result.classes.length} classes from Jupiter Ed`, 'success', false);
    } else {
      showStatus(`Failed to load classes: ${result.error}`, 'error');
    }
  } catch (error) {
    showStatus(`Error loading classes: ${error.message}`, 'error');
  }
});

// Display classes
function displayClasses(classes) {
  classSelection.innerHTML = '';
  
  if (classes.length === 0) {
    classSelection.innerHTML = '<p>No classes found.</p>';
    return;
  }

  classes.forEach((classInfo, index) => {
    const classItem = document.createElement('div');
    classItem.className = 'class-item';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `class-${index}`;
    checkbox.value = classInfo.id || classInfo.name;
    checkbox.checked = true; // Default to selected
    checkbox.classList.add('jupiter-class-checkbox');
    
    const label = document.createElement('label');
    label.htmlFor = `class-${index}`;
    label.textContent = classInfo.name || classInfo.title || `Class ${index + 1}`;
    
    classItem.appendChild(checkbox);
    classItem.appendChild(label);
    classSelection.appendChild(classItem);
  });
}

// Select all classes
selectAllBtn.addEventListener('click', () => {
  const checkboxes = classSelection.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(checkbox => checkbox.checked = true);
});

// Deselect all classes
deselectAllBtn.addEventListener('click', () => {
  const checkboxes = classSelection.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(checkbox => checkbox.checked = false);
});

// Reusable function to save Jupiter credentials
async function saveJupiterCredentials() {
  const credentials = {
    student_name: document.getElementById('student-name').value,
    password: document.getElementById('password').value,
    loginType: document.querySelector('input[name="login-type"]:checked').value
  };

  const result = await ipcRenderer.invoke('save-jupiter-credentials', credentials);
  return result;
}

// Reusable function to save Jupiter class selection
async function saveJupiterClassSelection() {
  const checkboxes = classSelection.querySelectorAll('input[type="checkbox"]:checked');
  const selectedClasses = {};
  
  checkboxes.forEach(checkbox => {
    selectedClasses[checkbox.value] = "selected";
  });
  
  // Add unselected classes
  const allCheckboxes = classSelection.querySelectorAll('input[type="checkbox"]');
  allCheckboxes.forEach(checkbox => {
    if (!checkbox.checked) {
      selectedClasses[checkbox.value] = "unselected";
    }
  });

  const result = await ipcRenderer.invoke('save-jupiter-config', selectedClasses);
  return result;
}


// Save class selection
saveClassesBtn.addEventListener('click', async () => {
  try {
    const result = await saveJupiterClassSelection();
    
    if (result.success) {
      showStatus(`Successfully saved selection for ${Object.keys(result).length} classes!`, 'success', false);
    } else {
      showStatus(`Error saving class selection: ${result.error}`, 'error');
    }
  } catch (error) {
    showStatus(`Error saving class selection: ${error.message}`, 'error');
  }
});


// Close settings
function closeSettings() {
  window.close();
}

closeBtn.addEventListener('click', closeSettings);


// Support keyboard shortcuts
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeSettings();
  }
});

// Load app settings
async function loadAppSettings() {
  try {
    const settings = await ipcRenderer.invoke('get-app-settings');
    document.getElementById('scrape-nyc-students-google').checked = settings.scrape_nyc_students_google;
    document.getElementById('scrape-hsmse-google').checked = settings.scrape_hsmse_google;
    document.getElementById('scrape-geometry-calendar').checked = settings.scrape_geometry_calendar;
    document.getElementById('scrape-jupiter').checked = settings.scrape_jupiter;
  } catch (error) {
    console.error('Error loading app settings:', error);
    showStatus('Error loading app settings', 'error');
  }
}

// Save app settings
saveAppSettingsBtn.addEventListener('click', async () => {
  try {
    const settings = {
      scrape_nyc_students_google: document.getElementById('scrape-nyc-students-google').checked,
      scrape_hsmse_google: document.getElementById('scrape-hsmse-google').checked,
      scrape_geometry_calendar: document.getElementById('scrape-geometry-calendar').checked,
      scrape_jupiter: document.getElementById('scrape-jupiter').checked,
      schedule_enabled: document.getElementById('schedule-enabled').checked,
      schedule_time: document.getElementById('schedule-time').value
    };
    
    const result = await ipcRenderer.invoke('save-app-settings', settings);
    if (result.success) {
      showStatus('App settings saved successfully!', 'success');
      // Reload scheduler status after saving
      await loadSchedulerStatus();
    } else {
      showStatus(`Error saving app settings: ${result.error}`, 'error');
    }
  } catch (error) {
    console.error('Error saving app settings:', error);
    showStatus(`Error saving app settings: ${error.message}`, 'error');
  }
});

// Save and Exit button - saves EVERYTHING
saveAndExitBtn.addEventListener('click', async () => {
  try {
    showStatus('Saving all settings...', 'info');
    
    // 1. Save Jupiter credentials if they exist
    const studentNameEl = document.getElementById('student-name');
    const passwordEl = document.getElementById('password');
    const loginTypeEl = document.querySelector('input[name="login-type"]:checked');
    
    if (studentNameEl && passwordEl && loginTypeEl) {
      // Use the same save method as the regular save button
      const credentialsResult = await saveJupiterCredentials();
      if (!credentialsResult.success) {
        showStatus(`Error saving Jupiter credentials: ${credentialsResult.error}`, 'error');
        return;
      }
    }
    
    // 2. Save class selection (only if classes are loaded)
    const allClassCheckboxes = document.querySelectorAll('.jupiter-class-checkbox');
    if (allClassCheckboxes.length > 0) {
      // Use the same save method as the regular save button
      const classesResult = await saveJupiterClassSelection();
      if (!classesResult.success) {
        showStatus(`Error saving class selection: ${classesResult.error}`, 'error');
        return;
      }
    } else {
      // No classes loaded, skip saving class selection to preserve existing config
      console.log('No Jupiter classes loaded - skipping class selection save to preserve existing config');
    }
    
    // 3. Save app settings
    const settings = {};
    
    // Check each setting element exists before accessing it
    const nycStudentsEl = document.getElementById('scrape-nyc-students-google');
    const hsmseGoogleEl = document.getElementById('scrape-hsmse-google');
    const geometryCalendarEl = document.getElementById('scrape-geometry-calendar');
    const jupiterEl = document.getElementById('scrape-jupiter');
    const scheduleEnabledEl = document.getElementById('schedule-enabled');
    const scheduleTimeEl = document.getElementById('schedule-time');
    
    if (nycStudentsEl) settings.scrape_nyc_students_google = nycStudentsEl.checked;
    if (hsmseGoogleEl) settings.scrape_hsmse_google = hsmseGoogleEl.checked;
    if (geometryCalendarEl) settings.scrape_geometry_calendar = geometryCalendarEl.checked;
    if (jupiterEl) settings.scrape_jupiter = jupiterEl.checked;
    if (scheduleEnabledEl) settings.schedule_enabled = scheduleEnabledEl.checked;
    if (scheduleTimeEl) settings.schedule_time = scheduleTimeEl.value;
    
    const settingsResult = await ipcRenderer.invoke('save-app-settings', settings);
    if (!settingsResult.success) {
      showStatus(`Error saving app settings: ${settingsResult.error}`, 'error');
      return;
    }
    
    // 4. Reload scheduler status
    await loadSchedulerStatus();
    
    // 5. Show success and close
    showStatus('All settings saved successfully!', 'success');
    setTimeout(() => {
      window.close();
    }, 1000);
    
  } catch (error) {
    console.error('Error saving and exiting:', error);
    showStatus(`Error saving settings: ${error.message}`, 'error');
  }
});

// Delete credentials button
const deleteCredentialsBtn = document.getElementById('delete-credentials');
deleteCredentialsBtn.addEventListener('click', async () => {
  if (confirm('Are you sure you want to delete your Jupiter credentials? This will require you to re-enter them.')) {
    try {
      const result = await ipcRenderer.invoke('delete-jupiter-credentials');
      if (result.success) {
        showStatus('Jupiter credentials deleted successfully', 'success');
        // Clear the form
        document.getElementById('student-name').value = '';
        document.getElementById('password').value = '';
        document.getElementById('login-student').checked = true;
        
        // Hide the delete button
        deleteCredentialsBtn.style.display = 'none';
      } else {
        showStatus(`Error deleting credentials: ${result.error}`, 'error');
      }
    } catch (error) {
      console.error('Error deleting credentials:', error);
      showStatus(`Error deleting credentials: ${error.message}`, 'error');
    }
  }
});

// Handle scroll instructions from main process
ipcRenderer.on('scroll-to-jupiter-credentials', () => {
  const credentialsHeader = document.getElementById('jupiter-credentials-header');
  if (credentialsHeader) {
    // Get the actual height of the sticky header dynamically
    const stickyHeader = document.querySelector('.settings-header');
    const headerHeight = stickyHeader ? stickyHeader.offsetHeight : 0;
    
    // Get the position of the header and scroll to it with dynamic offset
    const headerRect = credentialsHeader.getBoundingClientRect();
    const container = document.querySelector('.settings-container');
    const currentScroll = container.scrollTop;
    const targetHeaderHeight = credentialsHeader.offsetHeight;
    const targetScroll = currentScroll + headerRect.top - headerHeight - targetHeaderHeight;
    
    container.scrollTo({
      top: targetScroll,
      behavior: 'smooth'
    });
  }
});

ipcRenderer.on('scroll-to-jupiter-classes', () => {
  const classesHeader = document.getElementById('jupiter-classes-header');
  if (classesHeader) {
    // Get the actual height of the sticky header dynamically
    const stickyHeader = document.querySelector('.settings-header');
    const headerHeight = stickyHeader ? stickyHeader.offsetHeight : 0;
    
    // Get the position of the header and scroll to it with dynamic offset
    const headerRect = classesHeader.getBoundingClientRect();
    const container = document.querySelector('.settings-container');
    const currentScroll = container.scrollTop;
    const targetHeaderHeight = classesHeader.offsetHeight;
    const targetScroll = currentScroll + headerRect.top - headerHeight - targetHeaderHeight;
    
    container.scrollTo({
      top: targetScroll,
      behavior: 'smooth'
    });
  }
});

// Handle classes loaded from test login
ipcRenderer.on('classes-loaded', () => {
  // Reload the class selection to show the newly loaded classes
  loadClassSelection();
});

// Help icon functionality
const helpIcon = document.getElementById('class-selection-help');
if (helpIcon) {
  helpIcon.addEventListener('click', () => {
    alert('Select those classes that are only or primarily updated on Jupiter Ed. If you select classes that are primarily updated on Google Classroom, you may end up with duplicates.');
  });
}

// Scheduling functionality
const scheduleEnabledCheckbox = document.getElementById('schedule-enabled');
const scheduleTimeInput = document.getElementById('schedule-time');
const scheduleTimeGroup = document.getElementById('schedule-time-group');
const scheduleStatusGroup = document.getElementById('schedule-status-group');
const scheduleControls = document.getElementById('schedule-controls');
const nextRunTimeSpan = document.getElementById('next-run-time');
const testScheduledScrapingBtn = document.getElementById('test-scheduled-scraping');
const stopSchedulerBtn = document.getElementById('stop-scheduler');

// Auto-startup functionality
const autoStartupEnabledCheckbox = document.getElementById('auto-startup-enabled');
const autoStartupStatusGroup = document.getElementById('auto-startup-status-group');
const autoStartupStatusText = document.getElementById('auto-startup-status-text');

// Load scheduling settings
async function loadSchedulingSettings() {
  try {
    const settings = await ipcRenderer.invoke('get-app-settings');
    
    // Set schedule enabled checkbox
    scheduleEnabledCheckbox.checked = settings.schedule_enabled || false;
    scheduleTimeInput.value = settings.schedule_time || '15:30';
    
    // Show/hide schedule controls based on enabled state
    toggleScheduleControls(settings.schedule_enabled);
    
    // Load scheduler status
    await loadSchedulerStatus();
    
  } catch (error) {
    console.error('Error loading scheduling settings:', error);
    showStatus('Error loading scheduling settings', 'error');
  }
}

// Toggle schedule controls visibility
function toggleScheduleControls(enabled) {
  if (enabled) {
    scheduleTimeGroup.style.display = 'block';
    scheduleStatusGroup.style.display = 'block';
    scheduleControls.style.display = 'block';
  } else {
    scheduleTimeGroup.style.display = 'none';
    scheduleStatusGroup.style.display = 'none';
    scheduleControls.style.display = 'none';
  }
}

// Load scheduler status
async function loadSchedulerStatus() {
  try {
    const status = await ipcRenderer.invoke('get-scheduler-status');
    
    if (status.isScheduled) {
      if (status.nextRunTime) {
        const nextRun = new Date(status.nextRunTime);
        nextRunTimeSpan.textContent = `Next run: ${nextRun.toLocaleString()}`;
      } else {
        nextRunTimeSpan.textContent = 'Scheduled (time calculating...)';
      }
    } else {
      nextRunTimeSpan.textContent = 'Not scheduled';
    }
    
  } catch (error) {
    console.error('Error loading scheduler status:', error);
    nextRunTimeSpan.textContent = 'Status unavailable';
  }
}

// Schedule enabled checkbox change
scheduleEnabledCheckbox.addEventListener('change', () => {
  toggleScheduleControls(scheduleEnabledCheckbox.checked);
});

// Test scheduled scraping
testScheduledScrapingBtn.addEventListener('click', async () => {
  try {
    showStatus('Testing scheduled scraping...', 'info');
    await ipcRenderer.invoke('test-scheduled-scraping');
    showStatus('Scheduled scraping test completed', 'success');
  } catch (error) {
    console.error('Error testing scheduled scraping:', error);
    showStatus('Error testing scheduled scraping', 'error');
  }
});

// Stop scheduler
stopSchedulerBtn.addEventListener('click', async () => {
  try {
    await ipcRenderer.invoke('stop-scheduler');
    showStatus('Scheduler stopped', 'success');
    await loadSchedulerStatus();
  } catch (error) {
    console.error('Error stopping scheduler:', error);
    showStatus('Error stopping scheduler', 'error');
  }
});

// Auto-startup functionality
async function loadAutoStartupSettings() {
  try {
    // Load current auto-startup status
    const status = await ipcRenderer.invoke('get-auto-startup-status');
    
    if (status.success) {
      autoStartupEnabledCheckbox.checked = status.enabled;
      autoStartupStatusText.textContent = status.enabled ? 'Enabled' : 'Disabled';
      autoStartupStatusGroup.style.display = 'block';
    } else {
      autoStartupStatusText.textContent = 'Status unavailable';
      autoStartupStatusGroup.style.display = 'block';
    }
    
  } catch (error) {
    console.error('Error loading auto-startup settings:', error);
    showStatus('Error loading auto-startup settings', 'error');
  }
}

// Auto-startup checkbox change
autoStartupEnabledCheckbox.addEventListener('change', async () => {
  try {
    const enabled = autoStartupEnabledCheckbox.checked;
    showStatus(`${enabled ? 'Enabling' : 'Disabling'} auto-startup...`, 'info');
    
    const result = await ipcRenderer.invoke('set-auto-startup', enabled);
    
    if (result.success) {
      showStatus(`Auto-startup ${enabled ? 'enabled' : 'disabled'} successfully`, 'success');
      autoStartupStatusText.textContent = enabled ? 'Enabled' : 'Disabled';
    } else {
      showStatus(`Error ${enabled ? 'enabling' : 'disabling'} auto-startup: ${result.error}`, 'error');
      // Revert checkbox state
      autoStartupEnabledCheckbox.checked = !enabled;
    }
    
  } catch (error) {
    console.error('Error setting auto-startup:', error);
    showStatus('Error setting auto-startup', 'error');
    // Revert checkbox state
    autoStartupEnabledCheckbox.checked = !autoStartupEnabledCheckbox.checked;
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadCredentials();
  loadClassSelection();
  loadAppSettings();
  loadSchedulingSettings();
  loadAutoStartupSettings();
});
