/**
 * Student Management Module (Full CRUD with Duplicate Roll Number Validation)
 * Namespace: users/{teacherUid}/students/{studentId}
 */

import { db } from './firebase-config.js';
import { requireAuth } from './auth.js';
import {
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { showToast, escapeHTML, formatDate } from './utils.js';

let currentUser = null;
let currentStudents = [];
let availableClasses = [];
let studentToDelete = null;

// UI Elements
const studentsTbody = document.getElementById('students-tbody');
const studentCountBadge = document.getElementById('student-count-badge');
const searchInput = document.getElementById('search-students');
const filterClassSelect = document.getElementById('filter-class');

// Modal Elements
const btnOpenAddStudent = document.getElementById('btn-open-add-student');
const studentModalBackdrop = document.getElementById('student-modal-backdrop');
const btnCloseStudentModal = document.getElementById('btn-close-student-modal');
const btnCancelStudent = document.getElementById('btn-cancel-student');
const studentForm = document.getElementById('student-form');
const studentModalTitle = document.getElementById('student-modal-title');
const studentDocIdInput = document.getElementById('student-doc-id');
const studentNameInput = document.getElementById('student-name');
const studentClassSelect = document.getElementById('student-class');
const studentRollInput = document.getElementById('student-roll');
const studentEmailInput = document.getElementById('student-email');
const btnSaveStudent = document.getElementById('btn-save-student');
const btnSaveStudentText = document.getElementById('btn-save-student-text');
const btnSaveStudentSpinner = document.getElementById('btn-save-student-spinner');

// Delete Modal Elements
const deleteModalBackdrop = document.getElementById('delete-modal-backdrop');
const btnCloseDeleteModal = document.getElementById('btn-close-delete-modal');
const btnCancelDelete = document.getElementById('btn-cancel-delete');
const btnConfirmDelete = document.getElementById('btn-confirm-delete');
const deleteStudentName = document.getElementById('delete-student-name');

// Initialize with Route Guard
requireAuth(async (user) => {
  currentUser = user;
  setupEventListeners();
  await loadClasses();
  await loadStudents();
});

function setupEventListeners() {
  btnOpenAddStudent.addEventListener('click', () => openStudentModal());
  btnCloseStudentModal.addEventListener('click', closeStudentModal);
  btnCancelStudent.addEventListener('click', closeStudentModal);
  studentForm.addEventListener('submit', handleSaveStudent);

  btnCloseDeleteModal.addEventListener('click', closeDeleteModal);
  btnCancelDelete.addEventListener('click', closeDeleteModal);
  btnConfirmDelete.addEventListener('click', handleConfirmDelete);

  // Search & Filter listeners
  searchInput.addEventListener('input', renderFilteredStudents);
  filterClassSelect.addEventListener('change', renderFilteredStudents);
}

/**
 * Load classes for filter dropdown and modal select
 */
async function loadClasses() {
  try {
    const classesRef = collection(db, 'users', currentUser.uid, 'classes');
    const classesSnap = await getDocs(query(classesRef, orderBy('name', 'asc')));

    availableClasses = [];
    studentClassSelect.innerHTML = '<option value="">Select a Class...</option>';
    filterClassSelect.innerHTML = '<option value="">All Classes</option>';

    classesSnap.forEach((doc) => {
      const cls = { id: doc.id, ...doc.data() };
      availableClasses.push(cls);

      const label = `${cls.name} (${cls.section || 'Sec A'})`;

      // Modal option
      const optModal = document.createElement('option');
      optModal.value = cls.id;
      optModal.textContent = label;
      studentClassSelect.appendChild(optModal);

      // Filter option
      const optFilter = document.createElement('option');
      optFilter.value = cls.id;
      optFilter.textContent = label;
      filterClassSelect.appendChild(optFilter);
    });
  } catch (err) {
    console.error('Error loading classes:', err);
  }
}

function openStudentModal(studentData = null) {
  if (availableClasses.length === 0) {
    showToast('Please create a Class before adding students!', 'warning');
    setTimeout(() => {
      if (confirm('No classes found. Would you like to create a class now?')) {
        window.location.href = 'classes.html';
      }
    }, 200);
    return;
  }

  if (studentData) {
    studentModalTitle.textContent = 'Edit Student Record';
    studentDocIdInput.value = studentData.id;
    studentNameInput.value = studentData.name || '';
    studentClassSelect.value = studentData.classId || '';
    studentRollInput.value = studentData.rollNumber || '';
    studentEmailInput.value = studentData.email || '';
    btnSaveStudentText.textContent = 'Update Student';
  } else {
    studentModalTitle.textContent = 'Add New Student';
    studentDocIdInput.value = '';
    studentForm.reset();
    btnSaveStudentText.textContent = 'Save Student';
  }

  studentModalBackdrop.classList.add('show');
  studentNameInput.focus();
}

function closeStudentModal() {
  studentModalBackdrop.classList.remove('show');
  studentForm.reset();
  studentDocIdInput.value = '';
}

function closeDeleteModal() {
  deleteModalBackdrop.classList.remove('show');
  studentToDelete = null;
}

/**
 * Fetch students from Firestore
 */
export async function loadStudents() {
  studentsTbody.innerHTML = `
    <tr>
      <td colspan="6" class="text-center" style="padding: 40px;">
        <div class="spinner spinner-primary"></div>
        <div style="margin-top: 10px; color: var(--text-secondary);">Loading students from Firestore...</div>
      </td>
    </tr>
  `;

  try {
    const studentsRef = collection(db, 'users', currentUser.uid, 'students');
    const studentsSnap = await getDocs(query(studentsRef, orderBy('createdAt', 'desc')));

    currentStudents = [];
    studentsSnap.forEach((doc) => {
      currentStudents.push({ id: doc.id, ...doc.data() });
    });

    renderFilteredStudents();
  } catch (err) {
    console.error('Error loading students:', err);
    studentsTbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center" style="padding: 30px; color: var(--danger);">
          <i class="fa-solid fa-circle-exclamation"></i> Failed to load students: ${escapeHTML(err.message)}
        </td>
      </tr>
    `;
    showToast('Failed to load students: ' + err.message, 'error');
  }
}

/**
 * Render students with active search query and class filter
 */
function renderFilteredStudents() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const selectedClassId = filterClassSelect.value;

  const filtered = currentStudents.filter((student) => {
    const matchesClass = !selectedClassId || student.classId === selectedClassId;
    const matchesSearch =
      !searchTerm ||
      (student.name && student.name.toLowerCase().includes(searchTerm)) ||
      (student.rollNumber && String(student.rollNumber).toLowerCase().includes(searchTerm)) ||
      (student.email && student.email.toLowerCase().includes(searchTerm));

    return matchesClass && matchesSearch;
  });

  studentCountBadge.textContent = filtered.length;

  if (filtered.length === 0) {
    studentsTbody.innerHTML = `
      <tr>
        <td colspan="6" style="padding: 0;">
          <div class="empty-state">
            <div class="empty-state-icon">
              <i class="fa-solid fa-user-graduate"></i>
            </div>
            <div class="empty-state-title">No Students Found</div>
            <p class="empty-state-desc">
              ${searchTerm || selectedClassId ? 'No students match your current search or class filter.' : 'Add your first student to this class roster.'}
            </p>
            ${!searchTerm && !selectedClassId ? `
              <button class="btn btn-primary btn-sm" id="btn-empty-add-student">
                <i class="fa-solid fa-user-plus"></i> Add First Student
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
    document.getElementById('btn-empty-add-student')?.addEventListener('click', () => openStudentModal());
    return;
  }

  // Create class lookup map
  const classMap = {};
  availableClasses.forEach((c) => {
    classMap[c.id] = `${c.name} (${c.section || 'A'})`;
  });

  studentsTbody.innerHTML = filtered.map((s) => {
    const className = classMap[s.classId] || s.className || 'General Class';
    return `
      <tr>
        <td>
          <span class="badge badge-primary" style="font-family: monospace; font-size: 0.85rem; font-weight: 700;">
            ${escapeHTML(s.rollNumber || 'N/A')}
          </span>
        </td>
        <td>
          <div style="font-weight: 600;">${escapeHTML(s.name)}</div>
        </td>
        <td>
          <span class="badge badge-secondary">
            <i class="fa-solid fa-chalkboard"></i> ${escapeHTML(className)}
          </span>
        </td>
        <td>
          ${s.email ? `<span class="text-secondary"><i class="fa-regular fa-envelope"></i> ${escapeHTML(s.email)}</span>` : '<span class="text-muted">No Email</span>'}
        </td>
        <td class="text-secondary" style="font-size: 0.825rem;">
          ${formatDate(s.createdAt?.toDate ? s.createdAt.toDate().toISOString() : s.createdAt)}
        </td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-sm btn-edit-student" data-id="${s.id}" title="Edit Student">
            <i class="fa-solid fa-pen-to-square"></i> Edit
          </button>
          <button class="btn btn-outline-danger btn-sm btn-delete-student" data-id="${s.id}" title="Delete Student" style="margin-left: 6px;">
            <i class="fa-solid fa-trash"></i> Delete
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Attach button events
  studentsTbody.querySelectorAll('.btn-edit-student').forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = currentStudents.find((stu) => stu.id === btn.dataset.id);
      if (s) openStudentModal(s);
    });
  });

  studentsTbody.querySelectorAll('.btn-delete-student').forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = currentStudents.find((stu) => stu.id === btn.dataset.id);
      if (s) promptDeleteStudent(s);
    });
  });
}

/**
 * Handle Add/Edit Student with Duplicate Roll Number Validation
 */
async function handleSaveStudent(e) {
  e.preventDefault();

  const name = studentNameInput.value.trim();
  const classId = studentClassSelect.value;
  const rollNumber = studentRollInput.value.trim();
  const email = studentEmailInput.value.trim();
  const docId = studentDocIdInput.value;

  if (!name || !classId || !rollNumber) {
    showToast('Name, Class, and Roll Number are required!', 'warning');
    return;
  }

  // Duplicate Roll Number Check in the same class
  const duplicate = currentStudents.find(
    (s) => s.classId === classId &&
           String(s.rollNumber).toLowerCase() === rollNumber.toLowerCase() &&
           s.id !== docId
  );

  if (duplicate) {
    showToast(`Roll Number "${rollNumber}" is already registered to "${duplicate.name}" in this class!`, 'error');
    studentRollInput.focus();
    return;
  }

  const selectedClass = availableClasses.find((c) => c.id === classId);
  const className = selectedClass ? `${selectedClass.name} (${selectedClass.section})` : '';

  btnSaveStudent.disabled = true;
  btnSaveStudentText.style.display = 'none';
  btnSaveStudentSpinner.style.display = 'inline-block';

  try {
    const studentData = {
      name,
      classId,
      className,
      rollNumber,
      email: email || '',
      teacherUid: currentUser.uid,
      updatedAt: serverTimestamp()
    };

    if (docId) {
      // Update existing student
      const studentRef = doc(db, 'users', currentUser.uid, 'students', docId);
      await updateDoc(studentRef, studentData);
      showToast(`Student "${name}" updated successfully!`, 'success');
    } else {
      // Create new student
      studentData.createdAt = serverTimestamp();
      const studentsRef = collection(db, 'users', currentUser.uid, 'students');
      await addDoc(studentsRef, studentData);
      showToast(`Student "${name}" added successfully!`, 'success');
    }

    closeStudentModal();
    await loadStudents();
  } catch (err) {
    console.error('Error saving student:', err);
    showToast('Failed to save student: ' + err.message, 'error');
  } finally {
    btnSaveStudent.disabled = false;
    btnSaveStudentText.style.display = 'inline-flex';
    btnSaveStudentSpinner.style.display = 'none';
  }
}

function promptDeleteStudent(student) {
  studentToDelete = student;
  deleteStudentName.textContent = `${student.name} (Roll #${student.rollNumber})`;
  deleteModalBackdrop.classList.add('show');
}

async function handleConfirmDelete() {
  if (!studentToDelete) return;

  btnConfirmDelete.disabled = true;
  btnConfirmDelete.innerHTML = '<span class="spinner"></span> Deleting...';

  try {
    const studentRef = doc(db, 'users', currentUser.uid, 'students', studentToDelete.id);
    await deleteDoc(studentRef);
    showToast(`Student "${studentToDelete.name}" deleted from roster`, 'info');
    closeDeleteModal();
    await loadStudents();
  } catch (err) {
    console.error('Error deleting student:', err);
    showToast('Failed to delete student: ' + err.message, 'error');
  } finally {
    btnConfirmDelete.disabled = false;
    btnConfirmDelete.innerHTML = '<i class="fa-solid fa-trash"></i> Delete';
  }
}
