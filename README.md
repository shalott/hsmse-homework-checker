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

### Data Storage

- `data/` - Generated assignment data (JSON files)
- `secrets/` - Saved cookies and credentials (gitignored)
- `index.html` - Web dashboard with embedded data

## Setup & Usage

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
