# Homework Checker

I have cobbled this together after finding it impossible to keep track of all the different sites where homework assignments are being posted for my kid at HSMSE, and I'm sharing it mostly for the help of other students and parents at the same school. It might possibly by useful for some other NYC public schools? It is a massive kludge that relies on scraping Google Classroom and Jupiter Ed with only student-level access, and will probably break if you look at it funny. 

This is a desktop tool that is written in node and based on Electron. It works on Mac (both M and Intel). It might work on Windows, who knows! All the data and all authentication lives only on your own local machine and nothing you enter gets uploaded anywhere else unless you do it yourself manually (don't). 

There's a very basic help file and logs that might help you if something goes wrong. Zero support is offered, no warrantability, no guarantees, this probably isn't even fit for its actual purpose, etc. 

Pull requests are welcome if you want something fixed or to add a different site, and if you want to be a maintainer you're super welcome, just drop me a line. 

## Setup & Usage

### Install 

If you're an actual end user, you would download one of the UNSIGNED releases and run it on your system. Because the app is unsigned, you will be warned that it is evil and horrible and is going to destroy your machine. It won't, but you will have to mess around with settings to get your system to let you. 

#### Mac (as of Tahoe)
- Run the app
- Be told you can't. Close the window (don't delete the app)
- Quickly go to Security in System Settings and scroll until you see a button offering to let you "Open Anyway"
- Now it will work! If this doesn't work you need to google how to run unsigned apps on your system.

#### Windows
- I don't know for sure, but I think you'll be asked to let it run anyway and can just choose to do so. 

### Operation

1. Click "Update Assignments" to begin the process (it will take a while)
2. Look at the Help menu if you're confused 
3. Hopefully you will see assignments in the calendar 

# Technical Details 

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

### Installation & Running In Development

This is only if you've installed the source code itself

```bash
npm install
npm start
```

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

## License

This has been slapped together fast with a lot of help from my pals Claude, Gemini, and GPT, so I don't recommend relying on it for anything other than MAYBE what I've designed it for, and it will break the next time Google Classroom changes their layout. Consider it under the GPL 3 if you like. 
