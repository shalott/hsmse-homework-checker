# Homework Checker

An automated assignment tracker that scrapes assignments from Google Classroom and Jupiter Ed, providing a unified view of all student assignments with due dates, status, and descriptions.

## Features

- **Multi-platform support**: Scrapes both Google Classroom and Jupiter Ed
- **Account management**: Support for multiple Google Classroom accounts
- **Assignment categorization**: Separates assigned vs missing assignments
- **Due date parsing**: Intelligent parsing of various date formats
- **Web interface**: Clean HTML dashboard for viewing assignments
- **Data export**: JSON format for integration with other tools
- **Cookie persistence**: Saves login sessions to minimize re-authentication

## Current Architecture

### Python Backend
- `tools/get_assignments.py` - Main orchestrator script
- `tools/get_google_classroom_assignments.py` - Google Classroom scraper
- `tools/get_jupiter_assignments.py` - Jupiter Ed scraper  
- `tools/assignment_utils.py` - Shared utilities and data models

### Data Storage
- `data/` - Generated assignment data (JSON files)
- `secrets/` - Saved cookies and credentials (gitignored)
- `index.html` - Web dashboard with embedded data

## Setup & Usage

### Prerequisites
- Python 3.7+
- Chrome browser installed
- ChromeDriver (managed automatically by Selenium)

### Installation
1. Clone this repository
2. Install dependencies: `pip install selenium python-dateutil`
3. Run: `python tools/get_assignments.py`

### First Run
- Google Classroom: Interactive account setup and browser login
- Jupiter Ed: Enter parent credentials when prompted
- Data will be saved and browser login sessions cached

## Roadmap

### Phase 1: Desktop Application (In Progress)
- Electron wrapper with embedded browser panel
- Single-window experience with integrated scraping
- Native OS integration (notifications, system tray)
- Bundled Python executable (no user Python installation required)

### Phase 2: Enhanced UX
- Real-time progress updates during scraping
- Assignment filtering and search
- Calendar integration
- Assignment status tracking (completed/pending)

### Phase 3: Mobile/Web Companion
- Read-only mobile web app
- Cloud sync for viewing assignments on mobile
- Push notifications for due dates

## Development

### Current Status
- ✅ Core scraping functionality working
- ✅ Multi-account Google Classroom support
- ✅ Jupiter Ed integration
- ✅ Data consolidation and export
- ✅ Web dashboard
- 🔄 Planning Electron desktop app

### Contributing
This is currently a personal project. If you're interested in contributing or have suggestions, please open an issue.

## Technical Notes

### Google Classroom Scraping
- Uses Selenium with visible Chrome (headless mode blocked by Google)
- Extracts assignments from "Assigned", "Missing", and "Done" tabs
- Handles dynamic content expansion and filtering
- Supports multiple account management

### Jupiter Ed Scraping  
- Parent portal login with student name + password
- Class-based assignment discovery
- Handles assignment details extraction
- Automatic missing assignment detection based on due dates

### Data Format
```json
{
  "assigned": [
    {
      "name": "Assignment Name",
      "class": "Course Name", 
      "due_date": "October 20, 2025",
      "due_date_parsed": "2025-10-20",
      "url": "https://...",
      "description": "Assignment description",
      "max_points": 100
    }
  ],
  "missing": [...],
  "errors": [...]
}
```

## License

Private project - All rights reserved.