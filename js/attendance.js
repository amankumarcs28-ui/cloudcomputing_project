/**
 * Attendance Management Module
 * Core Module: Select Class/Subject/Date -> Load Roster -> Mark/Correct -> Batch Save
 * Document ID: ${studentId}_${classId}_${subjectId}_${attendanceDate}
 * Path: users/{teacherUid}/attendance/{attendanceDocId}
 */

import { db } from './firebase-config.js';
import { requireAuth } from './auth.js';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  showToast,
  escapeHTML,
  formatDate,
  getTodayDateString,
  generateDeterministicId
} from './utils.js';

let currentUser = null;
let currentClasses = [];
let currentSubjects = [];
let currentRoster = []; // Array of student objects with current attendance status
let isEditingExisting = false;

// UI Elements - Selection Bar
const filterForm = document.getElementById('attendance-filter-form');
const classSelect = document.getElementById('att-class');
const subjectSelect = document.getElementById('att-subject');
const dateInput = document.getElementById('att-date');
const btnLoadAttendance = document.getElementById('btn-load-attendance');

// UI Elements - Work Station
const rosterSection = document.getElementById('attendance-roster-section');
const initialPlaceholder = document.getElementById('attendance-initial-placeholder');
const modeBanner = document.getElementById('attendance-mode-banner');
const attendanceTbody = document.getElementById('attendance-tbody');
const sessionStatusBadge = document.getElementById('session-status-badge');

// Action & Stat Elements
const btnMarkAllPresent = document.getElementById('btn-mark-all-present');
const btnMarkAllAbsent = document.getElementById('btn-mark-all-absent');
const countTotalEl = document.getElementById('count-total');
const countPresentEl = document.getElementById('count-present');
const countAbsentEl = document.getElementById('count-absent');
const countPercentageEl = document.getElementById('count-percentage');
const btnSaveAttendance = document.getElementById('btn-save-attendance');
const btnSaveAttendanceText = document.getElementById('btn-save-attendance-text');
const btnSaveAttendanceSpinner = document.getElementById('btn-save-attendance-spinner');

// Initialize with Route Guard
requireAuth(async (user) => {
  currentUser = user;

  // Set default date to today
  dateInput.value = getTodayDateString();

  setupEventListeners();
  await loadClassesAndSubjects();
});

function setupEventListeners() {
  classSelect.addEventListener('change', handleClassChange);
  filterForm.addEventListener('submit', handleLoadRoster);

  btnMarkAllPresent.addEventListener('click', () => setAllStatus('Present'));
  btnMarkAllAbsent.addEventListener('click', () => setAllStatus('Absent'));
  btnSaveAttendance.addEventListener('click', handleSaveAttendance);
}

/**
 * Fetch classes and subjects for dropdown selectors
 */
async function loadClassesAndSubjects() {
  try {
    // 1. Load Classes
    const classesRef = collection(db, 'users', currentUser.uid, 'classes');
    const classesSnap = await getDocs(query(classesRef, orderBy('name', 'asc')));
    currentClasses = [];
    classSelect.innerHTML = '<option value="">Choose Class...</option>';

    classesSnap.forEach((doc) => {
      const cls = { id: doc.id, ...doc.data() };
      currentClasses.push(cls);
      const opt = document.createElement('option');
      opt.value = cls.id;
      opt.textContent = `${cls.name} (${cls.section || 'Sec A'})`;
      classSelect.appendChild(opt);
    });

    // 2. Load Subjects
    const subjectsRef = collection(db, 'users', currentUser.uid, 'subjects');
    const subjectsSnap = await getDocs(query(subjectsRef, orderBy('name', 'asc')));
    currentSubjects = [];
    subjectsSnap.forEach((doc) => {
      currentSubjects.push({ id: doc.id, ...doc.data() });
    });
  } catch (err) {
    console.error('Error loading class/subject metadata:', err);
    showToast('Failed to load classes or subjects: ' + err.message, 'error');
  }
}

/**
 * When Class dropdown changes, filter Subject dropdown to matched class
 */
function handleClassChange() {
  const selectedClassId = classSelect.value;
  subjectSelect.innerHTML = '<option value="">Choose Subject...</option>';

  if (!selectedClassId) return;

  const filteredSubs = currentSubjects.filter((s) => s.classId === selectedClassId);

  if (filteredSubs.length === 0) {
    const opt = document.createElement('option');
    opt.value = "";
    opt.textContent = "No subjects linked to this class";
    subjectSelect.appendChild(opt);
  } else {
    filteredSubs.forEach((sub) => {
      const opt = document.createElement('option');
      opt.value = sub.id;
      opt.textContent = `${sub.name} (${sub.code})`;
      subjectSelect.appendChild(opt);
    });
  }
}

/**
 * Load student roster and check for existing attendance records for the chosen date
 */
async function handleLoadRoster(e) {
  e.preventDefault();

  const classId = classSelect.value;
  const subjectId = subjectSelect.value;
  const attendanceDate = dateInput.value;

  if (!classId || !subjectId || !attendanceDate) {
    showToast('Please select Class, Subject, and Date', 'warning');
    return;
  }

  btnLoadAttendance.disabled = true;
  btnLoadAttendance.innerHTML = '<span class="spinner"></span> Loading...';

  try {
    // 1. Fetch Students enrolled in this class
    const studentsRef = collection(db, 'users', currentUser.uid, 'students');
    const qStudents = query(studentsRef, where('classId', '==', classId));
    const studentsSnap = await getDocs(qStudents);

    if (studentsSnap.empty) {
      showToast('No students found in the selected class. Please add students first!', 'warning');
      rosterSection.style.display = 'none';
      initialPlaceholder.style.display = 'block';
      return;
    }

    const students = [];
    studentsSnap.forEach((doc) => {
      students.push({ id: doc.id, ...doc.data() });
    });

    // Sort students by numeric roll number or string roll number
    students.sort((a, b) => {
      const numA = parseInt(a.rollNumber, 10);
      const numB = parseInt(b.rollNumber, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return String(a.rollNumber).localeCompare(String(b.rollNumber));
    });

    // 2. Check if attendance was already recorded for this (classId, subjectId, attendanceDate)
    const attendanceRef = collection(db, 'users', currentUser.uid, 'attendance');
    const qAttendance = query(
      attendanceRef,
      where('classId', '==', classId),
      where('subjectId', '==', subjectId),
      where('attendanceDate', '==', attendanceDate)
    );
    const attendanceSnap = await getDocs(qAttendance);

    const savedAttendanceMap = {};
    attendanceSnap.forEach((doc) => {
      const data = doc.data();
      if (data.studentId) {
        savedAttendanceMap[data.studentId] = data.status;
      }
    });

    isEditingExisting = !attendanceSnap.empty;

    // 3. Construct current roster status
    currentRoster = students.map((stu) => {
      // If previous record exists, use that status; otherwise default to 'Present'
      const status = savedAttendanceMap[stu.id] || 'Present';
      return {
        ...stu,
        currentStatus: status,
        previouslySaved: Boolean(savedAttendanceMap[stu.id])
      };
    });

    renderModeBanner(attendanceDate, isEditingExisting);
    renderRosterTable();
    updateLiveMetrics();

    initialPlaceholder.style.display = 'none';
    rosterSection.style.display = 'block';
    sessionStatusBadge.textContent = isEditingExisting ? 'Edit Mode' : 'New Session';
  } catch (err) {
    console.error('Error fetching attendance roster:', err);
    showToast('Failed to load roster: ' + err.message, 'error');
  } finally {
    btnLoadAttendance.disabled = false;
    btnLoadAttendance.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Load Student Roster';
  }
}

function renderModeBanner(date, isEditing) {
  modeBanner.style.display = 'block';
  if (isEditing) {
    modeBanner.style.backgroundColor = 'var(--warning-light)';
    modeBanner.style.border = '1px solid var(--warning-border)';
    modeBanner.style.color = 'var(--warning-hover)';
    modeBanner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <i class="fa-solid fa-pen-to-square" style="font-size: 1.25rem;"></i>
        <div>
          <strong>Editing Previously Saved Attendance</strong> &bull;
          Attendance for <strong>${formatDate(date)}</strong> has already been recorded. Any modifications made now will correct existing cloud records.
        </div>
      </div>
    `;
  } else {
    modeBanner.style.backgroundColor = 'var(--primary-light)';
    modeBanner.style.border = '1px solid var(--primary-border)';
    modeBanner.style.color = 'var(--primary-hover)';
    modeBanner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <i class="fa-solid fa-circle-check" style="font-size: 1.25rem;"></i>
        <div>
          <strong>New Attendance Session</strong> &bull;
          Recording fresh attendance for <strong>${formatDate(date)}</strong>. All students are set to Present by default.
        </div>
      </div>
    `;
  }
}

function renderRosterTable() {
  attendanceTbody.innerHTML = currentRoster.map((student, idx) => `
    <tr data-student-id="${student.id}">
      <td>
        <span class="badge badge-primary" style="font-family: monospace; font-size: 0.85rem; font-weight: 700;">
          ${escapeHTML(student.rollNumber || 'N/A')}
        </span>
      </td>
      <td>
        <strong style="color: var(--text-main);">${escapeHTML(student.name)}</strong>
      </td>
      <td>
        ${student.email ? `<span class="text-secondary" style="font-size: 0.85rem;">${escapeHTML(student.email)}</span>` : '<span class="text-muted" style="font-size: 0.85rem;">-</span>'}
      </td>
      <td style="text-align: center;">
        <div class="attendance-toggle-group">
          <button type="button" class="toggle-option present ${student.currentStatus === 'Present' ? 'active' : ''}" data-status="Present" data-student-id="${student.id}">
            <i class="fa-solid fa-check"></i> Present
          </button>
          <button type="button" class="toggle-option absent ${student.currentStatus === 'Absent' ? 'active' : ''}" data-status="Absent" data-student-id="${student.id}">
            <i class="fa-solid fa-xmark"></i> Absent
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  // Attach status toggle listeners
  attendanceTbody.querySelectorAll('.toggle-option').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const studentId = btn.dataset.studentId;
      const targetStatus = btn.dataset.status;
      setStudentStatus(studentId, targetStatus);
    });
  });
}

/**
 * Toggle individual student status
 */
function setStudentStatus(studentId, status) {
  const student = currentRoster.find((s) => s.id === studentId);
  if (!student) return;

  student.currentStatus = status;

  // Update button active classes in DOM without full table re-render
  const row = attendanceTbody.querySelector(`tr[data-student-id="${studentId}"]`);
  if (row) {
    const presentBtn = row.querySelector('.toggle-option.present');
    const absentBtn = row.querySelector('.toggle-option.absent');

    if (status === 'Present') {
      presentBtn.classList.add('active');
      absentBtn.classList.remove('active');
    } else {
      presentBtn.classList.remove('active');
      absentBtn.classList.add('active');
    }
  }

  updateLiveMetrics();
}

/**
 * Bulk set all students to Present or Absent
 */
function setAllStatus(status) {
  currentRoster.forEach((student) => {
    student.currentStatus = status;
  });

  // Update UI toggles
  attendanceTbody.querySelectorAll('.toggle-option.present').forEach((btn) => {
    btn.classList.toggle('active', status === 'Present');
  });
  attendanceTbody.querySelectorAll('.toggle-option.absent').forEach((btn) => {
    btn.classList.toggle('active', status === 'Absent');
  });

  updateLiveMetrics();
  showToast(`Marked all ${currentRoster.length} students as ${status}`, 'info');
}

/**
 * Recalculate Live Metrics (Present, Absent, Attendance %)
 */
function updateLiveMetrics() {
  const total = currentRoster.length;
  const presentCount = currentRoster.filter((s) => s.currentStatus === 'Present').length;
  const absentCount = total - presentCount;
  const percentage = total > 0 ? Math.round((presentCount / total) * 100) : 0;

  countTotalEl.textContent = total;
  countPresentEl.textContent = presentCount;
  countAbsentEl.textContent = absentCount;
  countPercentageEl.textContent = `${percentage}%`;
}

/**
 * Batch Save Attendance to Firestore
 * Uses Deterministic Doc ID: ${studentId}_${classId}_${subjectId}_${attendanceDate}
 */
async function handleSaveAttendance() {
  if (currentRoster.length === 0) {
    showToast('No students loaded in roster to save', 'warning');
    return;
  }

  const classId = classSelect.value;
  const subjectId = subjectSelect.value;
  const attendanceDate = dateInput.value;

  btnSaveAttendance.disabled = true;
  btnSaveAttendanceText.style.display = 'none';
  btnSaveAttendanceSpinner.style.display = 'inline-block';

  try {
    const batch = writeBatch(db);

    currentRoster.forEach((student) => {
      // Deterministic document ID to strictly prevent duplicates
      const docId = generateDeterministicId(student.id, classId, subjectId, attendanceDate);
      const attDocRef = doc(db, 'users', currentUser.uid, 'attendance', docId);

      const record = {
        studentId: student.id,
        studentName: student.name,
        rollNumber: student.rollNumber,
        classId: classId,
        subjectId: subjectId,
        attendanceDate: attendanceDate,
        status: student.currentStatus,
        teacherUid: currentUser.uid,
        updatedAt: serverTimestamp()
      };

      // If creating new record, include createdAt
      if (!student.previouslySaved) {
        record.createdAt = serverTimestamp();
      }

      batch.set(attDocRef, record, { merge: true });
    });

    // Commit all updates atomically in a single batch
    await batch.commit();

    showToast(`Attendance saved successfully for ${currentRoster.length} students!`, 'success');

    // Mark all as previously saved
    currentRoster.forEach((s) => (s.previouslySaved = true));
    isEditingExisting = true;
    renderModeBanner(attendanceDate, true);
    sessionStatusBadge.textContent = 'Saved to Cloud';
  } catch (err) {
    console.error('Error saving batch attendance:', err);
    showToast('Failed to save attendance: ' + err.message, 'error');
  } finally {
    btnSaveAttendance.disabled = false;
    btnSaveAttendanceText.style.display = 'inline-flex';
    btnSaveAttendanceSpinner.style.display = 'none';
  }
}
