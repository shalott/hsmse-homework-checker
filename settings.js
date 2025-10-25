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
const clearCookiesBtn = document.getElementById('clear-google-cookies');

// Show status message
function showStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message status-${type}`;
  statusMessage.classList.remove('hidden');
  
  // Scroll the status message into view
  statusMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
  
  setTimeout(() => {
    statusMessage.classList.add('hidden');
  }, 5000);
}

// Load existing credentials
async function loadCredentials() {
  try {
    const credentials = await ipcRenderer.invoke('get-jupiter-credentials');
    if (credentials) {
      document.getElementById('student-name').value = credentials.student_name || '';
      document.getElementById('password').value = credentials.password || '';
      const loginType = credentials.loginType || 'student';
      document.getElementById(`login-${loginType}`).checked = true;
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
  
  const credentials = {
    student_name: document.getElementById('student-name').value,
    password: document.getElementById('password').value,
    loginType: document.querySelector('input[name="login-type"]:checked').value
  };

  try {
    await ipcRenderer.invoke('save-jupiter-credentials', credentials);
    showStatus('Credentials saved successfully!', 'success');
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
      showStatus('Login test successful! You can now close the browser window.', 'success');
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
      showStatus(`Loaded ${result.classes.length} classes from Jupiter Ed`, 'success');
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

// Save class selection
saveClassesBtn.addEventListener('click', async () => {
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

  try {
    const result = await ipcRenderer.invoke('save-jupiter-config', selectedClasses);
    
    if (result.success) {
      showStatus(`Successfully saved selection for ${Object.keys(selectedClasses).length} classes!`, 'success');
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

// Clear Google cookies
clearCookiesBtn.addEventListener('click', async () => {
  try {
    showStatus('Clearing Google cookies...', 'info');
    await ipcRenderer.invoke('clear-google-cookies');
    showStatus('Google cookies cleared successfully! You are now logged out of all Google accounts.', 'success');
  } catch (error) {
    showStatus(`Error clearing cookies: ${error.message}`, 'error');
  }
});

// Support keyboard shortcuts
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeSettings();
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadCredentials();
  loadClassSelection();
});
