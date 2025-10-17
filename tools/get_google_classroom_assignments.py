# Get assignments from Google Classroom via manual login with cookie persistence
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from selenium.webdriver.chrome.options import Options
from selenium import webdriver
import time
import pickle
import os
import re
from assignment_utils import (
    log_to_file, parse_assignment_date, create_assignment_object, save_json_data,
    DATA_DIR, SECRETS_DIR,
    CLASSROOM_ACCOUNTS_FILE, ALL_GCLASSROOM_ASSIGNMENTS_FILE, JUPITER_SECRET_FILE
)

# Constants
COOKIES_BASE_NAME = 'google_classroom_cookies'
ACCOUNTS_CONFIG_FILE = CLASSROOM_ACCOUNTS_FILE
ASSIGNED_URL = 'https://classroom.google.com/u/0/a/not-turned-in/all'
MISSING_URL = 'https://classroom.google.com/u/0/a/missing/all'
# Some missing items show in the "Done" tab with 0 points and "Not turned in"
DONE_URL = 'https://classroom.google.com/u/0/a/turned-in/all'
GOOGLE_CLASSROOM_URL = 'https://classroom.google.com'
ASSIGNMENTS_JSON_BASE_NAME = 'gclassroom_assignments'

# Account Management Functions
def get_cookie_filename(account_name):
    """Generate cookie filename for a specific account"""
    safe_name = re.sub(r'[^\w\-_.]', '_', account_name.lower())
    return os.path.join(SECRETS_DIR, f"{COOKIES_BASE_NAME}_{safe_name}.pkl")

def get_assignments_filename(account_name):
    """Generate assignments JSON filename for a specific account"""
    safe_name = re.sub(r'[^\w\-_.]', '_', account_name.lower())
    return os.path.join(DATA_DIR, f"{ASSIGNMENTS_JSON_BASE_NAME}_{safe_name}.json")

def get_all_assignments_filename():
    """Generate filename for combined assignments from all accounts"""
    return ALL_GCLASSROOM_ASSIGNMENTS_FILE

def load_accounts_config():
    """Load the accounts configuration file"""
    try:
        if os.path.exists(ACCOUNTS_CONFIG_FILE):
            with open(ACCOUNTS_CONFIG_FILE, 'r') as f:
                import json
                return json.load(f)
        return {}
    except Exception as e:
        log_to_file(f"Error loading accounts config: {e}", 'ERROR')
        return {}

def save_accounts_config(accounts):
    """Save the accounts configuration file"""
    try:
        with open(ACCOUNTS_CONFIG_FILE, 'w') as f:
            import json
            json.dump(accounts, f, indent=2)
        return True
    except Exception as e:
        log_to_file(f"Error saving accounts config: {e}", 'ERROR')
        return False

def list_available_accounts():
    """List all available accounts"""
    accounts = load_accounts_config()
    return list(accounts.keys())

def add_account(account_name, description=""):
    """Add a new account to the configuration"""
    accounts = load_accounts_config()
    accounts[account_name] = {
        'description': description,
        'cookie_file': get_cookie_filename(account_name),
        'last_used': None
    }
    save_accounts_config(accounts)
    return accounts[account_name]

def get_account_info(account_name):
    """Get information about a specific account"""
    accounts = load_accounts_config()
    return accounts.get(account_name, None)

def select_account():
    """Interactive account selection"""
    accounts = list_available_accounts()
    
    if not accounts:
        print("No accounts found. Let's add a new account.")
        return create_new_account()
    
    print("\nAvailable accounts:")
    for i, account in enumerate(accounts, 1):
        account_info = get_account_info(account)
        description = account_info.get('description', 'No description')
        print(f"{i}. {account} - {description}")
    
    print(f"{len(accounts) + 1}. ALL ACCOUNTS - Extract from all accounts and combine")
    print(f"{len(accounts) + 2}. Add new account")
    
    while True:
        try:
            choice = input(f"\nSelect account (1-{len(accounts) + 2}): ").strip()
            choice_num = int(choice)
            
            if 1 <= choice_num <= len(accounts):
                selected_account = accounts[choice_num - 1]
                print(f"Selected account: {selected_account}")
                return selected_account
            elif choice_num == len(accounts) + 1:
                print("Selected: Extract from ALL accounts")
                return "ALL_ACCOUNTS"
            elif choice_num == len(accounts) + 2:
                return create_new_account()
            else:
                print("Invalid choice. Please try again.")
        except ValueError:
            print("Please enter a valid number.")

def create_new_account():
    """Create a new account interactively"""
    print("\nCreating new account:")
    
    while True:
        account_name = input("Enter account nickname (e.g., 'nycstudents', 'hsmse'): ").strip()
        if account_name:
            break
        print("Account nickname cannot be empty.")
    
    description = input("Enter description (optional): ").strip()
    
    # Check if account already exists
    if get_account_info(account_name):
        print(f"Account '{account_name}' already exists.")
        return account_name
    
    add_account(account_name, description)
    print(f"Created new account: {account_name}")
    return account_name

def save_cookies(driver, filename):
    """Save cookies to a file"""
    try:
        cookies = driver.get_cookies()
        with open(filename, 'wb') as file:
            pickle.dump(cookies, file)
        log_to_file(f"Cookies saved to {filename}")
    except Exception as e:
        log_to_file(f"Failed to save cookies: {e}", 'ERROR')

def load_cookies(driver, filename):
    """Load cookies from a file"""
    if not os.path.exists(filename):
        return False
        
    try:
        with open(filename, 'rb') as file:
            cookies = pickle.load(file)
        
        # Group cookies by domain
        google_cookies = []
        classroom_cookies = []
        
        for cookie in cookies:
            domain = cookie.get('domain', '')
            if 'classroom.google.com' in domain:
                classroom_cookies.append(cookie)
            elif 'google.com' in domain or 'accounts.google.com' in domain:
                google_cookies.append(cookie)
        
        # Load Google cookies first
        if google_cookies:
            log_to_file("Loading Google domain cookies...")
            driver.get("https://google.com")
            for cookie in google_cookies:
                try:
                    driver.add_cookie(cookie)
                except Exception as e:
                    log_to_file(f"Skipping cookie: {e}", 'WARNING')
        
        # Load Classroom cookies
        if classroom_cookies:
            log_to_file("Loading Classroom domain cookies...")
            driver.get("https://classroom.google.com")
            for cookie in classroom_cookies:
                try:
                    driver.add_cookie(cookie)
                except Exception as e:
                    log_to_file(f"Skipping cookie: {e}", 'WARNING')
        
        log_to_file(f"Cookies loaded from {filename}")
        return True
    except Exception as e:
        log_to_file(f"Failed to load cookies: {e}", 'ERROR')
        return False

def create_classroom_driver():
    """Create and configure Chrome driver for Google Classroom scraping"""
    # Configure Chrome options for stealth (using regular selenium)
    options = Options()
    # Remove headless for now - Google often blocks headless browsers
    # options.add_argument('--headless')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-blink-features=AutomationControlled')
    options.add_argument('--disable-extensions')
    options.add_argument('--disable-plugins')
    options.add_argument('--disable-images')  # Speed up loading
    options.add_argument('--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36')
    options.add_argument('--start-minimized')

    # Add experimental options separately
    prefs = {"profile.default_content_setting_values.notifications": 2}
    options.add_experimental_option("prefs", prefs)

    # Initialize Chrome driver with regular selenium
    driver = webdriver.Chrome(options=options)
    driver.minimize_window()

    # Execute script to remove webdriver property and add stealth features
    driver.execute_script("""
        Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
        Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
        Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
    """)
    
    return driver

def manual_login_and_save_cookies(driver, account_name):
    """
    Open Google Classroom and wait for user to log in manually.
    Handle new tabs that may open during authentication.
    Once logged in, save the cookies for future use.
    """
    log_to_file(f"Starting manual login process for account: {account_name}")
    print("\n" + "="*50)
    print("MANUAL LOGIN REQUIRED")
    print("="*50)
    print(f"Account: {account_name}")
    print("A browser window will open. Please:")
    print("1. Log in to your Google account in the browser.")
    print("2. Ensure you are on the Google Classroom page.")
    print("3. Once you are successfully logged in, return to this terminal.")
    print("\nThis script will save your login session (cookies) so you won't")
    print("have to log in every time. The browser window will be brought")
    print("to the front for this one-time login.")
    print("\nPress Enter in this terminal when you are ready to proceed.")
    print("="*50)
    
    # Get the cookie file for this account
    cookie_file = get_cookie_filename(account_name)
    
    # Navigate to Google Classroom
    driver.get(GOOGLE_CLASSROOM_URL)
    
    # Bring window to front for login
    driver.switch_to.window(driver.current_window_handle)
    
    # Remember the initial window handle
    original_window = driver.current_window_handle
    
    # Wait for user to complete login
    input("\nPress Enter after you have successfully logged in to Google Classroom...")
    
    try:
        # Check all open tabs/windows for a successful login
        all_windows = driver.window_handles
        login_successful = False
        
        for window_handle in all_windows:
            try:
                driver.switch_to.window(window_handle)
                current_url = driver.current_url.lower();
                
                # Check if this window/tab shows a successful login
                if "classroom.google.com" in current_url and not any(indicator in current_url for indicator in ["signin", "login"]):
                    print(f"Found successful login in tab: {current_url}")
                    
                    # Try to verify login with a simple check
                    try:
                        # Look for any element that indicates we're logged in
                        wait = WebDriverWait(driver, 5)
                        # Just check if page has loaded with some basic content
                        wait.until(EC.presence_of_element_located((By.TAG_NAME, "body")))
                        
                        # If we got here, we're likely logged in successfully
                        login_successful = True
                        
                        # Save cookies from this successful tab
                        save_cookies(driver, cookie_file)
                        log_to_file(f"Manual login completed for {account_name} and cookies saved")
                        print(f"Login successful for {account_name}! Cookies saved for future use.")
                        
                        # Update account last used time
                        accounts = load_accounts_config()
                        if account_name in accounts:
                            from datetime import datetime
                            accounts[account_name]['last_used'] = datetime.now().isoformat()
                            save_accounts_config(accounts)
                        
                        # Close any extra tabs, but keep this successful one
                        current_successful_window = driver.current_window_handle
                        for handle in all_windows:
                            if handle != current_successful_window:
                                try:
                                    driver.switch_to.window(handle)
                                    driver.close()
                                except:
                                    pass  # Ignore errors closing tabs
                        
                        # Switch back to the successful tab
                        driver.switch_to.window(current_successful_window)
                        break
                        
                    except TimeoutException:
                        continue  # Try next tab
                        
            except Exception as e:
                log_to_file(f"Error checking window {window_handle}: {e}", 'WARNING')
                continue
        
        if not login_successful:
            print("\nCould not detect successful login in any tab.")
            print("Please make sure you're logged in and try again.")
            
            # Switch back to a Google Classroom tab if possible
            for window_handle in all_windows:
                try:
                    driver.switch_to.window(window_handle)
                    if "classroom.google.com" in driver.current_url.lower():
                        break
                except:
                    continue
            
            return False
        
        return True
        
    except Exception as e:
        log_to_file(f"Error during manual login verification for {account_name}: {e}", 'ERROR')
        print(f"Error verifying login: {e}")
        return False

def are_cookies_valid(driver):
    """
    Test if the current cookies are still valid by trying to access Google Classroom.
    Handle multiple tabs that may open during the process.
    Returns True if cookies appear valid, False if clearly invalid.
    """
    try:
        log_to_file("Validating existing cookies...")
        
        # Remember the original window
        original_windows = driver.window_handles
        
        # Try to access Google Classroom
        driver.get(GOOGLE_CLASSROOM_URL)
        
        # Wait a moment for page to load and any new tabs to open
        time.sleep(3)
        
        # Check all open windows/tabs for successful login
        all_windows = driver.window_handles
        
        for window_handle in all_windows:
            try:
                driver.switch_to.window(window_handle)
                current_url = driver.current_url.lower()
                
                # If we're on a clear login page, cookies are invalid
                if any(indicator in current_url for indicator in ["signin", "login", "accounts.google.com/signin"]):
                    log_to_file("Cookies are invalid - found login page")
                    return False
                
                # If we're on classroom.google.com and not a login page, probably valid
                if "classroom.google.com" in current_url and not any(indicator in current_url for indicator in ["signin", "login"]):
                    log_to_file("Cookies appear valid - found Google Classroom")
                    return True
                    
            except Exception as e:
                log_to_file(f"Error checking window {window_handle}: {e}", 'WARNING')
                continue
        
        # If we didn't find clear success or failure, assume valid
        log_to_file("Cookie validation inconclusive - assuming valid")
        return True
        
    except Exception as e:
        # Network errors, connection issues, etc. - assume cookies might be valid
        log_to_file(f"Cookie validation failed due to error (assuming valid): {e}", 'WARNING')
        return True  # Better to proceed than block on network errors

def navigate_to_url(driver, url):
    """Navigate to a specific URL and wait for it to load"""
    try:
        driver.get(url)
        
        # Wait for the page to load
        wait = WebDriverWait(driver, 10)
        wait.until(EC.presence_of_element_located((By.TAG_NAME, "body")))
        time.sleep(2)  # Additional wait for dynamic content
        
        # Re-minimize the window since driver.get() can bring it to front
        # driver.minimize_window()
        
        log_to_file(f"Successfully navigated to: {url}")
        return True
    except TimeoutException:
        log_to_file(f"Failed to load page: {url}", 'ERROR')
        return False

# Note: parse_due_date_with_dateutil is now handled by shared parse_assignment_date in assignment_utils

def extract_assignment_details(driver, assignment_url):
    """Extract detailed information from an assignment's details page"""
    description = ''
    max_points = 0
    due_date_text = ''
    
    try:
        log_to_file(f"Visiting details page: {assignment_url}")
        if not navigate_to_url(driver, assignment_url):
            log_to_file(f"Failed to navigate to assignment URL: {assignment_url}", 'ERROR')
            return description, max_points, due_date_text
        
        # Extract description from div with guided_help_id starting with "assignmentInstructions"
        try:
            description_div = driver.find_element(By.CSS_SELECTOR, "div[guidedhelpid*='assignmentInstructions']")
            description_span = description_div.find_element(By.TAG_NAME, "span")
            description = description_span.text.strip()
            log_to_file(f"Found description: {description[:100]}{'...' if len(description) > 100 else ''}")
        except NoSuchElementException:
            log_to_file("No description found", 'WARNING')
        except Exception as e:
            log_to_file(f"Error extracting description: {e}", 'WARNING')
        
        # Extract max points from text containing "[number] points"
        try:
            # Look for any element containing text that matches the pattern "[number] points"
            points_elements = driver.find_elements(By.XPATH, "//*[contains(text(), 'points') or contains(text(), 'Points')]")
            
            for element in points_elements:
                text = element.text.strip()
                # Use regex to find pattern like "100 points" or "50 Points"
                points_match = re.search(r'(\d+)\s+[Pp]oints', text)
                if points_match:
                    max_points = int(points_match.group(1))
                    log_to_file(f"Found max points: {max_points}")
                    break
            
            if max_points == 0:
                log_to_file("No points information found", 'WARNING')
                
        except Exception as e:
            log_to_file(f"Error extracting max points: {e}", 'WARNING')
        
        # Extract due date from main content area
        try:
            main_text = ""
            
            # Try multiple strategies to get the main content
            try:
                # Strategy 1: Look for the first div with role="main"
                main_div = driver.find_element(By.XPATH, "(//div[@role='main'])[1]")
                main_text = main_div.text
                log_to_file("Found main content using first role='main' div")
            except NoSuchElementException:
                try:
                    # Strategy 2: Get all text from body and search for Due pattern
                    body_element = driver.find_element(By.TAG_NAME, "body")
                    main_text = body_element.text
                    log_to_file("Using body text as fallback for due date extraction")
                except NoSuchElementException:
                    # Strategy 3: Search for any element containing "Due"
                    due_elements = driver.find_elements(By.XPATH, "//*[contains(text(), 'Due') or contains(text(), 'due')]")
                    if due_elements:
                        main_text = " ".join([elem.text for elem in due_elements])
                        log_to_file("Found due date using text search fallback")
                    else:
                        log_to_file("Could not find any content containing due date", 'WARNING')
            
            # Look for "Due" pattern in the text
            if main_text:
                due_match = re.search(r'Due\s*([^,\n]+)(?:,\s*([^,\n]+))?', main_text, re.IGNORECASE)
                if due_match:
                    date_part = due_match.group(1).strip()
                    time_part = due_match.group(2).strip() if due_match.group(2) else ''
                    
                    # Check if date_part is actually just a time (implies today)
                    time_only_pattern = r'^\d{1,2}:\d{2}\s*(AM|PM)$'
                    if re.match(time_only_pattern, date_part, re.IGNORECASE):
                        # It's just a time, so it means today
                        from datetime import datetime
                        today = datetime.now().strftime('%B %d')  # e.g., "October 16"
                        due_date_text = f"{today}, {date_part}"
                        log_to_file(f"Found time-only due date, assuming today: {due_date_text}")
                    else:
                        # Normal date format
                        due_date_text = f"{date_part}{', ' + time_part if time_part else ''}"
                        log_to_file(f"Found due date on details page: {due_date_text}")
                else:
                    log_to_file("No due date found on details page", 'WARNING')
            else:
                log_to_file("No content text available for due date extraction", 'WARNING')
                
        except Exception as e:
            log_to_file(f"Error extracting due date: {e}", 'WARNING')
        
    except Exception as e:
        log_to_file(f"Error visiting assignment details page: {e}", 'ERROR')
    
    return description, max_points, due_date_text

def extract_assignments_from_current_tab(driver, is_missing=False, done_but_missing=False):
    """Extract assignments from the currently loaded tab using JavaScript"""
    assignments = []
    try:
        # Wait for page to load
        time.sleep(3)
        
        # Use JavaScript to find ALL <a> elements and extract structured data
        js_code = """
        // Enhanced extraction to handle multiple DOM structures
        var allLinks = document.querySelectorAll('a');
        var assignmentLinks = [];
        var filterDoneMissing = arguments[0];
        
        for (var i = 0; i < allLinks.length; i++) {
            var link = allLinks[i];
            var href = link.href;
            
            if (href && href.endsWith('details')) {
                // Find all <p> tags within this link (including nested ones)
                var pTags = link.querySelectorAll('p');
                
                var assignmentName = '';
                var className = '';
                
                if (pTags.length >= 2) {
                    // Extract assignment name and class name from first two p tags
                    assignmentName = pTags[0].textContent || pTags[0].innerText || '';
                    className = pTags[1].textContent || pTags[1].innerText || '';
                }
                
                // Clean up the text
                assignmentName = assignmentName.trim();
                className = className.trim();
                
                // Create full URL if it's relative
                var fullHref = href.startsWith('http') ? href : window.location.origin + href;
                
                // If filtering for done missing, check for status indicators
                var shouldInclude = true;
                if (filterDoneMissing) {
                    // Look for the <li> element that contains this specific link, or try parent's li
                    var container = link.closest('li');
                    var containerText = '';
                    
                    // Get all text content with proper spacing where tags were removed
                    if (container) {
                        // Get HTML and replace tags with spaces, then clean up
                        var html = container.innerHTML || '';
                        // Replace opening and closing tags with spaces
                        containerText = html.replace(/<[^>]*>/g, ' ');
                        // Clean up multiple spaces
                        containerText = containerText.replace(/\\s+/g, ' ').trim().toLowerCase();
                    }
                    
                    // Check for status indicators - look for multiple patterns
                    var hasNotTurnedIn = containerText.includes('not turned in') || 
                                       containerText.includes('Not turned in') ||
                                       containerText.includes('NOT TURNED IN');
                    var hasMissing = containerText.includes('missing') ||
                                   containerText.includes('Missing') ||
                                   containerText.includes('MISSING');
                    var hasZeroPoints = /\\b0\\s*\\//.test(containerText);
                    shouldInclude = hasNotTurnedIn || hasMissing || hasZeroPoints;
                }
                
                if (shouldInclude) {
                    var finalAssignmentName = assignmentName;
                    var finalClassName = className;
                    
                    // If no assignment name was extracted but we should include it, try fallback
                    if (!finalAssignmentName) {
                        var text = link.textContent || link.innerText || '';
                        text = text.trim();
                        if (text) {
                            finalAssignmentName = text.split('\\n')[0] || 'Unknown Assignment';
                            if (!finalClassName) {
                                finalClassName = 'Unknown';
                            }
                        }
                    }
                    
                    if (finalAssignmentName) {
                        assignmentLinks.push({
                            assignmentName: finalAssignmentName,
                            className: finalClassName,
                            fullUrl: fullHref
                        });
                    }
                } else if (!filterDoneMissing && !assignmentName) {
                    // Last resort fallback (only for non-filtered cases)
                    var text = link.textContent || link.innerText || '';
                    text = text.trim();
                    
                    if (text) {
                        assignmentLinks.push({
                            assignmentName: text.split('\\n')[0] || 'Unknown Assignment',
                            className: 'Unknown',
                            fullUrl: fullHref
                        });
                    }
                }
            }
        }
        
        return assignmentLinks;
        """
        
        result = driver.execute_script(js_code, done_but_missing)
        
        # Get the assignment data directly
        assignment_data = result
        
        print(f"Found {len(assignment_data)} assignment links ending with 'details' (including hidden ones)")
        
        for i, assignment in enumerate(assignment_data):
            try:
                # Extract name and class from the list page only
                assignment_name = assignment['assignmentName']
                class_name = assignment['className']
                full_url = assignment['fullUrl']
                
                # Extract detailed information (including due date) from the assignment's details page
                log_to_file(f"Processing assignment {i+1}: {assignment_name}")
                description, max_points, due_date_text = extract_assignment_details(driver, full_url)
                
                # Parse the due date using shared utility
                due_date_parsed = parse_assignment_date(due_date_text, is_missing)
                
                # Create structured assignment object using shared utility
                assignment_obj = create_assignment_object(
                    name=assignment_name,
                    class_name=class_name,
                    due_date=due_date_text,
                    due_date_parsed=due_date_parsed,
                    url=full_url,
                    description=description,
                    max_points=max_points
                )
                
                assignments.append(assignment_obj)
                log_to_file(f"Added assignment: {assignment_name} - {class_name}")
                    
            except Exception as e:
                print(f"Error processing assignment {i+1}: {e}")
                
    except Exception as e:
        print(f"Error finding assignment links: {e}")
        
    return assignments

def handle_missing_page_expansion(driver):
    """Handle expanding hidden content on the missing assignments page"""
    try:
        # Look for button with aria-label starting with "Earlier"
        print("Looking for 'Earlier' button...")
        earlier_buttons = driver.find_elements(By.XPATH, "//button[starts-with(@aria-label, 'Earlier')]")
        
        if earlier_buttons:
            print(f"Found {len(earlier_buttons)} 'Earlier' button(s)")
            for i, button in enumerate(earlier_buttons):
                try:
                    aria_label = button.get_attribute('aria-label')
                    print(f"  Clicking 'Earlier' button {i+1}: {aria_label}")
                    driver.execute_script("arguments[0].click();", button)
                    time.sleep(2)  # Wait for content to expand
                except Exception as e:
                    print(f"  Error clicking 'Earlier' button {i+1}: {e}")
        else:
            print("No 'Earlier' buttons found")
        
        # Look for "View All" button (it's a button containing a span with "View all" text)
        print("Looking for 'View All' button...")
        view_all_spans = driver.find_elements(By.XPATH, "//span[contains(text(), 'View all')]")
        
        if view_all_spans:
            print(f"Found {len(view_all_spans)} 'View all' span(s)")
            for i, span in enumerate(view_all_spans):
                try:
                    # Find the button that contains this span
                    button = span.find_element(By.XPATH, "./ancestor::button")
                    if button:
                        span_text = span.text
                        print(f"  Clicking 'View All' button {i+1} (span text: '{span_text}')")
                        driver.execute_script("arguments[0].click();", button)
                        time.sleep(2)  # Wait for additional content to load
                    else:
                        print(f"  No button found containing span {i+1}")
                except Exception as e:
                    print(f"  Error clicking 'View All' button {i+1}: {e}")
        else:
            print("No 'View All' spans found")
            
        # Additional wait for all content to be fully loaded
        time.sleep(2)
        
    except Exception as e:
        print(f"Error handling missing page special elements: {e}")

def extract_assigned_assignments(driver):
    """Extract assignments from the assigned tab"""
    print("\n=== EXTRACTING ASSIGNED ASSIGNMENTS ===")
    
    if not navigate_to_url(driver, ASSIGNED_URL):
        print("Failed to navigate to assigned assignments page")
        return []
    
    return extract_assignments_from_current_tab(driver, is_missing=False)

def extract_missing_assignments(driver):
    """Extract assignments from the missing tab with special handling"""
    print("\n=== EXTRACTING MISSING ASSIGNMENTS ===")
    
    if not navigate_to_url(driver, MISSING_URL):
        print("Failed to navigate to missing assignments page")
        return []
    
    # Handle special expansion needs for missing page
    handle_missing_page_expansion(driver)
    
    # Extract assignments after expansion
    return extract_assignments_from_current_tab(driver, is_missing=True)

def extract_missing_from_done(driver):
    """Extract missing assignments from the Done tab that have 0 points and 'Not turned in'"""
    print("\n=== EXTRACTING MISSING FROM DONE TAB ===")
    
    if not navigate_to_url(driver, DONE_URL):
        print("Failed to navigate to done assignments page")
        return []
    
    # Handle special expansion needs for done page
    handle_missing_page_expansion(driver)
    
    # Extract assignments after expansion, filtering for missing ones
    return extract_assignments_from_current_tab(driver, is_missing=True, done_but_missing=True)


def extract_all_assignments(driver):
    """Extract assignments from both assigned and missing tabs"""
    assignments_data = {
        "assigned": [],
        "missing": []
    }
    
    try:
        # Extract assigned assignments
        assignments_data["assigned"] = extract_assigned_assignments(driver)
        print(f"\nFound {len(assignments_data['assigned'])} assigned assignments")
        
        # Extract missing assignments
        assignments_data["missing"] = extract_missing_assignments(driver)
        print(f"\nFound {len(assignments_data['missing'])} missing assignments")

        # Additionally, look in the Done tab for 0-point 'Not turned in' items
        done_missing = extract_missing_from_done(driver)
        if done_missing:
            # Deduplicate by URL or name+class combination
            seen_keys = set()
            for assignment in assignments_data["missing"]:
                url_key = assignment.get('url', '')
                name_class_key = f"{assignment.get('name', '')}::{assignment.get('class', '')}"
                seen_keys.add(url_key)
                seen_keys.add(name_class_key)
            
            new_missing = []
            for assignment in done_missing:
                url_key = assignment.get('url', '')
                name_class_key = f"{assignment.get('name', '')}::{assignment.get('class', '')}"
                if url_key not in seen_keys and name_class_key not in seen_keys:
                    new_missing.append(assignment)
                    seen_keys.add(url_key)
                    seen_keys.add(name_class_key)
            
            assignments_data["missing"].extend(new_missing)
            print(f"Added {len(new_missing)} additional missing assignments from Done tab")
        
    except Exception as e:
        print(f"Error extracting assignment data: {e}")
    
    return assignments_data

def extract_from_single_account(account_name):
    """Extract assignments from a single account"""
    driver = None
    try:
        log_to_file(f"Extracting assignments from account: {account_name}")
        print(f"\n--- Processing account: {account_name} ---")
        
        account_info = get_account_info(account_name)
        if not account_info:
            print(f"Account {account_name} not found in configuration")
            return {"assigned": [], "missing": []}
        
        cookie_file = account_info['cookie_file']
        
        # Create driver
        driver = create_classroom_driver()
        
        # Try to load cookies
        cookies_loaded = load_cookies(driver, cookie_file)
        login_successful = False
        
        if cookies_loaded:
            print(f"Testing saved cookies for {account_name}...")
            
            try:
                if are_cookies_valid(driver):
                    print(f"Cookies valid for {account_name}")
                    login_successful = True
                else:
                    print(f"Cookies expired for {account_name} - manual login required")
                    login_successful = manual_login_and_save_cookies(driver, account_name)
            except Exception as e:
                print(f"Cookie validation issues for {account_name}: {e}")
                login_successful = manual_login_and_save_cookies(driver, account_name)
        else:
            print(f"No saved cookies for {account_name} - manual login required")
            login_successful = manual_login_and_save_cookies(driver, account_name)
        
        if login_successful:
            assignments_data = extract_all_assignments(driver)
            
            # Add account information to each assignment
            for assignment in assignments_data["assigned"]:
                assignment["account"] = account_name
            for assignment in assignments_data["missing"]:
                assignment["account"] = account_name
            
            print(f"Extracted {len(assignments_data['assigned'])} assigned and {len(assignments_data['missing'])} missing assignments from {account_name}")
            return assignments_data
        else:
            print(f"Failed to login to {account_name}")
            return {"assigned": [], "missing": []}
            
    except Exception as e:
        log_to_file(f"Error extracting from account {account_name}: {e}", 'ERROR')
        print(f"Error extracting from account {account_name}: {e}")
        return {"assigned": [], "missing": []}
    finally:
        if driver:
            driver.quit()

def extract_from_all_accounts():
    """Extract assignments from all configured accounts and combine them"""
    log_to_file("Starting extraction from all accounts")
    print("\n" + "="*50)
    print("EXTRACTING FROM ALL ACCOUNTS")
    print("="*50)
    
    accounts = list_available_accounts()
    if not accounts:
        print("No accounts configured!")
        return {"assigned": [], "missing": []}
    
    combined_data = {"assigned": [], "missing": []}
    
    for account_name in accounts:
        account_data = extract_from_single_account(account_name)
        combined_data["assigned"].extend(account_data["assigned"])
        combined_data["missing"].extend(account_data["missing"])
    
    # Save combined data
    combined_filename = get_all_assignments_filename()
    if save_json_data(combined_data, combined_filename):
        print(f"\nCombined assignment data saved to {combined_filename}")
        print(f"Total: {len(combined_data['assigned'])} assigned, {len(combined_data['missing'])} missing assignments across all accounts")
    
    return combined_data

def get_google_classroom_assignments(interactive=True):
    """Main function to extract assignments from Google Classroom - returns assignments data dict"""
    driver = None
    try:
        log_to_file("Starting Google Classroom scraper...")

        if not interactive:
            log_to_file("Non-interactive mode: extracting from all accounts.")
            print("Extracting from all Google Classroom accounts...")
            return extract_from_all_accounts()
        
        # Step 1: Account selection
        print("\n" + "="*50)
        print("GOOGLE CLASSROOM ACCOUNT SELECTION")
        print("="*50)
        
        selected_account = select_account()
        
        # Check if user selected all accounts
        if selected_account == "ALL_ACCOUNTS":
            return extract_from_all_accounts()
        
        # Single account processing
        account_info = get_account_info(selected_account)
        if not account_info:
            print(f"Error: Account {selected_account} not found in configuration")
            return {"assigned": [], "missing": []}
        
        cookie_file = account_info['cookie_file']
        assignments_filename = get_assignments_filename(selected_account)
        
        print(f"Using account: {selected_account}")
        
        # Create driver
        driver = create_classroom_driver()
        
        # Step 2: Try to use saved cookies first
        print("Checking for saved login cookies...")
        
        cookies_loaded = load_cookies(driver, cookie_file)
        login_successful = False
        
        if cookies_loaded:
            print("Saved cookies found. Testing if they're still valid...")
            
            try:
                # Test if cookies are still valid
                if are_cookies_valid(driver):
                    print("Cookies appear valid! Proceeding with extraction.")
                    login_successful = True
                else:
                    print("Cookies appear expired or invalid. Will need manual login.")
                    cookies_loaded = False
            except Exception as e:
                print(f"Cookie validation had issues: {e}")
                print("Proceeding anyway - if login fails, manual login will be triggered.")
                login_successful = True  # Optimistically proceed
        
        # Step 3: If no valid cookies, do manual login
        if not cookies_loaded or not login_successful:
            print(f"Manual login required for account: {selected_account}")
            login_successful = manual_login_and_save_cookies(driver, selected_account)
        
        # Step 3: Extract assignments if login was successful
        if login_successful:
            print("Login successful! Extracting assignment data...")
            
            # Extract assignment data from both tabs
            assignments_data = extract_all_assignments(driver)
            
            # Save to account-specific file
            if save_json_data(assignments_data, assignments_filename):
                print(f"Assignment data saved to {assignments_filename}")
            
            print("\n" + "=" * 50)
            print(f"ASSIGNMENT EXTRACTION COMPLETE - {selected_account}")
            print("=" * 50)
            print(f"Assigned assignments: {len(assignments_data['assigned'])}")
            print(f"Missing assignments: {len(assignments_data['missing'])}")
            print(f"Total assignments: {len(assignments_data['assigned']) + len(assignments_data['missing'])}")
            
            return assignments_data
            
        else:
            print("Failed to login - please try again")
            return {"assigned": [], "missing": []}
            
    except Exception as e:
        print(f"An error occurred in NYC Students extraction: {e}")
        return {"assigned": [], "missing": []}
        
    finally:
        if driver:
            print("Closing NYC Students browser...")
            driver.quit()

if __name__ == '__main__':
    # Run the extraction when script is run directly
    # Data will be saved automatically by the main function
    assignments_data = get_google_classroom_assignments(interactive=True)
    
    if assignments_data and (assignments_data['assigned'] or assignments_data['missing']):
        print("Extraction completed successfully!")
    else:
        print("No assignments extracted or extraction failed.")