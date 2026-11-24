/**
 * Attendance Reports & CSV Export Module
 * Analyzes attendance records from Firestore and generates downloadable CSV spreadsheets
 */

import { db } from './firebase-config.js';
import { requireAuth } from './auth.js';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  showToast,
  escapeHTML,
  formatDate,
  exportToCSV
} from './utils.js';

let currentUser = null;
let currentClasses = [];
let currentSubjects = [];
let generatedReportRows = [];
let currentReportMetadata = {};

// UI Elements
const reportFilterForm = document.getElementById('report-filter-form');
const reportClassSelect = document.getElementById('report-class');
const reportSubjectSelect = document.getElementById('report-subject');
const startDateInput = document.getElementById('report-start-date');
const endDateInput = document.getElementById('report-end-date');
const btnGenerateReport = document.getElementById('btn-generate-report');
const btnExportCSV = document.getElementById('btn-export-csv');

const reportSummaryCards = document.getElementById('report-summary-cards');
const reportResultsCard = document.getElementById('report-results-card');
const reportPlaceholder = document.getElementById('report-placeholder');
const reportTbody = document.getElementById('report-tbody');
const reportPeriodLabel = document.getElementById('report-period-label');

const summaryTotalSessions = document.getElementById('summary-total-sessions');
const summaryTotalStudents = document.getElementById('summary-total-students');
const summaryAveragePercentage = document.getElementById('summary-average-percentage');
const summaryLowCount = document.getElementById('summary-low-count');

// Initialize with Route Guard
requireAuth(async (user) => {
  currentUser = user;
  setupEventListeners();
  await loadClassesAndSubjects();
});

function setupEventListeners() {
  reportClassSelect.addEventListener('change', handleClassFilterChange);
  reportFilterForm.addEventListener('submit', handleGenerateReport);
  btnExportCSV.addEventListener('click', handleExportCSV);
}

/**
 * Fetch classes and subjects for filter dropdowns
 */
async function loadClassesAndSubjects() {
  try {
    const classesRef = collection(db, 'users', currentUser.uid, 'classes');
    const classesSnap = await getDocs(query(classesRef, orderBy('name', 'asc')));
    currentClasses = [];
    reportClassSelect.innerHTML = '<option value="">Select Class...</option>';

    classesSnap.forEach((doc) => {
      const cls = { id: doc.id, ...doc.data() };
      currentClasses.push(cls);
      const opt = document.createElement('option');
      opt.value = cls.id;
      opt.textContent = `${cls.name} (${cls.section || 'Sec A'})`;
      reportClassSelect.appendChild(opt);
    });

    const subjectsRef = collection(db, 'users', currentUser.uid, 'subjects');
    const subjectsSnap = await getDocs(query(subjectsRef, orderBy('name', 'asc')));
    currentSubjects = [];
    subjectsSnap.forEach((doc) => {
      currentSubjects.push({ id: doc.id, ...doc.data() });
    });
  } catch (err) {
    console.error('Error loading report filter metadata:', err);
    showToast('Failed to load filter options: ' + err.message, 'error');
  }
}

function handleClassFilterChange() {
  const selectedClassId = reportClassSelect.value;
  reportSubjectSelect.innerHTML = '<option value="">All Subjects</option>';

  if (!selectedClassId) return;

  const filteredSubs = currentSubjects.filter((s) => s.classId === selectedClassId);
  filteredSubs.forEach((sub) => {
    const opt = document.createElement('option');
    opt.value = sub.id;
    opt.textContent = `${sub.name} (${sub.code})`;
    reportSubjectSelect.appendChild(opt);
  });
}

/**
 * Query Firestore attendance data and calculate statistics
 */
async function handleGenerateReport(e) {
  e.preventDefault();

  const classId = reportClassSelect.value;
  const subjectId = reportSubjectSelect.value;
  const startDate = startDateInput.value;
  const endDate = endDateInput.value;

  if (!classId) {
    showToast('Please select a Class to generate report', 'warning');
    return;
  }

  btnGenerateReport.disabled = true;
  btnGenerateReport.innerHTML = '<span class="spinner"></span> Computing...';

  try {
    // 1. Fetch Students enrolled in this class
    const studentsRef = collection(db, 'users', currentUser.uid, 'students');
    const qStudents = query(studentsRef, where('classId', '==', classId));
    const studentsSnap = await getDocs(qStudents);

    if (studentsSnap.empty) {
      showToast('No students found in the selected class', 'warning');
      reportSummaryCards.style.display = 'none';
      reportResultsCard.style.display = 'none';
      reportPlaceholder.style.display = 'block';
      btnExportCSV.disabled = true;
      return;
    }

    const students = [];
    studentsSnap.forEach((doc) => {
      students.push({ id: doc.id, ...doc.data() });
    });

    // 2. Query Attendance records for this class
    const attendanceRef = collection(db, 'users', currentUser.uid, 'attendance');
    const qAttendance = query(attendanceRef, where('classId', '==', classId));
    const attendanceSnap = await getDocs(qAttendance);

    let records = [];
    attendanceSnap.forEach((doc) => {
      records.push(doc.data());
    });

    // Apply Client-Side Filter for Subject and Date Range
    if (subjectId) {
      records = records.filter((r) => r.subjectId === subjectId);
    }
    if (startDate) {
      records = records.filter((r) => r.attendanceDate >= startDate);
    }
    if (endDate) {
      records = records.filter((r) => r.attendanceDate <= endDate);
    }

    // 3. Calculate distinct sessions held
    const distinctSessions = new Set();
    records.forEach((r) => {
      distinctSessions.add(`${r.subjectId}_${r.attendanceDate}`);
    });
    const totalSessionsHeld = distinctSessions.size;

    // 4. Compute per-student statistics
    let totalPresentSum = 0;
    let totalPossibleSum = 0;
    let defaultersCount = 0;

    generatedReportRows = students.map((stu) => {
      const studentRecords = records.filter((r) => r.studentId === stu.id);
      const studentTotalClasses = studentRecords.length;
      const presentCount = studentRecords.filter((r) => r.status === 'Present').length;
      const absentCount = studentTotalClasses - presentCount;

      const percentageNum = studentTotalClasses > 0
        ? (presentCount / studentTotalClasses) * 100
        : 0;
      const percentageStr = percentageNum.toFixed(1);

      totalPresentSum += presentCount;
      totalPossibleSum += studentTotalClasses;

      if (percentageNum < 75 && studentTotalClasses > 0) {
        defaultersCount++;
      }

      let statusTier = 'Good';
      let badgeClass = 'badge-success';
      if (studentTotalClasses === 0) {
        statusTier = 'No Records';
        badgeClass = 'badge-secondary';
      } else if (percentageNum < 60) {
        statusTier = 'Low Attendance';
        badgeClass = 'badge-danger';
      } else if (percentageNum < 75) {
        statusTier = 'Average';
        badgeClass = 'badge-warning';
      }

      return {
        id: stu.id,
        name: stu.name,
        rollNumber: stu.rollNumber,
        totalClasses: studentTotalClasses,
        presentCount,
        absentCount,
        percentageNum,
        percentageStr,
        statusTier,
        badgeClass
      };
    });

    // Sort by roll number
    generatedReportRows.sort((a, b) => {
      const numA = parseInt(a.rollNumber, 10);
      const numB = parseInt(b.rollNumber, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return String(a.rollNumber).localeCompare(String(b.rollNumber));
    });

    // 5. Update Metrics Cards
    const overallAvg = totalPossibleSum > 0
      ? ((totalPresentSum / totalPossibleSum) * 100).toFixed(1)
      : '0.0';

    summaryTotalSessions.textContent = totalSessionsHeld;
    summaryTotalStudents.textContent = students.length;
    summaryAveragePercentage.textContent = `${overallAvg}%`;
    summaryLowCount.textContent = defaultersCount;

    // 6. Update Period Label
    const selectedClass = currentClasses.find((c) => c.id === classId);
    const className = selectedClass ? `${selectedClass.name} (${selectedClass.section})` : 'Class';
    currentReportMetadata = {
      className,
      startDate: startDate || 'Beginning',
      endDate: endDate || 'Latest'
    };
    reportPeriodLabel.textContent = `${className} &bull; Period: ${startDate ? formatDate(startDate) : 'All Dates'} to ${endDate ? formatDate(endDate) : 'Present'}`;

    // 7. Render Table
    renderReportTable();

    // Show Report Cards
    reportPlaceholder.style.display = 'none';
    reportSummaryCards.style.display = 'grid';
    reportResultsCard.style.display = 'block';
    btnExportCSV.disabled = false;

    showToast('Attendance report generated successfully!', 'success');
  } catch (err) {
    console.error('Error generating report:', err);
    showToast('Failed to generate report: ' + err.message, 'error');
  } finally {
    btnGenerateReport.disabled = false;
    btnGenerateReport.innerHTML = '<i class="fa-solid fa-filter"></i> Generate Report';
  }
}

function renderReportTable() {
  if (generatedReportRows.length === 0) {
    reportTbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center" style="padding: 30px; color: var(--text-secondary);">
          No student attendance data found for the selected criteria.
        </td>
      </tr>
    `;
    return;
  }

  reportTbody.innerHTML = generatedReportRows.map((row) => `
    <tr>
      <td>
        <span class="badge badge-primary" style="font-family: monospace; font-size: 0.85rem; font-weight: 700;">
          ${escapeHTML(row.rollNumber || 'N/A')}
        </span>
      </td>
      <td>
        <strong>${escapeHTML(row.name)}</strong>
      </td>
      <td>${row.totalClasses}</td>
      <td style="color: var(--success); font-weight: 600;">${row.presentCount}</td>
      <td style="color: var(--danger); font-weight: 600;">${row.absentCount}</td>
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          <div class="progress-container" style="flex: 1; height: 6px;">
            <div class="progress-bar ${row.percentageNum >= 75 ? 'success' : (row.percentageNum >= 60 ? 'warning' : 'danger')}" style="width: ${row.percentageNum}%;"></div>
          </div>
          <span style="font-weight: 700; font-size: 0.825rem; min-width: 44px; text-align: right;">${row.percentageStr}%</span>
        </div>
      </td>
      <td style="text-align: right;">
        <span class="badge ${row.badgeClass}">${row.statusTier}</span>
      </td>
    </tr>
  `).join('');
}

/**
 * Export filtered attendance data to a downloadable CSV spreadsheet
 */
function handleExportCSV() {
  if (generatedReportRows.length === 0) {
    showToast('No report data available to export', 'warning');
    return;
  }

  const headers = [
    'Roll Number',
    'Student Name',
    'Total Classes',
    'Present Count',
    'Absent Count',
    'Attendance %',
    'Status'
  ];

  const rows = generatedReportRows.map((row) => [
    row.rollNumber,
    row.name,
    row.totalClasses,
    row.presentCount,
    row.absentCount,
    `${row.percentageStr}%`,
    row.statusTier
  ]);

  const cleanClassName = (currentReportMetadata.className || 'Class').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Attendance_Report_${cleanClassName}_${new Date().toISOString().slice(0, 10)}.csv`;

  exportToCSV(filename, headers, rows);
  showToast(`Exported ${generatedReportRows.length} student records to CSV!`, 'success');
}
