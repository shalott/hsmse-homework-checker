// Assignment Tracker JavaScript
class AssignmentTracker {
    constructor() {
        this.assignments = { assigned: [], missing: [], metadata: {} };
        this.currentDate = new Date();
        this.currentMonth = new Date();
        this.tooltipEl = null; // reusable tooltip element
    this.classColorMap = new Map(); // className -> course-color-N
    this.classColorFile = 'data/course_colors.json';
        this.init();
    }

    async init() {
    await this.loadAssignments();
    await this.loadClassColors();
        this.setupEventListeners();
        this.renderCalendar();
        this.renderAssignmentLists();
    this.renderClassLegend();
        this.updateStatistics();
        this.displayErrors();
    }

    async loadAssignments() {
        try {
            document.getElementById('loadingIndicator').classList.remove('hidden');
            
            const response = await fetch('data/all_assignments.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            this.assignments = await response.json();
            this.updateLastUpdated();
            this.buildClassColorMap();
            
        } catch (error) {
            console.error('Error loading assignments from file, falling back to embedded data:', error);
            if (window.assignment_data) {
                console.log('Loading assignments from embedded data.');
                this.assignments = window.assignment_data;
                this.updateLastUpdated();
                this.buildClassColorMap();
            } else {
                this.showError('Failed to load assignments. Please run the data gathering script.');
            }
        } finally {
            document.getElementById('loadingIndicator').classList.add('hidden');
        }
    }

    updateLastUpdated() {
        const lastUpdatedElement = document.getElementById('lastUpdated');
        const now = new Date();
        lastUpdatedElement.textContent = `Last updated: ${now.toLocaleString()}`;
    }

    setupEventListeners() {
        // Calendar navigation
        document.getElementById('prevMonth').addEventListener('click', () => {
            this.currentMonth.setMonth(this.currentMonth.getMonth() - 1);
            this.renderCalendar();
        });

        document.getElementById('nextMonth').addEventListener('click', () => {
            this.currentMonth.setMonth(this.currentMonth.getMonth() + 1);
            this.renderCalendar();
        });

        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', async () => {
            await this.loadAssignments();
            this.renderCalendar();
            this.renderAssignmentLists();
            this.updateStatistics();
        });

        // Modal close
        document.querySelector('.close').addEventListener('click', () => {
            document.getElementById('assignmentModal').style.display = 'none';
        });

        // Click outside modal to close
        window.addEventListener('click', (event) => {
            const modal = document.getElementById('assignmentModal');
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    // Build alphabetical class list and assign deterministic CSS class names (course-color-1..15)
    buildClassColorMap() {
        const names = new Set();
        const push = (arr = []) => arr.forEach(a => a && a.class && names.add(a.class));
        push(this.assignments.assigned);
        push(this.assignments.missing);
        const sorted = Array.from(names).sort((a, b) => a.localeCompare(b));
        // Keep only mapping entries for classes in data; colors are set by backend
        const existing = new Map(this.classColorMap);
        this.classColorMap.clear();
        sorted.forEach((name) => {
            if (existing.has(name)) this.classColorMap.set(name, existing.get(name));
        });
        // Update legend when mapping changes
        this.renderClassLegend();
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

    async loadClassColors() {
        try {
            const res = await fetch(this.classColorFile);
            if (!res.ok) return;
            const obj = await res.json();
            this.classColorMap.clear();
            Object.entries(obj).forEach(([k, v]) => this.classColorMap.set(k, v));
        } catch (e) {
            // ignore if file missing
        }
    }

    // No frontend saving; backend owns course_colors.json

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
        if (!this.tooltipEl || this.tooltipEl.style.display === 'none') return;
        const offset = 12;
        this.tooltipEl.style.left = `${x + offset}px`;
        this.tooltipEl.style.top = `${y + offset}px`;
    }

    hideTooltip() {
        if (this.tooltipEl) this.tooltipEl.classList.remove('visible');
    }

    renderCalendar() {
        const table = document.getElementById('calendarTable');
        const theadRow = document.getElementById('calendarHead');
        const tbody = document.getElementById('calendarBody');
        const monthHeader = document.getElementById('currentMonth');
        
        // Update month header
        monthHeader.textContent = this.currentMonth.toLocaleDateString('en-US', { 
            month: 'long', 
            year: 'numeric' 
        });

        // Clear table head/body
        theadRow.innerHTML = '';
        tbody.innerHTML = '';

        // Build day headers
        const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayHeaders.forEach(day => {
            const th = document.createElement('th');
            th.scope = 'col';
            th.className = 'calendar-header-cell';
            th.textContent = day;
            theadRow.appendChild(th);
        });

        // Get first day of month and number of days
        const firstDay = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth(), 1);
        const lastDay = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 0);
        const firstDayWeekday = firstDay.getDay();
        const daysInMonth = lastDay.getDate();

        // Build rows: start with initial offset
        let row = document.createElement('tr');
        for (let i = 0; i < firstDayWeekday; i++) {
            const td = document.createElement('td');
            td.className = 'calendar-cell other-month';
            row.appendChild(td);
        }

        // Fill days of month
        for (let day = 1; day <= daysInMonth; day++) {
            const td = document.createElement('td');
            td.className = 'calendar-cell';
            const currentDate = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth(), day);

            if (this.isToday(currentDate)) {
                td.classList.add('today');
            }

            const dayNumber = document.createElement('div');
            dayNumber.className = 'day-number';
            dayNumber.textContent = day;
            td.appendChild(dayNumber);

            const assignmentsContainer = document.createElement('div');
            assignmentsContainer.className = 'day-assignments';

            const dayAssignments = this.getAssignmentsForDate(currentDate);
            dayAssignments.forEach(assignment => {
                const dot = document.createElement('div');
                dot.className = 'assignment-dot';

                // Colored class dot
                const colorDot = document.createElement('span');
                colorDot.className = `class-dot ${this.getClassColorClass(assignment.class)}`;
                dot.appendChild(colorDot);

                // Truncated label
                const label = document.createElement('span');
                label.className = 'assignment-label';
                label.textContent = assignment.name;
                dot.appendChild(label);

                if (assignment.type === 'missing') {
                    dot.classList.add('missing');
                } else if (this.isToday(currentDate)) {
                    dot.classList.add('due-today');
                }

                // Click opens details
                dot.addEventListener('click', () => {
                    this.showAssignmentDetails(assignment);
                });

                // Custom hover tooltip
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

                assignmentsContainer.appendChild(dot);
            });

            td.appendChild(assignmentsContainer);
            row.appendChild(td);

            // Wrap to next row every 7 cells
            if ((row.children.length) % 7 === 0) {
                tbody.appendChild(row);
                row = document.createElement('tr');
            }
        }

        // Fill trailing empty cells if needed
        if (row.children.length > 0) {
            while (row.children.length < 7) {
                const td = document.createElement('td');
                td.className = 'calendar-cell other-month';
                row.appendChild(td);
            }
            tbody.appendChild(row);
        }
    }

    getAssignmentsForDate(date) {
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format
        const allAssignments = [
            ...this.assignments.assigned.map(a => ({ ...a, type: 'assigned' })),
            ...this.assignments.missing.map(a => ({ ...a, type: 'missing' }))
        ];

        return allAssignments.filter(assignment => {
            // Only use parsed dates for calendar
            if (!assignment.due_date_parsed) return false;
            
            const assignmentDate = new Date(assignment.due_date_parsed);
            if (isNaN(assignmentDate.getTime())) return false;
            
            // Compare just the date part (YYYY-MM-DD)
            const assignmentDateStr = assignmentDate.toISOString().split('T')[0];
            return assignmentDateStr === dateStr;
        });
    }

    parseAssignmentDate(dateStr) {
        if (!dateStr || dateStr === 'No due date' || dateStr === '' || dateStr === null || dateStr === 'null') return null;
        
        try {
            // Skip non-date strings like "Posted Friday, Sep 19"
            if (dateStr.toLowerCase().includes('posted') || 
                dateStr.toLowerCase().includes('no due date') ||
                dateStr.toLowerCase() === 'unknown') {
                return null;
            }
            
            // Handle different date formats
            if (dateStr.includes('T') || dateStr.includes(' ')) {
                // ISO format or datetime string
                const parsed = new Date(dateStr);
                return isNaN(parsed) ? null : parsed;
            } else if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                // YYYY-MM-DD format
                return new Date(dateStr + 'T00:00:00');
            } else {
                // Try to parse as-is
                const parsed = new Date(dateStr);
                return isNaN(parsed) ? null : parsed;
            }
        } catch (error) {
            console.warn('Could not parse date:', dateStr);
            return null;
        }
    }

    renderAssignmentLists() {
        this.renderUpcomingAssignments();
        this.renderMissingAssignments();
    }

    renderUpcomingAssignments() {
        const container = document.getElementById('upcomingList');
        container.innerHTML = '';

        const sortedAssignments = this.getSortedUpcomingAssignments();
        
        if (sortedAssignments.length === 0) {
            const template = document.getElementById('no-assignments-template');
            const noAssignments = template.content.cloneNode(true);
            noAssignments.querySelector('.assignment-name').textContent = 'No upcoming assignments found';
            container.appendChild(noAssignments);
            return;
        }

        sortedAssignments.forEach(assignment => {
            const item = this.createAssignmentListItem(assignment);
            container.appendChild(item);
        });
    }

    renderMissingAssignments() {
        const container = document.getElementById('missingList');
        container.innerHTML = '';

        if (this.assignments.missing.length === 0) {
            const template = document.getElementById('no-assignments-template');
            const noMissing = template.content.cloneNode(true);
            noMissing.querySelector('.assignment-name').textContent = 'No missing assignments! 🎉';
            container.appendChild(noMissing);
            return;
        }

        // Sort missing assignments by most recently overdue
        const sortedMissing = this.getSortedMissingAssignments();
        
        sortedMissing.forEach(assignment => {
            const item = this.createAssignmentListItem(assignment, true);
            container.appendChild(item);
        });
    }

    getSortedMissingAssignments() {
        return this.assignments.missing
            .sort((a, b) => {
                const dateA = a.due_date_parsed;
                const dateB = b.due_date_parsed;
                
                // Put assignments without parsed dates at the end
                if (!dateA && !dateB) return 0;
                if (!dateA) return 1;
                if (!dateB) return -1;
                
                // Sort by most recently overdue (newest overdue dates first)
                return new Date(dateB) - new Date(dateA);
            });
    }

    createAssignmentListItem(assignment, isMissing = false) {
        const template = document.getElementById('assignment-item-template');
        const item = template.content.cloneNode(true);
        const assignmentItem = item.querySelector('.assignment-item');
        
        const dueText = this.formatDueDate(assignment.due_date_parsed, assignment.due_date);
        const urgencyClass = this.getUrgencyClass(assignment.due_date_parsed);
        const pointsText = assignment.max_points ? `${assignment.max_points} pts` : '';
        
        const nameEl = item.querySelector('.assignment-name');
        nameEl.textContent = assignment.name;
        if (urgencyClass) {
            nameEl.classList.add(urgencyClass);
        }

        const pointsEl = item.querySelector('.assignment-points');
        if (pointsText) {
            pointsEl.textContent = pointsText;
        } else {
            pointsEl.style.display = 'none';
        }

        item.querySelector('.assignment-due').textContent = dueText;
    const classEl = item.querySelector('.assignment-class');
    classEl.textContent = '';
    const classDot = document.createElement('span');
    classDot.className = `class-dot ${this.getClassColorClass(assignment.class)}`;
    const classNameText = document.createElement('span');
    classNameText.textContent = assignment.class;
    classEl.appendChild(classDot);
    classEl.appendChild(classNameText);

        const descriptionElement = item.querySelector('.assignment-description');
        const hasDescription = assignment.description && assignment.description.trim();

        if (hasDescription) {
            const shortDescription = assignment.description.substring(0, 200);
            const needsTruncation = assignment.description.length > 200;
            
            descriptionElement.dataset.fullDescription = assignment.description;
            item.querySelector('.description-text').textContent = shortDescription + (needsTruncation ? '...' : '');
            
            const toggleEl = item.querySelector('.description-toggle');
            if (needsTruncation) {
                toggleEl.textContent = ' (click to expand)';
            } else {
                toggleEl.style.display = 'none';
            }
        } else {
            descriptionElement.style.display = 'none';
        }

        // Add click handlers with event delegation
        assignmentItem.addEventListener('click', (e) => {
            // Check if click was on description element
            if (descriptionElement && (e.target.closest('.assignment-description') === descriptionElement)) {
                e.stopPropagation();
                this.toggleDescription(descriptionElement);
            } else {
                // Click was elsewhere - open assignment link or details
                if (assignment.url) {
                    window.open(assignment.url, '_blank');
                } else {
                    this.showAssignmentDetails(assignment);
                }
            }
        });

        return assignmentItem;
    }

    toggleDescription(descriptionElement) {
        const isExpanded = descriptionElement.dataset.expanded === 'true';
        const fullDescription = descriptionElement.dataset.fullDescription;
        const textElement = descriptionElement.querySelector('.description-text');
        const toggleElement = descriptionElement.querySelector('.description-toggle');
        
        if (!isExpanded) {
            // Expand to show full description
            textElement.textContent = fullDescription;
            if (toggleElement) {
                toggleElement.textContent = ' (click to collapse)';
            }
            descriptionElement.dataset.expanded = 'true';
            descriptionElement.classList.add('expanded');
        } else {
            // Collapse to show truncated description
            const shortDescription = fullDescription.substring(0, 200);
            const needsTruncation = fullDescription.length > 200;
            textElement.textContent = shortDescription + (needsTruncation ? '...' : '');
            if (toggleElement) {
                toggleElement.textContent = ' (click to expand)';
            }
            descriptionElement.dataset.expanded = 'false';
            descriptionElement.classList.remove('expanded');
        }
    }

    getSortedUpcomingAssignments() {
        const now = new Date();
        return this.assignments.assigned
            .filter(assignment => {
                // Only filter based on parsed dates
                if (!assignment.due_date_parsed) return true; // Include assignments without parsed dates
                const dueDate = new Date(assignment.due_date_parsed);
                if (isNaN(dueDate.getTime())) return true; // Include invalid dates
                return dueDate >= now; // Only include future assignments
            })
            .sort((a, b) => {
                const dateA = a.due_date_parsed;
                const dateB = b.due_date_parsed;

                // Assignments with dates come before those without.
                if (dateA && !dateB) return -1;
                if (!dateA && dateB) return 1;
                if (!dateA && !dateB) return 0;

                // If both have dates, sort by date.
                return new Date(dateA) - new Date(dateB);
            });
    }

    formatDueDate(parsedDate, originalDate) {
        // If we don't have a parsed date, show "No due date" + original if available
        if (!parsedDate || parsedDate === null) {
            if (originalDate && originalDate.trim()) {
                return `No due date (${originalDate})`;
            }
            return 'No due date';
        }
        
        try {
            const date = new Date(parsedDate);
            
            // Check if the date is invalid
            if (isNaN(date.getTime())) {
                if (originalDate && originalDate.trim()) {
                    return `No due date (${originalDate})`;
                }
                return 'No due date';
            }
            
            const now = new Date();
            const diffTime = date - now;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays < 0) {
                return `${Math.abs(diffDays)} days overdue`;
            } else if (diffDays === 0) {
                return `Due today at ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
            } else if (diffDays === 1) {
                return `Due tomorrow at ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
            } else if (diffDays <= 7) {
                return `Due in ${diffDays} days (${date.toLocaleDateString()})`;
            } else {
                return `Due ${date.toLocaleDateString()} at ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
            }
        } catch (error) {
            if (originalDate && originalDate.trim()) {
                return `No due date (${originalDate})`;
            }
            return 'No due date';
        }
    }

    getUrgencyClass(parsedDate) {
        if (!parsedDate || parsedDate === null) return '';
        
        try {
            const date = new Date(parsedDate);
            
            // Check if the date is invalid
            if (isNaN(date.getTime())) {
                return '';
            }
            
            const now = new Date();
            const diffTime = date - now;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays < 0) return 'overdue';
            if (diffDays === 0) return 'due-today';
            if (diffDays <= 2) return 'due-soon';
            return '';
        } catch (error) {
            return '';
        }
    }

    showAssignmentDetails(assignment) {
        const modal = document.getElementById('assignmentModal');
        const title = document.getElementById('modalTitle');
        const body = document.getElementById('modalBody');
        
        title.textContent = assignment.name;
        
        const template = document.getElementById('modal-body-template');
        const modalContent = template.content.cloneNode(true);

        const dueText = this.formatDueDate(assignment.due_date_parsed, assignment.due_date);
        
        modalContent.querySelector('.modal-class').textContent = assignment.class;
        modalContent.querySelector('.modal-due').textContent = dueText;
        modalContent.querySelector('.modal-raw-due').textContent = assignment.due_date;

        const pointsLine = modalContent.querySelector('.modal-points-line');
        if (assignment.max_points) {
            modalContent.querySelector('.modal-points').textContent = assignment.max_points;
        } else {
            pointsLine.style.display = 'none';
        }

        const descriptionLine = modalContent.querySelector('.modal-description-line');
        if (assignment.description) {
            modalContent.querySelector('.modal-description-content').textContent = assignment.description;
        } else {
            descriptionLine.style.display = 'none';
        }

        const urlLine = modalContent.querySelector('.modal-url-line');
        if (assignment.url) {
            modalContent.querySelector('.modal-url').href = assignment.url;
        } else {
            urlLine.style.display = 'none';
        }
        
        body.innerHTML = '';
        body.appendChild(modalContent);
        
        modal.style.display = 'block';
    }

    updateStatistics() {
        const totalUpcoming = this.assignments.assigned ? this.assignments.assigned.length : 0;
        const totalMissing = this.assignments.missing ? this.assignments.missing.length : 0;
        const totalAssignments = totalUpcoming + totalMissing;

        document.getElementById('totalUpcoming').textContent = totalUpcoming;
        document.getElementById('totalMissing').textContent = totalMissing;
        document.getElementById('totalAssignments').textContent = totalAssignments;
    }

    displayErrors() {
        const errorBox = document.getElementById('error-box');
        const errorMessagesContainer = document.getElementById('error-messages');
        const errorCloseBtn = document.getElementById('error-close-btn');

        if (this.assignments.errors && this.assignments.errors.length > 0) {
            errorMessagesContainer.innerHTML = '';
            this.assignments.errors.forEach(errMsg => {
                const errDiv = document.createElement('div');
                errDiv.textContent = errMsg;
                errorMessagesContainer.appendChild(errDiv);
            });
            errorBox.classList.remove('hidden');
        } else {
            errorBox.classList.add('hidden');
        }

        errorCloseBtn.addEventListener('click', () => {
            errorBox.classList.add('hidden');
        });
    }

    isToday(date) {
        const today = new Date();
        return date.toDateString() === today.toDateString();
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            background: #f8d7da;
            color: #721c24;
            padding: 1rem;
            border-radius: 8px;
            margin: 1rem 0;
            border: 1px solid #f5c6cb;
        `;
        errorDiv.textContent = message;
        
        const container = document.querySelector('.container');
        container.insertBefore(errorDiv, container.firstChild);
        
        // Remove error after 10 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 10000);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AssignmentTracker();
});