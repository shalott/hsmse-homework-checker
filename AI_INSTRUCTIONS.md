# AI Assistant Instructions for Homework Checker Project

## App Management Policy

**DO NOT automatically start or kill the Electron app.**

- **NO `npm start`** - The user will start the app manually when ready
- **NO `pkill -f "electron ."`** - The user will stop the app manually when needed
- **NO background process management** - Let the user control when to run tests

## When User Wants to Test Changes

Instead of running the app automatically:

1. **Inform the user** that changes have been made
2. **Suggest** they can test by running `npm start` if they want to
3. **Explain** what the changes should accomplish
4. **Let them decide** when and how to test

## Appropriate Actions

✅ **DO:**

- Make code changes
- Read and analyze files
- Debug issues through code inspection
- Create test files or utilities if requested
- Explain what changes will do when tested

❌ **DON'T:**

- Automatically start the app with `npm start`
- Kill running processes with `pkill`
- Run background processes without explicit user request
- Assume the user wants immediate testing

## Exception

Only use `npm start` or process management if the user **explicitly requests** it in their message (e.g., "please start the app" or "kill the current process").

## Code Standards and Best Practices

**Module Loading:**

- Always use `app-module-path` and absolute paths for imports
- Add `require('app-module-path').addPath(__dirname)` (main process) or `require('app-module-path').addPath(require('path').resolve(__dirname, '..'))` (renderer process)
- Use `require('core/logger')` instead of `require('../core/logger')`

- ALWAYS use proper Promise-based waits

**File Paths and Constants:**

- Never hardcode pathnames and filenames in code
- Always put file paths in `config/constants.js` and import from there
- Use constants like `DATA_DIR`, `SECRETS_DIR`, etc. for all file operations

**Logging:**

- Always use the logger system and `logToRenderer` for user-facing messages
- Never use `console.log` for user communication
- Use appropriate log types: 'info', 'success', 'warn', 'error', 'instruction'

**Code Organization:**

- Always keep CSS in `.css` stylesheets
- Always keep JavaScript in `.js` files
- Always use clean semantic HTML5 in HTML files
- Maintain separation of concerns between structure, style, and behavior

---

_This file serves as a reminder for the AI assistant to respect user control over when to run the application and maintain consistent code standards._
