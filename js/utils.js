/**
 * Utility Functions & Shared Helpers
 * Cloud-Based Student Attendance Management System
 */

/**
 * Display a modern Toast notification
 * @param {string} message - The text message to display
 * @param {'success'|'error'|'warning'|'info'} [type='info'] - Visual type of toast
 * @param {string} [title] - Optional title
 * @param {number} [duration=4000] - Duration in ms before auto-dismiss
 */
export function showToast(message, type = 'info', title = '', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: 'fa-solid fa-circle-check',
    error: 'fa-solid fa-circle-exclamation',
    warning: 'fa-solid fa-triangle-exclamation',
    info: 'fa-solid fa-circle-info'
  };

  const defaultTitles = {
    success: 'Success',
    error: 'Error',
    warning: 'Notice',
    info: 'Information'
  };

  const displayTitle = title || defaultTitles[type] || 'Notice';

  toast.innerHTML = `
    <div class="toast-icon">
      <i class="${iconMap[type] || iconMap.info}"></i>
    </div>
    <div class="toast-content">
      <div class="toast-title">${escapeHTML(displayTitle)}</div>
      <div class="toast-message">${escapeHTML(message)}</div>
    </div>
  `;

  container.appendChild(toast);

  // Auto remove after duration
  setTimeout(() => {
    toast.classList.add('toast-hiding');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 260);
  }, duration);
}

/**
 * Display an inline alert box
 * @param {HTMLElement} element - Target container element
 * @param {string} message - Alert message
 * @param {'success'|'danger'|'warning'|'info'} type - Alert style
 */
export function showAlert(element, message, type = 'danger') {
  if (!element) return;
  element.className = `alert alert-${type}`;
  element.style.display = 'block';

  const bgColors = {
    danger: 'var(--danger-light)',
    success: 'var(--success-light)',
    warning: 'var(--warning-light)',
    info: 'var(--info-light)'
  };

  const textColors = {
    danger: 'var(--danger-hover)',
    success: 'var(--success-hover)',
    warning: 'var(--warning-hover)',
    info: 'var(--primary)'
  };

  const borderColors = {
    danger: 'var(--danger-border)',
    success: 'var(--success-border)',
    warning: 'var(--warning-border)',
    info: 'var(--primary-border)'
  };

  element.style.backgroundColor = bgColors[type] || bgColors.danger;
  element.style.color = textColors[type] || textColors.danger;
  element.style.border = `1px solid ${borderColors[type] || borderColors.danger}`;
  element.innerHTML = message;
}

/**
 * Escape HTML to prevent XSS injection
 */
export function escapeHTML(str) {
  if (typeof str !== 'string') return String(str || '');
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

/**
 * Returns today's date formatted as YYYY-MM-DD in local time
 */
export function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a YYYY-MM-DD or ISO date string into readable English (e.g. Nov 24, 2026)
 */
export function formatDate(dateString) {
  if (!dateString) return 'N/A';
  try {
    // If YYYY-MM-DD format, split to prevent UTC timezone shifts
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const [year, month, day] = dateString.split('-').map(Number);
      const d = new Date(year, month - 1, day);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return dateString;
  }
}

/**
 * Formats full current day for Topbar (e.g., Tuesday, Nov 24, 2026)
 */
export function getFormattedTodayString() {
  const d = new Date();
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Generates a deterministic Firestore document ID for an attendance record
 * Deterministic format: `${studentId}_${classId}_${subjectId}_${attendanceDate}`
 */
export function generateDeterministicId(studentId, classId, subjectId, attendanceDate) {
  const sanitize = (val) => String(val || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-');
  return `${sanitize(studentId)}_${sanitize(classId)}_${sanitize(subjectId)}_${sanitize(attendanceDate)}`;
}

/**
 * Exports data to a standard CSV file and triggers download
 * @param {string} filename - Download file name ending in .csv
 * @param {string[]} headers - Array of column header strings
 * @param {Array<Array<string|number>>} rows - Matrix of row data
 */
export function exportToCSV(filename, headers, rows) {
  const escapeCSVValue = (val) => {
    if (val === null || val === undefined) return '""';
    const stringVal = String(val);
    if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')) {
      return `"${stringVal.replace(/"/g, '""')}"`;
    }
    return `"${stringVal}"`;
  };

  const csvRows = [];
  // Add Header Row
  csvRows.push(headers.map(escapeCSVValue).join(','));

  // Add Data Rows
  rows.forEach((row) => {
    csvRows.push(row.map(escapeCSVValue).join(','));
  });

  const csvString = csvRows.join('\r\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const downloadLink = document.createElement('a');
  downloadLink.setAttribute('href', url);
  downloadLink.setAttribute('download', filename);
  downloadLink.style.display = 'none';
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(url);
}

/**
 * Initializes shared layout behaviors (mobile sidebar drawer, current date)
 */
export function initLayout() {
  const dateDisplay = document.getElementById('date-display');
  if (dateDisplay) {
    dateDisplay.textContent = getFormattedTodayString();
  }

  const menuToggle = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');

  if (menuToggle && sidebar && backdrop) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      backdrop.classList.toggle('show');
    });

    backdrop.addEventListener('click', () => {
      sidebar.classList.remove('open');
      backdrop.classList.remove('show');
    });
  }
}
