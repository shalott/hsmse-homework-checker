# Homework Checker

An Electron-based automated assignment tracker that scrapes assignments from Google Classroom and Jupiter Ed, providing a unified desktop application with integrated browser views, comprehensive logging, and robust pre-scraping validation.

## Features

- **Unified Desktop Application**: Electron-based GUI with dual-view system (assignments/scraping)
- **Multi-platform Support**: Scrapes Google Classroom (multiple accounts) and Jupiter Ed
- **Pre-scraping Validation**: Comprehensive checks for credentials, configuration, and directories before scraping
- **Interactive Browser Views**: Embedded browser for handling authentication and scraping workflows
- **Real-time Logging**: Dual logging system with in-app display and file output for debugging
- **Assignment Calendar**: Visual calendar interface showing due dates and assignment distribution
- **Smart Categorization**: Separates assigned, missing, and completed assignments with intelligent parsing
- **Secure Credential Management**: Encrypted storage of login credentials with validation
- **Auto-switching Views**: Seamless transitions between assignment viewing and scraping operations

## Current Architecture

### Core Components

- **Main Process** (`main.js`): Electron main process handling window management, IPC, and workflow coordination
- **Renderer Process** (`core/renderer.js`): UI event handling, view management, and assignment display
- **Pre-scraping Validation** (`core/pre-scraping-checks.js`): Comprehensive validation system ensuring all requirements met before scraping
- **Assignment Tracker** (`core/assignment-tracker.js`): Calendar rendering, assignment management, and statistics
- **Logger System** (`core/logger.js`): Dual-output logging (UI + file) with structured message types

### Access Modules

- **Jupiter Access** (`access/jupiter-access.js`): Jupiter Ed authentication and credential management
- **Google Access** (`access/google-access.js`): Google Classroom authentication for multiple accounts

### Scrapers

- **Google Scrapers** (`scrapers/`): Dedicated scrapers for Google Classroom accounts
- **Jupiter Scraper** (`scrapers/jupiter-scraper.js`): Jupiter Ed assignment extraction
- **NYCSTUD Integration** (`get_nycstud_assignments.py`): Python-based DOE student portal scraper

### Data Storage

- `data/` - Assignment data, temporary files, and application logs
- `secrets/` - Encrypted credentials and authentication tokens (gitignored)
- `config/` - Application configuration and preferences

## Workflow

1. **Pre-scraping Validation**: Validates credentials, configuration, and directories
2. **Sequential Scraping**: Google Classroom (account 1) → Google Classroom (account 2) → Jupiter Ed
3. **Data Integration**: Merges assignments from all sources with deduplication
4. **UI Updates**: Auto-switches to assignments view with calendar and statistics
5. **Logging**: Comprehensive logging to both UI and `data/temp/app.log`

## Setup & Usage

### Installation

```bash
npm install
npm start
```

### Operation

1. Click "Update Assignments" to begin the process
2. System runs pre-scraping checks and prompts for any missing credentials
3. Automatically switches to scraping view to show browser activity
4. Sequential scraping of all platforms with real-time logging
5. Auto-switches to assignments view showing results in calendar format

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
      "max_points": 100,
      "source": "google_classroom" | "jupiter" | "nycstud"
    }
  ],
  "missing": [...],
  "completed": [...],
  "errors": [...]
}
```

## Development Status

- ✅ **Core Infrastructure**: Electron app with dual-view system
- ✅ **Pre-scraping Validation**: Comprehensive validation before scraping
- ✅ **Google Classroom**: Multi-account scraping with authentication
- ✅ **Jupiter Ed**: Full integration with credential management
- ✅ **Logging System**: Dual-output logging with file persistence
- ✅ **Assignment Calendar**: Visual calendar with statistics
- 🔄 **NYCSTUD Integration**: Python scraper integration (partial)

## License

Private project - All rights reserved.
