// Assignment Tracker JavaScript - handles display of assignment data
const { ipcRenderer } = require('electron');
const { logToRenderer } = require('./logger');
const { DATA_DIR } = require('../config/constants');

class AssignmentTracker {
    constructor() {
        this.assignments = [];
        this.currentDate = new Date(); 
        this.currentMonth = new Date();
        this.classColorMap = new Map();
        this.initialized = false;
        this.tooltipEl = null; // reusable tooltip element
    }

    async init() {
        if (this.initialized) {
            logToRenderer('Assignment tracker already initialized, skipping', 'info');
            return;
        }
        
        logToRenderer('Assignment tracker init() starting...', 'info');
        await this.loadAssignments();
        logToRenderer('loadAssignments() completed, setting up UI...', 'info');
        this.setupEventListeners();
        this.renderCalendar();
        this.renderAssignmentLists();
        this.renderClassLegend();
        this.updateStatistics();
        this.updateLastUpdated();
        
        this.initialized = true;
        logToRenderer('Assignment tracker initialization completed successfully', 'success');
    }

    async loadAssignments() {
        logToRenderer('Starting to load assignments...', 'info');
        
        try {
            // Use IPC to get assignments from main process
            const { ipcRenderer } = require('electron');
            const assignments = await ipcRenderer.invoke('get-assignments');
            
            if (assignments && assignments.length > 0) {
                this.assignments = assignments;
                logToRenderer(`Loaded ${this.assignments.length} assignments from file`, 'success');
                
                // Log first assignment as sample
                if (this.assignments.length > 0) {
                    logToRenderer(`Sample assignment: ${this.assignments[0].name} (${this.assignments[0].class})`, 'info');
                }
                
                // Set a reasonable last update time
                this.lastDataUpdate = new Date();
            } else {
                logToRenderer('No assignments found, using empty array', 'warn');
                this.assignments = [];
                this.lastDataUpdate = null;
            }
            
            logToRenderer(`Building class color map for ${this.assignments.length} assignments...`, 'info');
            this.buildClassColorMap();
            logToRenderer(`Class color map built with ${this.classColorMap.size} classes`, 'info');
            
            // Log class names found
            if (this.classColorMap.size > 0) {
                logToRenderer(`Classes found: ${Array.from(this.classColorMap.keys()).join(', ')}`, 'info');
            }
            
        } catch (error) {
            logToRenderer(`Error loading assignments: ${error.message}`, 'error');
            this.assignments = [];
            this.lastDataUpdate = null;
        }
    }

    updateLastUpdated() {
        const lastUpdatedElement = document.getElementById('lastUpdated');
        if (lastUpdatedElement) {
            if (this.assignments.length > 0 && this.lastDataUpdate) {
                lastUpdatedElement.textContent = `Last updated: ${this.lastDataUpdate.toLocaleString()} (${this.assignments.length} assignments)`;
            } else if (this.assignments.length > 0) {
                lastUpdatedElement.textContent = `${this.assignments.length} assignments loaded`;
            } else {
                lastUpdatedElement.textContent = 'No assignment data - click Refresh Data to collect';
            }
        }
    }

    setupEventListeners() {
        // Calendar navigation
        const prevBtn = document.getElementById('prevMonth');
        const nextBtn = document.getElementById('nextMonth');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                this.currentMonth.setMonth(this.currentMonth.getMonth() - 1);
                this.renderCalendar();
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                this.currentMonth.setMonth(this.currentMonth.getMonth() + 1);
                this.renderCalendar();
            });
        }

        // Refresh button 
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.handleRefreshData();
            });
        }

        // Modal close
        const closeBtn = document.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.getElementById('assignmentModal').style.display = 'none';
            });
        }

        // Click outside modal to close
        window.addEventListener('click', (event) => {
            const modal = document.getElementById('assignmentModal');
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });

        // Error close button
        const errorCloseBtn = document.getElementById('error-close-btn');
        if (errorCloseBtn) {
            errorCloseBtn.addEventListener('click', () => {
                document.getElementById('error-box').classList.add('hidden');
            });
        }
    }

    handleRefreshData() {
        // Show browser view and trigger data collection
        const assignmentView = document.getElementById('assignment-view');
        const browserView = document.getElementById('browser-view');
        
        if (assignmentView && browserView) {
            assignmentView.classList.add('hidden');
            browserView.classList.remove('hidden');
        }

        // Trigger the integrated workflow
        ipcRenderer.invoke('run-integrated-workflow');
    }

    // Tooltip helpers
    ensureTooltip() {
        if (!this.tooltipEl) {
            const el = document.createElement('div');
            el.className = 'calendar-tooltip';
            document.body.appendChild(el);
            this.tooltipEl = el;
        }
        return this.tooltipEl;
    }

    showTooltip(text, x, y) {
        const el = this.ensureTooltip();
        el.textContent = text;
        el.classList.add('visible');
        // Position with slight offset
        const offset = 12;
        el.style.left = `${x + offset}px`;
        el.style.top = `${y + offset}px`;
    }

    moveTooltip(x, y) {
        if (!this.tooltipEl || !this.tooltipEl.classList.contains('visible')) return;
        const offset = 12;
        this.tooltipEl.style.left = `${x + offset}px`;
        this.tooltipEl.style.top = `${y + offset}px`;
    }

    hideTooltip() {
        if (this.tooltipEl) this.tooltipEl.classList.remove('visible');
    }

    buildClassColorMap() {
        const classNames = new Set();
        this.assignments.forEach(assignment => {
            if (assignment.class) {
                classNames.add(assignment.class);
            }
        });

        const sortedNames = Array.from(classNames).sort();
        this.classColorMap.clear();
        
        sortedNames.forEach((name, index) => {
            const colorIndex = (index % 15) + 1;
            this.classColorMap.set(name, `course-color-${colorIndex}`);
        });
    }

    getClassColorClass(className = '') {
        return this.classColorMap.get(className) || 'course-color-1';
    }

    renderClassLegend() {
        const legend = document.getElementById('classLegend');
        if (!legend) return;
        
        legend.innerHTML = '';
        const entries = Array.from(this.classColorMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        
        entries.forEach(([className, colorClass]) => {
            const item = document.createElement('div');
            item.className = 'class-legend-item';
            
            const dot = document.createElement('span');
            dot.className = `class-dot ${colorClass}`;
            
            const label = document.createElement('span');
            label.textContent = className;
            
            item.appendChild(dot);
            item.appendChild(label);
            legend.appendChild(item);
        });
    }

    renderCalendar() {
        const currentMonthElement = document.getElementById('currentMonth');
        const calendarHead = document.getElementById('calendarHead');
        const calendarBody = document.getElementById('calendarBody');
        
        if (!currentMonthElement || !calendarHead || !calendarBody) return;

        // Update month header
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        currentMonthElement.textContent = `${monthNames[this.currentMonth.getMonth()]} ${this.currentMonth.getFullYear()}`;

        // Create day headers
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        calendarHead.innerHTML = '';
        dayNames.forEach(day => {
            const th = document.createElement('th');
            th.textContent = day;
            calendarHead.appendChild(th);
        });

        // Create calendar grid
        calendarBody.innerHTML = '';
        
        const firstDay = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth(), 1);
        const lastDay = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 0);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - firstDay.getDay());

        for (let week = 0; week < 6; week++) {
            const row = document.createElement('tr');
            
            for (let day = 0; day < 7; day++) {
                const currentDate = new Date(startDate);
                currentDate.setDate(startDate.getDate() + (week * 7) + day);
                
                const cell = document.createElement('td');
                cell.className = 'calendar-cell';
                
                // Add classes for styling
                if (currentDate.getMonth() !== this.currentMonth.getMonth()) {
                    cell.classList.add('other-month');
                }
                
                if (this.isSameDay(currentDate, new Date())) {
                    cell.classList.add('today');
                }

                // Day number
                const dayNumber = document.createElement('div');
                dayNumber.className = 'day-number';
                dayNumber.textContent = currentDate.getDate();
                cell.appendChild(dayNumber);

                // Assignments for this day
                const dayAssignments = document.createElement('div');
                dayAssignments.className = 'day-assignments';
                
                const assignmentsForDay = this.getAssignmentsForDate(currentDate);
                assignmentsForDay.forEach(assignment => {
                    const dot = this.createAssignmentDot(assignment);
                    dayAssignments.appendChild(dot);
                });
                
                cell.appendChild(dayAssignments);
                row.appendChild(cell);
            }
            
            calendarBody.appendChild(row);
        }
    }

    getAssignmentsForDate(date) {
        return this.assignments.filter(assignment => {
            if (!assignment.due_date_parsed) return false;
            const assignmentDate = new Date(assignment.due_date_parsed);
            return this.isSameDay(assignmentDate, date);
        });
    }

    isSameDay(date1, date2) {
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getDate() === date2.getDate();
    }

    createAssignmentDot(assignment) {
        const dot = document.createElement('div');
        dot.className = 'assignment-dot';
        dot.style.cursor = 'pointer';
        
        // Set background color to course color
        const colorClass = this.getClassColorClass(assignment.class);
        dot.classList.add(colorClass);
        
        // Check if assignment is overdue or upcoming
        const now = new Date();
        if (assignment.due_date_parsed) {
            const dueDate = new Date(assignment.due_date_parsed);
            if (dueDate < now) {
                dot.classList.add('overdue');
            } else {
                dot.classList.add('upcoming');
            }
        }
        
        const label = document.createElement('span');
        label.className = 'assignment-label';
        label.textContent = assignment.name;
        
        dot.appendChild(label);
        
        dot.addEventListener('click', () => {
            this.showAssignmentModal(assignment);
        });

        // Add tooltip functionality
        const tooltipText = `[${assignment.class || 'Unknown Class'}]: ${assignment.name}`;
        dot.addEventListener('mouseenter', (e) => {
            this.showTooltip(tooltipText, e.pageX, e.pageY);
        });
        dot.addEventListener('mousemove', (e) => {
            this.moveTooltip(e.pageX, e.pageY);
        });
        dot.addEventListener('mouseleave', () => {
            this.hideTooltip();
        });
        
        return dot;
    }

    renderAssignmentLists() {
        this.renderUpcomingAssignments();
        this.renderMissingAssignments();
    }

    renderUpcomingAssignments() {
        const container = document.getElementById('upcomingList');
        if (!container) return;

        const now = new Date();
        const upcoming = this.assignments.filter(assignment => {
            // Include assignments with no due date (they're still pending)
            if (!assignment.due_date_parsed) return true;
            const dueDate = new Date(assignment.due_date_parsed);
            return dueDate >= now;
        });

        // Apply sorting based on current sort selection
        const sortBy = document.getElementById('sortBy')?.value || 'date';
        const sortedUpcoming = this.sortAssignments(upcoming, sortBy);

        this.renderAssignmentList(container, sortedUpcoming, 'No upcoming assignments');
    }

    renderMissingAssignments() {
        const container = document.getElementById('missingList');
        if (!container) return;

        const now = new Date();
        const missing = this.assignments.filter(assignment => {
            if (!assignment.due_date_parsed) return false;
            const dueDate = new Date(assignment.due_date_parsed);
            return dueDate < now;
        });

        // Sort missing assignments by date (most recent first)
        const sortedMissing = this.sortAssignments(missing, 'date', true);

        this.renderAssignmentList(container, sortedMissing, 'No missing assignments');
    }

    renderAssignmentList(container, assignments, emptyMessage) {
        container.innerHTML = '';

        if (assignments.length === 0) {
            const emptyLi = document.createElement('li');
            emptyLi.className = 'assignment-item';
            emptyLi.innerHTML = `<div class="assignment-name">${emptyMessage}</div>`;
            container.appendChild(emptyLi);
            return;
        }

        assignments.forEach(assignment => {
            const item = this.createAssignmentItem(assignment);
            container.appendChild(item);
        });
    }

    createAssignmentItem(assignment) {
        const item = document.createElement('li');
        item.className = 'assignment-item';

        const header = document.createElement('div');
        header.className = 'assignment-header';

        const name = document.createElement('div');
        name.className = 'assignment-name';
        name.textContent = assignment.name;
        name.addEventListener('click', () => {
            this.showAssignmentModal(assignment);
        });

        const meta = document.createElement('div');
        meta.className = 'assignment-meta';

        if (assignment.max_points) {
            const points = document.createElement('span');
            points.className = 'assignment-points';
            points.textContent = `${assignment.max_points} pts`;
            meta.appendChild(points);
        }

        const due = document.createElement('span');
        due.className = 'assignment-due';
        due.textContent = assignment.due_date || 'No due date';
        meta.appendChild(due);

        header.appendChild(name);
        header.appendChild(meta);

        const classDiv = document.createElement('div');
        classDiv.className = `assignment-class ${this.getClassColorClass(assignment.class)}`;
        classDiv.textContent = assignment.class || 'Unknown Class';

        const description = document.createElement('div');
        description.className = 'assignment-description';
        
        if (assignment.description && assignment.description.trim()) {
            const text = document.createElement('span');
            text.className = 'description-text';
            text.textContent = assignment.description.length > 150 ? 
                assignment.description.substring(0, 150) + '...' : 
                assignment.description;
            
            if (assignment.description.length > 150) {
                const toggle = document.createElement('span');
                toggle.className = 'description-toggle';
                toggle.textContent = 'Show more';
                toggle.addEventListener('click', () => {
                    this.showAssignmentModal(assignment);
                });
                description.appendChild(text);
                description.appendChild(toggle);
            } else {
                description.appendChild(text);
            }
        }

        item.appendChild(classDiv);
        item.appendChild(header);
        if (assignment.description && assignment.description.trim()) {
            item.appendChild(description);
        }

        return item;
    }

    showAssignmentModal(assignment) {
        const modal = document.getElementById('assignmentModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        
        if (!modal || !modalTitle || !modalBody) return;

        modalTitle.textContent = assignment.name;
        
        modalBody.innerHTML = `
            <div class="modal-line">
                <strong>Class:</strong> ${assignment.class || 'Unknown Class'}
            </div>
            <div class="modal-line">
                <strong>Due:</strong> ${assignment.due_date || 'No due date'}
            </div>
            ${assignment.max_points ? `<div class="modal-line">
                <strong>Points:</strong> ${assignment.max_points}
            </div>` : ''}
            ${assignment.description ? `<div class="modal-line">
                <strong>Description:</strong>
                <div class="modal-description-content">${assignment.description}</div>
            </div>` : ''}
            ${assignment.url ? `<div class="modal-line">
                ${assignment.url.startsWith('https://login.jupitered.com') ? 
                    `<a href="#" class="modal-url" onclick="require('electron').shell.openExternal('https://login.jupitered.com/todo/index.php?89583')">Open Jupiter →</a>` :
                    `<a href="#" class="modal-url" onclick="require('electron').shell.openExternal('${assignment.url}')">Open Assignment →</a>`
                }
            </div>` : ''}
        `;

        modal.style.display = 'block';
    }

    updateStatistics() {
        const now = new Date();
        
        const upcoming = this.assignments.filter(assignment => {
            // Include assignments with no due date in the upcoming count
            if (!assignment.due_date_parsed) return true;
            const dueDate = new Date(assignment.due_date_parsed);
            return dueDate >= now;
        }).length;

        const missing = this.assignments.filter(assignment => {
            // Exclude assignments with no due date from missing count
            if (!assignment.due_date_parsed) return false;
            const dueDate = new Date(assignment.due_date_parsed);
            return dueDate < now;
        }).length;

        const total = this.assignments.length;

        const upcomingEl = document.getElementById('totalUpcoming');
        const missingEl = document.getElementById('totalMissing');
        const totalEl = document.getElementById('totalAssignments');

        if (upcomingEl) upcomingEl.textContent = upcoming;
        if (missingEl) missingEl.textContent = missing;
        if (totalEl) totalEl.textContent = total;
    }

    async refresh() {
        await this.loadAssignments();
        this.renderCalendar();
        this.renderAssignmentLists();
        this.renderClassLegend();
        this.updateStatistics();
        this.updateLastUpdated();
        
        console.log(`Assignment display refreshed with ${this.assignments.length} assignments`);
    }

    // Called when data collection is complete
    onDataCollectionComplete() {
        // Hide browser view and show assignment view
        const assignmentView = document.getElementById('assignment-view');
        const browserView = document.getElementById('browser-view');
        
        if (assignmentView && browserView) {
            browserView.classList.add('hidden');
            assignmentView.classList.remove('hidden');
        }

        // Refresh the assignment display with new data
        this.refresh();
    }

    sortAssignments(assignments, sortBy, reverse = false) {
        return [...assignments].sort((a, b) => {
            let comparison = 0;
            
            if (sortBy === 'class') {
                // Sort by class name
                const classA = a.class_name || '';
                const classB = b.class_name || '';
                comparison = classA.localeCompare(classB);
            } else {
                // Sort by date (default)
                if (!a.due_date_parsed && !b.due_date_parsed) return 0;
                if (!a.due_date_parsed) return 1;
                if (!b.due_date_parsed) return -1;
                comparison = new Date(a.due_date_parsed) - new Date(b.due_date_parsed);
            }
            
            return reverse ? -comparison : comparison;
        });
    }
}

// Export for use in renderer
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AssignmentTracker;
}