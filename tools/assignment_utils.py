"""
Shared utilities for assignment extraction scripts
Contains common functions, logging setup, and shared constants
"""

import os
import json
from datetime import datetime, timedelta
from dateutil import parser as dateutil_parser

# --- Constants for File Paths ---

# Directories
DATA_DIR = 'data'
SECRETS_DIR = 'secrets'

# Log file
LOGFILE = 'assignment_extraction.log'

# Data files
ALL_ASSIGNMENTS_FILE = os.path.join(DATA_DIR, 'all_assignments.json')
ALL_GCLASSROOM_ASSIGNMENTS_FILE = os.path.join(DATA_DIR, 'all_gclassroom_assignments.json')
CLASSROOM_ACCOUNTS_FILE = os.path.join(DATA_DIR, 'classroom_accounts.json')
JUPITER_ASSIGNMENTS_FILE = os.path.join(DATA_DIR, 'jupiter_assignments.json')
JUPITER_CLASSES_FILE = os.path.join(DATA_DIR, 'jupiter_classes.json')
COURSE_COLORS_FILE = os.path.join(DATA_DIR, 'course_colors.json')
CLASS_COLORS_FILE = os.path.join(DATA_DIR, 'class_colors.json')

# Secret files
JUPITER_SECRET_FILE = os.path.join(SECRETS_DIR, 'jupiter_secret.json')
GOOGLE_CLASSROOM_COOKIES_FILE = os.path.join(SECRETS_DIR, 'google_classroom_cookies.pkl')
BACKUP_COOKIES_FILE = os.path.join(SECRETS_DIR, 'backup_cookies.pkl')

_error_messages = []

_error_messages = []

def log_to_file(message, level='INFO'):
    """Simple logging function that writes to file with timestamp and collects errors."""
    global _error_messages
    try:
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        log_entry = f"{timestamp} - {level} - {message}\n"
        with open(LOGFILE, 'a', encoding='utf-8') as f:
            f.write(log_entry)
        if level == 'ERROR':
            print(f"ERROR: {message}")
            _error_messages.append(f"{timestamp} - {message}")
    except Exception:
        pass  # Fail silently if logging fails

def get_error_messages():
    """Returns the list of captured error messages."""
    return _error_messages

def clear_error_messages():
    """Clears the list of captured error messages."""
    global _error_messages
    _error_messages = []

def get_error_messages():
    """Returns the list of captured error messages."""
    return _error_messages

def clear_error_messages():
    """Clears the list of captured error messages."""
    global _error_messages
    _error_messages = []

def parse_assignment_date(date_str, is_missing=False):
    """Parse various date formats and return standardized date object or None
    
    Args:
        date_str: The date string to parse
        is_missing: True if this is from missing assignments (interpret weekdays as past), 
                   False if from assigned assignments (interpret weekdays as future)
    """
    if not date_str or date_str in ['', 'Unknown', 'No due date']:
        return None
    
    # Skip non-date strings
    if any(keyword in date_str.lower() for keyword in ['posted', 'no due date', 'unknown']):
        return None
    
    try:
        # Handle relative dates
        today = datetime.now()
        clean_date = date_str.strip()
        
        if 'today' in clean_date.lower():
            return today.strftime('%Y-%m-%d')
        elif 'yesterday' in clean_date.lower():
            return (today - timedelta(days=1)).strftime('%Y-%m-%d')
        elif 'tomorrow' in clean_date.lower():
            return (today + timedelta(days=1)).strftime('%Y-%m-%d')
        
        # Handle weekday names ONLY if no actual date is specified
        # Only apply weekday logic if the string contains ONLY a weekday (plus optional time)
        weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        clean_lower = clean_date.lower()
        
        # Check if this is a weekday-only date (no month names, no numbers that look like dates)
        has_month = any(month in clean_lower for month in [
            'january', 'february', 'march', 'april', 'may', 'june',
            'july', 'august', 'september', 'october', 'november', 'december',
            'jan', 'feb', 'mar', 'apr', 'may', 'jun',
            'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
        ])
        
        # Check for date-like numbers (day/month/year patterns)
        import re
        has_date_numbers = bool(re.search(r'\b\d{1,2}[/\-]\d{1,2}|\b\d{1,2}\s*(st|nd|rd|th)?\s*,|\b\d{4}\b', clean_lower))
        
        # Only apply weekday logic if it's just a weekday (possibly with time)
        if not has_month and not has_date_numbers:
            for weekday in weekdays:
                if weekday in clean_lower:
                    # Find the target weekday
                    target_weekday = weekdays.index(weekday)
                    current_weekday = today.weekday()  # 0=Monday, 6=Sunday
                    
                    if is_missing:
                        # For missing assignments, find the most recent occurrence of this weekday
                        days_ago = (current_weekday - target_weekday) % 7
                        if days_ago == 0:  # If it's the same weekday, assume it was last week
                            days_ago = 7
                        target_date = today - timedelta(days=days_ago)
                    else:
                        # For assigned assignments, find the next occurrence of this weekday
                        days_ahead = (target_weekday - current_weekday) % 7
                        if days_ahead == 0:  # If it's the same weekday, assume it's next week
                            days_ahead = 7
                        target_date = today + timedelta(days=days_ahead)
                    
                    return target_date.strftime('%Y-%m-%d')
        
        # Use dateutil to parse the date
        parsed_date = dateutil_parser.parse(clean_date, default=today)
        return parsed_date.strftime('%Y-%m-%d')
        
    except (ValueError, TypeError) as e:
        log_to_file(f"Could not parse date '{date_str}': {e}", 'WARNING')
        return date_str  # Return original if parsing fails

def create_assignment_object(name, class_name, due_date, due_date_parsed, url, description='', max_points=0):
    """Create standardized assignment object"""
    return {
        'name': name,
        'class': class_name,
        'due_date': due_date,
        'due_date_parsed': due_date_parsed,
        'url': url,
        'description': description,
        'max_points': max_points
    }

def save_json_data(data, filename):
    """Save data to JSON file with error handling"""
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        log_to_file(f"Data saved to {filename}")
        return True
    except Exception as e:
        log_to_file(f"Failed to save data to {filename}: {e}", 'ERROR')
        return False

def load_json_data(filename):
    """Load data from JSON file with error handling"""
    try:
        if not os.path.exists(filename):
            log_to_file(f"File {filename} does not exist", 'WARNING')
            return None
            
        with open(filename, 'r', encoding='utf-8') as f:
            data = json.load(f)
        log_to_file(f"Data loaded from {filename}")
        return data
    except Exception as e:
        log_to_file(f"Failed to load data from {filename}: {e}", 'ERROR')
        return None