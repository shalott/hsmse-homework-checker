# Get assignments from Jupiter via manual login with cookie persistence
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
import json
import datetime

from assignment_utils import (
    log_to_file, parse_assignment_date, create_assignment_object, save_json_data,
    JUPITER_SECRET_FILE, JUPITER_CLASSES_FILE, JUPITER_ASSIGNMENTS_FILE
)

# Constants
CREDENTIALS_FILE = JUPITER_SECRET_FILE
JUPITER_LOGIN_URL = 'https://login.jupitered.com/login/index.php?89583'
CLASSES_CONFIG_FILE = JUPITER_CLASSES_FILE
ASSIGNMENTS_JSON_FILENAME = JUPITER_ASSIGNMENTS_FILE

def load_credentials():
    """Load the saved Jupiter credentials"""
    try:
        if os.path.exists(CREDENTIALS_FILE):
            with open(CREDENTIALS_FILE, 'r') as file:
                return json.load(file)
    except Exception as e:
        log_to_file(f"Error loading credentials: {e}")
    return {}

def save_credentials(credentials):
    """Save the Jupiter credentials"""
    try:
        with open(CREDENTIALS_FILE, 'w') as file:
            json.dump(credentials, file, indent=2)
        log_to_file(f"Credentials saved to {CREDENTIALS_FILE}")
        return True
    except Exception as e:
        log_to_file(f"Error saving credentials: {e}")
        return False

def get_credentials_from_user():
    """Prompt user for Jupiter login credentials"""
    print("\n" + "="*60)
    print("JUPITER CREDENTIALS SETUP")
    print("="*60)
    print("Jupiter requires parent login credentials.")
    print("These will be saved locally in an encrypted file.")
    print()
    
    student_name = input("Enter student's name: ").strip()
    if not student_name:
        print("Student name is required.")
        return None
    
    import getpass
    password = getpass.getpass("Enter parent password: ").strip()
    if not password:
        print("Password is required.")
        return None
    
    credentials = {
        'student_name': student_name,
        'password': password,
        'created': time.time()
    }
    
    return credentials

def jupiter_login_with_credentials(driver, credentials):
    """Login to Jupiter using student name and parent password"""
    try:
        log_to_file("Starting Jupiter credential-based login...")
        
        # Navigate to login page
        driver.get(JUPITER_LOGIN_URL)
        time.sleep(2)
        
        # Click the "Parent" tab
        log_to_file("Clicking Parent tab...")
        parent_tab = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.ID, "tab_parent"))
        )
        parent_tab.click()
        time.sleep(1)
        
        # Enter student name
        log_to_file("Entering student name...")
        student_name_field = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.ID, "text_studid1"))
        )
        student_name_field.clear()
        student_name_field.send_keys(credentials['student_name'])
        
        # Enter password
        log_to_file("Entering password...")
        password_field = driver.find_element(By.ID, "text_password1")
        password_field.clear()
        password_field.send_keys(credentials['password'])
        
        # Click login button
        log_to_file("Clicking login button...")
        login_button = driver.find_element(By.ID, "loginbtn")
        login_button.click()
        
        # Wait for login to complete and check for "To Do" button
        log_to_file("Waiting for login to complete...")
        try:
            WebDriverWait(driver, 15).until(
                EC.presence_of_element_located((By.XPATH, "//div[@class='btn' and contains(text(), 'To Do')]")
            ))
            log_to_file("Login successful - found 'To Do' button")
            return True
        except TimeoutException:
            log_to_file("Login may have failed - 'To Do' button not found")
            return False
            
    except Exception as e:
        log_to_file(f"Error during credential login: {e}")
        return False

def test_jupiter_login(headless: bool = False):
    """Test Jupiter login using credentials.

    headless: if True, run Chrome in headless mode.
    """
    chrome_options = Options()
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    if headless:
        # Use modern headless
        chrome_options.add_argument("--headless=new")
        chrome_options.add_argument("--window-size=1280,800")
    else:
        chrome_options.add_argument("--start-minimized")
    
    driver = webdriver.Chrome(options=chrome_options)
    if not headless:
        try:
            driver.minimize_window()
        except Exception:
            pass
    
    try:
        log_to_file("Starting Jupiter login...")
        
        # Load or get credentials
        credentials = load_credentials()
        
        if not credentials:
            log_to_file("No saved credentials found, prompting user...")
            print("\n*** ACTION REQUIRED IN TERMINAL ***")
            print("Please enter your Jupiter credentials in this terminal window.")
            credentials = get_credentials_from_user()
            
            if not credentials:
                log_to_file("No credentials provided")
                return None
            
            # Save credentials for future use
            if save_credentials(credentials):
                log_to_file("Credentials saved successfully")
                print("✅ Credentials saved for future use.")
        else:
            log_to_file("Using saved credentials")
            print("Using saved credentials...")
        
        # Attempt login
        if jupiter_login_with_credentials(driver, credentials):
            log_to_file("Jupiter login successful!")
            print("✅ Login successful!")
            return driver
        else:
            log_to_file("Jupiter login failed")
            print("❌ Login failed. Please check your credentials.")
            
            print("\n*** ACTION REQUIRED IN TERMINAL ***")
            # Ask if user wants to re-enter credentials
            retry = input("Would you like to re-enter credentials? (y/n): ").lower().strip()
            if retry == 'y':
                new_credentials = get_credentials_from_user()
                if new_credentials and save_credentials(new_credentials):
                    # Try once more with new credentials
                    if jupiter_login_with_credentials(driver, new_credentials):
                        log_to_file("Jupiter login successful with new credentials!")
                        print("✅ Login successful with new credentials!")
                        return driver
            
            return None
        
    except Exception as e:
        log_to_file(f"Error during Jupiter login: {e}")
        print(f"Error: {e}")
        return None

def navigate_to_class(driver, class_info):
    """Navigate to a specific class by clicking on its row"""
    try:
        class_name = class_info['name']
        log_to_file(f"Navigating to class: {class_name}")
        
        # Find the class row by looking for the class name in a div with class "big wrap"
        xpath = f"//tr[@class='hi']//div[@class='big wrap' and text()='{class_name}']"
        
        try:
            # Find the div containing the class name
            class_name_div = WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, xpath))
            )
            
            # Get the parent tr element to click
            class_row = class_name_div.find_element(By.XPATH, "./ancestor::tr[@class='hi']")
            
            log_to_file(f"Found class row for {class_name}, clicking...")
            class_row.click()
            
            # Wait for the page to load
            time.sleep(2)
            log_to_file(f"Successfully navigated to {class_name}")
            return True
            
        except TimeoutException:
            log_to_file(f"Could not find class row for {class_name}")
            return False
            
    except Exception as e:
        log_to_file(f"Error navigating to class {class_info.get('name', 'unknown')}: {e}")
        return False

def scrape_class_assignments(driver, class_name):
    """Scrape assignments from the current class page"""
    try:
        log_to_file(f"Scraping assignments for {class_name}")
        assignments = []
        
        # Use a counter-based approach to avoid stale element issues
        assignment_index = 0
        
        while True:
            try:
                # Find all TR elements that contain the green dot (incomplete assignments)
                assignment_rows = driver.find_elements(
                    By.XPATH, "//tr[td/img[contains(@src, 'dot_green.svg')]]"
                )
                
                # Check if we've processed all assignments
                if assignment_index >= len(assignment_rows):
                    log_to_file(f"Processed all {assignment_index} assignments in {class_name}")
                    break
                
                # Get the current assignment row by index
                row = assignment_rows[assignment_index]
                
                # Extract data from the row
                cells = row.find_elements(By.TAG_NAME, "td")
                
                if len(cells) >= 8:  # Make sure we have enough cells
                    # Extract assignment details
                    due_date = cells[1].text.strip() if len(cells) > 1 else ""
                    assignment_name = cells[2].text.strip() if len(cells) > 2 else ""
                    max_points_text = cells[7].text.strip() if len(cells) > 7 else ""
                    
                    # Parse max points (remove any non-numeric characters)
                    max_points = None
                    if max_points_text:
                        import re
                        points_match = re.search(r'(\d+)', max_points_text)
                        if points_match:
                            max_points = int(points_match.group(1))
                    
                    # Click on the row to get more details
                    log_to_file(f"Clicking on assignment {assignment_index + 1}: {assignment_name}")
                    row.click()
                    time.sleep(1)  # Wait for details page to load
                    
                    # Try to extract description from details page
                    description = ""
                    try:
                        # Look for the div immediately following the "accordion" div
                        accordion_div = driver.find_element(By.ID, "accordion")
                        # Get the next sibling div
                        description_div = accordion_div.find_element(By.XPATH, "./following-sibling::div[1]")
                        
                        # Extract all text content, including nested divs
                        description = description_div.text.strip()
                        
                        # If that doesn't work, try getting innerHTML and cleaning it up
                        if not description:
                            description_html = description_div.get_attribute('innerHTML')
                            if description_html:
                                # Simple HTML tag removal (basic cleanup)
                                import re
                                description = re.sub(r'<[^>]+>', '', description_html).strip()
                                # Clean up extra whitespace
                                description = re.sub(r'\s+', ' ', description)
                                                
                    except Exception as e:
                        log_to_file(f"Could not extract description for {assignment_name}: {e}")
                        description = ""
                    
                    # Final check: if description starts with "To Do", treat as empty
                    if description and re.match(r"^To Do\nMessages", description):
                        description = ""
                    
                    # Go back to the class page by clicking the first "btn" div
                    try:
                        back_button = driver.find_element(By.XPATH, "//div[@class='btn'][1]")
                        back_button.click()
                        time.sleep(1)
                        log_to_file(f"Clicked back button for {assignment_name}")
                    except Exception as e:
                        log_to_file(f"Could not click back button for {assignment_name}: {e}")
                        # Fallback: try browser back as last resort
                        try:
                            driver.back()
                            time.sleep(1)
                        except:
                            pass
                    
                    # Parse the due date using our shared utility
                    parsed_due_date = parse_assignment_date(due_date, is_missing=False)
                    
                    # Create assignment object using shared utility
                    assignment = create_assignment_object(
                        name=assignment_name,
                        class_name=class_name,
                        due_date=due_date,
                        due_date_parsed=parsed_due_date,
                        url="",  # Jupiter doesn't provide direct URLs
                        description=description,
                        max_points=max_points
                    )
                    
                    assignments.append(assignment)
                    log_to_file(f"Extracted assignment {assignment_index + 1}: {assignment_name} (Due: {due_date}, Points: {max_points})")
                else:
                    log_to_file(f"Skipping assignment {assignment_index + 1} - insufficient cells ({len(cells)})")
                
                # Move to next assignment
                assignment_index += 1
                    
            except Exception as e:
                log_to_file(f"Error processing assignment {assignment_index + 1} in {class_name}: {e}")
                # Try to go back if we're stuck on a details page
                try:
                    back_button = driver.find_element(By.XPATH, "//div[@class='btn'][1]")
                    back_button.click()
                    time.sleep(1)
                except:
                    # Fallback to browser back
                    try:
                        driver.back()
                        time.sleep(1)
                    except:
                        pass
                
                # Move to next assignment even if this one failed
                assignment_index += 1
                continue
        
        log_to_file(f"Successfully extracted {len(assignments)} assignments from {class_name}")
        return assignments
        
    except Exception as e:
        log_to_file(f"Error scraping assignments from {class_name}: {e}")
        return []

def load_classes_config():
    """Load the saved class configuration"""
    try:
        if os.path.exists(CLASSES_CONFIG_FILE):
            with open(CLASSES_CONFIG_FILE, 'r') as file:
                return json.load(file)
    except Exception as e:
        log_to_file(f"Error loading class config: {e}")
    return {}

def save_classes_config(config):
    """Save the class configuration"""
    try:
        with open(CLASSES_CONFIG_FILE, 'w') as file:
            json.dump(config, file, indent=2)
        log_to_file(f"Class configuration saved to {CLASSES_CONFIG_FILE}")
        return True
    except Exception as e:
        log_to_file(f"Error saving class config: {e}")
        return False

def click_todo_button(driver):
    """Click the To Do button to navigate to the courses page"""
    try:
        log_to_file("Looking for 'To Do' button...")
        todo_button = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, "//div[@class='btn' and contains(text(), 'To Do')]"))
        )
        
        log_to_file("Clicking 'To Do' button...")
        todo_button.click()
        
        # Wait for page to load
        time.sleep(2)
        log_to_file("Successfully navigated to To Do page")
        return True
        
    except TimeoutException:
        log_to_file("Could not find or click 'To Do' button")
        return False
    except Exception as e:
        log_to_file(f"Error clicking 'To Do' button: {e}")
        return False

def discover_classes(driver):
    """Discover all available classes from the To Do page"""
    try:
        log_to_file("Discovering available classes...")
        
        # Find all class boxes
        class_boxes = driver.find_elements(By.CLASS_NAME, "classbox")
        classes = []
        
        for i, box in enumerate(class_boxes):
            try:
                # Look for the class row within this classbox
                class_rows = box.find_elements(By.XPATH, ".//tr[@class='hi']")
                
                for row in class_rows:
                    try:
                        # Extract class name from the div with class "big wrap"
                        class_name_element = row.find_element(By.XPATH, ".//div[@class='big wrap']")
                        class_name = class_name_element.text.strip()
                        
                        # Extract the click parameters from the tr element
                        click_attr = row.get_attribute('click')
                        if click_attr and 'gogrades' in click_attr:
                            # Extract parameters from gogrades(5667307,4) format
                            match = re.search(r'gogrades\((\d+),(\d+)\)', click_attr)
                            if match:
                                class_id = match.group(1)
                                term_id = match.group(2)
                                
                                classes.append({
                                    'name': class_name,
                                    'class_id': class_id,
                                    'term_id': term_id,
                                    'click_attr': click_attr
                                })
                                log_to_file(f"Found class: {class_name} (ID: {class_id}, Term: {term_id})")
                    except Exception as e:
                        log_to_file(f"Error processing class row in box {i}: {e}")
                        continue
            except Exception as e:
                log_to_file(f"Error processing class box {i}: {e}")
                continue
        
        log_to_file(f"Discovered {len(classes)} classes")
        return classes
        
    except Exception as e:
        log_to_file(f"Error discovering classes: {e}")
        return []

def select_classes_to_scrape(available_classes, existing_config):
    """Allow user to select which classes to scrape"""
    print("\n" + "="*60)
    print("JUPITER CLASS SELECTION")
    print("="*60)
    print("Available classes found:")
    print()
    
    for i, class_info in enumerate(available_classes, 1):
        # Check if this class is already selected
        selected = class_info['name'] in existing_config.get('selected_classes', {})
        status = "[SELECTED]" if selected else "[NOT SELECTED]"
        print(f"{i:2d}. {class_info['name']} {status}")
    
    print()
    print("Enter the numbers of the classes you want to scrape (comma-separated):")
    print("Example: 1,3,5 to select classes 1, 3, and 5")
    print("Or press ENTER to keep current selection")
    print()
    
    while True:
        try:
            user_input = input("Class numbers to scrape: ").strip()
            
            if not user_input:  # Keep existing selection
                if 'selected_classes' in existing_config:
                    print("Keeping existing class selection.")
                    return existing_config
                else:
                    print("No existing selection found. Please select at least one class.")
                    continue
            
            # Parse the input
            selected_numbers = [int(x.strip()) for x in user_input.split(',')]
            
            # Validate numbers
            valid_numbers = []
            for num in selected_numbers:
                if 1 <= num <= len(available_classes):
                    valid_numbers.append(num)
                else:
                    print(f"Warning: {num} is not a valid class number (1-{len(available_classes)})")
            
            if not valid_numbers:
                print("No valid class numbers provided. Please try again.")
                continue
            
            # Build the configuration
            selected_classes = {}
            for num in valid_numbers:
                class_info = available_classes[num - 1]
                selected_classes[class_info['name']] = {
                    'class_id': class_info['class_id'],
                    'term_id': class_info['term_id'],
                    'click_attr': class_info['click_attr']
                }
            
            config = {
                'selected_classes': selected_classes,
                'last_updated': time.time()
            }
            
            print(f"\nSelected {len(selected_classes)} classes:")
            for class_name in selected_classes:
                print(f"  - {class_name}")
            
            return config
            
        except ValueError:
            print("Invalid input. Please enter numbers separated by commas.")
        except KeyboardInterrupt:
            print("\nOperation cancelled.")
            return None

def get_jupiter_assignments(headless: bool = False):
    """Main function to scrape Jupiter assignments

    headless: if True, run Chrome in headless mode.
    """
    print("🚀 Starting Jupiter assignment scraper..." + (" (headless)" if headless else ""))
    log_to_file("=== Jupiter Assignment Scraper Started ===")
    
    driver = test_jupiter_login(headless=headless)
    
    if not driver:
        print("❌ Login test failed. Please check the logs and try again.")
        log_to_file("Login failed, returning empty-handed.", "ERROR")
        return {"assigned": [], "missing": []}
        
    try:
        if not click_todo_button(driver):
            print("❌ Could not navigate to To Do page.")
            return {"assigned": [], "missing": []}

        existing_config = load_classes_config()
        
        if not existing_config or 'selected_classes' not in existing_config:
            print("No class configuration found. Running class discovery...")
            available_classes = discover_classes(driver)
            if not available_classes:
                print("❌ No classes found. Make sure you're on the right page.")
                return {"assigned": [], "missing": []}

            class_config = select_classes_to_scrape(available_classes, {})
            if not class_config:
                print("❌ Class selection cancelled.")
                return {"assigned": [], "missing": []}

            if save_classes_config(class_config):
                print("✅ Class configuration saved successfully!")
                print("Please run the script again to start scraping.")
            else:
                print("⚠️  Could not save class configuration.")
            return {"assigned": [], "missing": []}

        print(f"Using existing configuration with {len(existing_config['selected_classes'])} selected classes:")
        for class_name in existing_config['selected_classes']:
            print(f"  - {class_name}")
        
        all_assignments = []
        for class_name, class_details in existing_config['selected_classes'].items():
            print(f"\n📚 Processing class: {class_name}")
            class_info = {'name': class_name, **class_details}
            
            if navigate_to_class(driver, class_info):
                print(f"✅ Successfully navigated to {class_name}")
                class_assignments = scrape_class_assignments(driver, class_name)
                all_assignments.extend(class_assignments)
                print(f"📋 Found {len(class_assignments)} assignments in {class_name}")
                
                if not click_todo_button(driver):
                    log_to_file(f"Warning: Could not return to To Do page after {class_name}", "WARNING")
            else:
                print(f"❌ Failed to navigate to {class_name}")

        if not all_assignments:
            print("\n📋 No assignments found to save.")
            return {"assigned": [], "missing": []}

        assigned_assignments = []
        missing_assignments = []
        
        for assignment in all_assignments:
            due_date_parsed = assignment.get('due_date_parsed')
            is_missing = False
            if not due_date_parsed:
                is_missing = True
            else:
                try:
                    due_date_obj = datetime.datetime.fromisoformat(due_date_parsed.replace('Z', '+00:00'))
                    current_time = datetime.datetime.now(due_date_obj.tzinfo) if due_date_obj.tzinfo else datetime.datetime.now()
                    if due_date_obj < current_time:
                        is_missing = True
                except Exception as e:
                    log_to_file(f"Error parsing due date for {assignment.get('name', 'unknown')}: {e}", "WARNING")
                    is_missing = True
            
            if is_missing:
                missing_assignments.append(assignment)
            else:
                assigned_assignments.append(assignment)

        assignments_data = {
            'assigned': assigned_assignments,
            'missing': missing_assignments,
        }
        
        if save_json_data(assignments_data, ASSIGNMENTS_JSON_FILENAME):
            print(f"\n✅ Successfully saved {len(all_assignments)} assignments to {ASSIGNMENTS_JSON_FILENAME}")
            print(f"   📋 {len(assigned_assignments)} assigned, {len(missing_assignments)} missing")
        else:
            print(f"\n❌ Failed to save assignments to {ASSIGNMENTS_JSON_FILENAME}")
            
        return assignments_data

    finally:
        log_to_file("=== Jupiter Assignment Scraper Ended ===")
        if driver:
            driver.quit()

if __name__ == '__main__':
    # When invoked directly, run with a visible browser by default
    get_jupiter_assignments(headless=False)