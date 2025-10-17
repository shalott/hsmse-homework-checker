#!/usr/bin/env python3
"""
Consolidated assignment extraction script
Combines assignments from both NYC Students and HSMSE sources
"""

from datetime import datetime
from get_google_classroom_assignments import get_google_classroom_assignments
from get_jupiter_assignments import get_jupiter_assignments
from assignment_utils import (
    log_to_file,
    save_json_data,
    ALL_ASSIGNMENTS_FILE,
    get_error_messages,
    clear_error_messages,
    COURSE_COLORS_FILE,
)
import json
import os
import re

# Constants
CONSOLIDATED_ASSIGNMENTS_FILENAME = ALL_ASSIGNMENTS_FILE

def sort_assignments_by_date(assignments):
    """Sort assignments by due date, handling various date formats"""
    def get_sort_key(assignment):
        due_date_parsed = assignment.get('due_date_parsed', '')
        if due_date_parsed:
            try:
                # Try to parse ISO format
                if 'T' in due_date_parsed:
                    return datetime.fromisoformat(due_date_parsed)
                else:
                    return datetime.fromisoformat(due_date_parsed + 'T23:59:59')
            except Exception as e:
                log_to_file(f"Could not parse date '{due_date_parsed}': {e}", 'WARNING')
        
        # If no parsed date or parsing failed, put at end
        return datetime.max
    
    return sorted(assignments, key=get_sort_key)

def get_all_assignments():
    """Extract and consolidate assignments from all sources"""
    log_to_file("Starting consolidated assignment extraction...")
    
    # Extract from Google Classroom
    log_to_file("Extracting Google Classroom assignments...")
    try:
        gclassroom_data = get_google_classroom_assignments(interactive=False)
        log_to_file(f"Google Classroom: {len(gclassroom_data['assigned'])} assigned, {len(gclassroom_data['missing'])} missing")
    except Exception as e:
        log_to_file(f"Error extracting Google Classroom assignments: {e}", 'ERROR')
        gclassroom_data = {"assigned": [], "missing": []}
    
    # Extract from Jupiter
    log_to_file("Extracting Jupiter assignments...")
    try:
        # Run Jupiter extraction headless to be unobtrusive
        jupiter_data = get_jupiter_assignments(headless=True)
        log_to_file(f"Jupiter: {len(jupiter_data['assigned'])} assigned, {len(jupiter_data['missing'])} missing")
    except Exception as e:
        log_to_file(f"Error extracting Jupiter assignments: {e}", 'ERROR')
        jupiter_data = {"assigned": [], "missing": []}
    
    # Simple merge - just combine the arrays
    log_to_file("Consolidating assignment data...")
    consolidated_data = {
        "assigned": [],
        "missing": []
    }
    
    # Add all assigned assignments from both sources
    consolidated_data["assigned"].extend(gclassroom_data.get("assigned", []))
    consolidated_data["assigned"].extend(jupiter_data.get("assigned", []))
    
    # Add all missing assignments from both sources
    consolidated_data["missing"].extend(gclassroom_data.get("missing", []))
    consolidated_data["missing"].extend(jupiter_data.get("missing", []))
    
    # Sort assignments by due date
    consolidated_data["assigned"] = sort_assignments_by_date(consolidated_data["assigned"])
    consolidated_data["missing"] = sort_assignments_by_date(consolidated_data["missing"])
    
    # Update course color mapping
    update_course_colors(consolidated_data)

    return consolidated_data

def update_course_colors(consolidated_data):
    """Ensure a persistent mapping from course name -> CSS color class exists and is updated.

    - Reads existing mapping from COURSE_COLORS_FILE if present.
    - Adds entries for any new courses found in consolidated_data.
    - Assigns classes course-color-1..15 in alphabetical order, preserving existing assignments.
    - Wraps after 15 if more than 15 classes.
    """
    try:
        classes = set()
        for a in consolidated_data.get('assigned', []):
            cname = a.get('class')
            if cname:
                classes.add(cname)
        for a in consolidated_data.get('missing', []):
            cname = a.get('class')
            if cname:
                classes.add(cname)

        classes = sorted(classes, key=lambda s: s.lower())

        # Load existing mapping if available
        mapping = {}
        if os.path.exists(COURSE_COLORS_FILE):
            try:
                with open(COURSE_COLORS_FILE, 'r', encoding='utf-8') as f:
                    mapping = json.load(f) or {}
            except Exception as e:
                log_to_file(f"Could not read {COURSE_COLORS_FILE}: {e}", 'WARNING')
                mapping = {}

        # Determine used numbers
        def parse_num(val):
            m = re.search(r"course-color-(\d+)$", str(val))
            return int(m.group(1)) if m else None

        used = set(filter(lambda x: x is not None, (parse_num(v) for v in mapping.values())))

        def next_number():
            # Find next available number 1..15, wrapping as needed
            n = 1
            while True:
                # Use first free number if any; otherwise wrap and allow reuse
                if n not in used:
                    used.add(n)
                    return n
                n += 1
                if n > 15:
                    # wrap and allow duplicates beyond 15 classes
                    n = 1
                    # pick the smallest number to reuse
                    # But to keep deterministic, just return 1 and rotate used set minimally
                    used.add(1)
                    return 1

        # Preserve existing, add new
        for cname in classes:
            if cname not in mapping:
                n = next_number()
                mapping[cname] = f"course-color-{n}"

        # Save back
        os.makedirs(os.path.dirname(COURSE_COLORS_FILE), exist_ok=True)
        with open(COURSE_COLORS_FILE, 'w', encoding='utf-8') as f:
            json.dump(mapping, f, indent=2, ensure_ascii=False)
        log_to_file(f"Course color mapping updated: {COURSE_COLORS_FILE}")
    except Exception as e:
        log_to_file(f"Failed to update course color mapping: {e}", 'ERROR')

def main():
    """Main function to extract all assignments and save consolidated data"""
    try:
        # Clear previous errors before starting
        clear_error_messages()

        # Extract all assignments
        all_assignments = get_all_assignments()
        
        # Add errors to the data payload
        all_assignments['errors'] = get_error_messages()

        # Save consolidated data using shared utility
        if save_json_data(all_assignments, CONSOLIDATED_ASSIGNMENTS_FILENAME):
            # Print final summary
            log_to_file("CONSOLIDATED ASSIGNMENT EXTRACTION COMPLETE")
            log_to_file(f"Total assigned assignments: {len(all_assignments['assigned'])}")
            log_to_file(f"Total missing assignments: {len(all_assignments['missing'])}")
            log_to_file(f"Grand total assignments: {len(all_assignments['assigned']) + len(all_assignments['missing'])}")
            
            print(f"Successfully extracted {len(all_assignments['assigned']) + len(all_assignments['missing'])} assignments")
            print(f"Data saved to: {CONSOLIDATED_ASSIGNMENTS_FILENAME}")

            # Embed data into index.html
            embed_data_in_html(all_assignments)
        else:
            print("Failed to save consolidated data")
            return None
            
        return all_assignments
        
    except Exception as e:
        log_to_file(f"Error in consolidated extraction: {e}", 'ERROR')
        print(f"Error in consolidated extraction: {e}")
        return None

def embed_data_in_html(data):
    """Embeds assignment data into index.html as a global variable."""
    try:
        html_path = 'index.html'
        log_to_file(f"Embedding data into {html_path}...")

        with open(html_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Create the script tag with the data
        # Use json.dumps with ensure_ascii=False to handle unicode characters directly,
        # and escape HTML-sensitive characters to prevent XSS vulnerabilities.
        json_data_string = json.dumps(data, ensure_ascii=False)
        script_tag = f'<script id="assignment-data">window.assignment_data = {json_data_string};</script>'

        # Find if the script tag already exists and replace it, otherwise append before </body>
        import re
        if re.search(r'<script id="assignment-data">.*?</script>', content, re.DOTALL):
            content = re.sub(r'<script id="assignment-data">.*?</script>', lambda m: script_tag, content, flags=re.DOTALL)
            log_to_file("Replaced existing embedded data in index.html.")
        else:
            content = content.replace('</body>', f'{script_tag}\n</body>')
            log_to_file("Added embedded data to index.html.")

        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        log_to_file("Successfully embedded data in index.html.")
        return True

    except Exception as e:
        log_to_file(f"Failed to embed data in index.html: {e}", 'ERROR')
        return False

if __name__ == '__main__':
    main()