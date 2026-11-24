/**
 * Class Management Module (CRUD with Safe Deletion)
 * Namespace: users/{teacherUid}/classes/{classId}
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
let currentClasses = [];
let classToDelete = null;

// UI Elements
const classesTbody = document.getElementById('classes-tbody');
const classCountBadge = document.getElementById('class-count-badge');
const btnOpenAddClass = document.getElementById('btn-open-add-class');
const classModalBackdrop = document.getElementById('class-modal-backdrop');
const btnCloseClassModal = document.getElementById('btn-close-class-modal');
const btnCancelClass = document.getElementById('btn-cancel-class');
const classForm = document.getElementById('class-form');
const classModalTitle = document.getElementById('class-modal-title');
const classDocIdInput = document.getElementById('class-doc-id');
const classNameInput = document.getElementById('class-name');
const classSectionInput = document.getElementById('class-section');
const classYearInput = document.getElementById('class-year');
const btnSaveClass = document.getElementById('btn-save-class');
const btnSaveClassText = document.getElementById('btn-save-class-text');
const btnSaveClassSpinner = document.getElementById('btn-save-class-spinner');

// Delete Modal Elements
const deleteClassBackdrop = document.getElementById('delete-class-backdrop');
const btnCloseDeleteClass = document.getElementById('btn-close-delete-class');
const btnCancelDeleteClass = document.getElementById('btn-cancel-delete-class');
const btnConfirmDeleteClass = document.getElementById('btn-confirm-delete-class');
const deleteClassName = document.getElementById('delete-class-name');
const deleteClassWarning = document.getElementById('delete-class-warning');

// Initialize Module with Route Protection
requireAuth(async (user) => {
  currentUser = user;
  setupEventListeners();
  await loadClasses();
});

function setupEventListeners() {
  btnOpenAddClass.addEventListener('click', () => openClassModal());
  btnCloseClassModal.addEventListener('click', closeClassModal);
  btnCancelClass.addEventListener('click', closeClassModal);
  classForm.addEventListener('submit', handleSaveClass);

  btnCloseDeleteClass.addEventListener('click', closeDeleteModal);
  btnCancelDeleteClass.addEventListener('click', closeDeleteModal);
  btnConfirmDeleteClass.addEventListener('click', handleConfirmDelete);
}

function openClassModal(classData = null) {
  if (classData) {
    classModalTitle.textContent = 'Edit Class';
    classDocIdInput.value = classData.id;
    classNameInput.value = classData.name || '';
    classSectionInput.value = classData.section || '';
    classYearInput.value = classData.year || '';
    btnSaveClassText.textContent = 'Update Class';
  } else {
    classModalTitle.textContent = 'Create New Class';
    classDocIdInput.value = '';
    classForm.reset();
    classYearInput.value = new Date().getFullYear() + '-' + (new Date().getFullYear() + 1);
    btnSaveClassText.textContent = 'Save Class';
  }
  classModalBackdrop.classList.add('show');
  classNameInput.focus();
}

function closeClassModal() {
  classModalBackdrop.classList.remove('show');
  classForm.reset();
  classDocIdInput.value = '';
}

function closeDeleteModal() {
  deleteClassBackdrop.classList.remove('show');
  classToDelete = null;
}

/**
 * Fetch classes from Firestore and compute student count per class
 */
export async function loadClasses() {
  classesTbody.innerHTML = `
    <tr>
      <td colspan="6" class="text-center" style="padding: 40px;">
        <div class="spinner spinner-primary"></div>
        <div style="margin-top: 10px; color: var(--text-secondary);">Loading classes from Firestore...</div>
      </td>
    </tr>
  `;

  try {
    const classesRef = collection(db, 'users', currentUser.uid, 'classes');
    const classesSnap = await getDocs(query(classesRef, orderBy('createdAt', 'desc')));

    // Also get all students to map enrollment counts
    const studentsRef = collection(db, 'users', currentUser.uid, 'students');
    const studentsSnap = await getDocs(studentsRef);
    const studentCountMap = {};
    studentsSnap.forEach((doc) => {
      const data = doc.data();
      if (data.classId) {
        studentCountMap[data.classId] = (studentCountMap[data.classId] || 0) + 1;
      }
    });

    currentClasses = [];
    classesSnap.forEach((doc) => {
      currentClasses.push({
        id: doc.id,
        studentCount: studentCountMap[doc.id] || 0,
        ...doc.data()
      });
    });

    renderClassesTable();
  } catch (err) {
    console.error('Error loading classes:', err);
    classesTbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center" style="padding: 30px; color: var(--danger);">
          <i class="fa-solid fa-circle-exclamation"></i> Failed to load classes: ${escapeHTML(err.message)}
        </td>
      </tr>
    `;
    showToast('Failed to load classes from cloud: ' + err.message, 'error');
  }
}

function renderClassesTable() {
  classCountBadge.textContent = currentClasses.length;

  if (currentClasses.length === 0) {
    classesTbody.innerHTML = `
      <tr>
        <td colspan="6" style="padding: 0;">
          <div class="empty-state">
            <div class="empty-state-icon">
              <i class="fa-solid fa-chalkboard"></i>
            </div>
            <div class="empty-state-title">No Classes Created Yet</div>
            <p class="empty-state-desc">
              Create your first class (e.g. "Grade 10 - Section A") to start adding students and taking attendance.
            </p>
            <button class="btn btn-primary btn-sm" id="btn-empty-add-class">
              <i class="fa-solid fa-plus"></i> Create First Class
            </button>
          </div>
        </td>
      </tr>
    `;
    document.getElementById('btn-empty-add-class')?.addEventListener('click', () => openClassModal());
    return;
  }

  classesTbody.innerHTML = currentClasses.map((cls) => `
    <tr>
      <td>
        <strong>${escapeHTML(cls.name)}</strong>
      </td>
      <td>
        <span class="badge badge-primary">Section ${escapeHTML(cls.section || 'A')}</span>
      </td>
      <td>${escapeHTML(cls.year || 'N/A')}</td>
      <td>
        <span class="badge ${cls.studentCount > 0 ? 'badge-success' : 'badge-secondary'}">
          <i class="fa-solid fa-user-graduate"></i> ${cls.studentCount} Students
        </span>
      </td>
      <td class="text-secondary" style="font-size: 0.825rem;">
        ${formatDate(cls.createdAt?.toDate ? cls.createdAt.toDate().toISOString() : cls.createdAt)}
      </td>
      <td style="text-align: right;">
        <button class="btn btn-secondary btn-sm btn-edit-class" data-id="${cls.id}" title="Edit Class">
          <i class="fa-solid fa-pen-to-square"></i> Edit
        </button>
        <button class="btn btn-outline-danger btn-sm btn-delete-class" data-id="${cls.id}" title="Delete Class" style="margin-left: 6px;">
          <i class="fa-solid fa-trash"></i> Delete
        </button>
      </td>
    </tr>
  `).join('');

  // Attach button events
  classesTbody.querySelectorAll('.btn-edit-class').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cls = currentClasses.find((c) => c.id === btn.dataset.id);
      if (cls) openClassModal(cls);
    });
  });

  classesTbody.querySelectorAll('.btn-delete-class').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cls = currentClasses.find((c) => c.id === btn.dataset.id);
      if (cls) promptDeleteClass(cls);
    });
  });
}

/**
 * Handle Add/Edit class submission
 */
async function handleSaveClass(e) {
  e.preventDefault();

  const name = classNameInput.value.trim();
  const section = classSectionInput.value.trim();
  const year = classYearInput.value.trim();
  const docId = classDocIdInput.value;

  if (!name || !section || !year) {
    showToast('Please fill out all required fields', 'warning');
    return;
  }

  btnSaveClass.disabled = true;
  btnSaveClassText.style.display = 'none';
  btnSaveClassSpinner.style.display = 'inline-block';

  try {
    const classData = {
      name,
      section,
      year,
      teacherUid: currentUser.uid,
      updatedAt: serverTimestamp()
    };

    if (docId) {
      // Update existing class
      const classRef = doc(db, 'users', currentUser.uid, 'classes', docId);
      await updateDoc(classRef, classData);
      showToast(`Class "${name}" updated successfully!`, 'success');
    } else {
      // Create new class
      classData.createdAt = serverTimestamp();
      const classesRef = collection(db, 'users', currentUser.uid, 'classes');
      await addDoc(classesRef, classData);
      showToast(`Class "${name}" created successfully!`, 'success');
    }

    closeClassModal();
    await loadClasses();
  } catch (err) {
    console.error('Error saving class:', err);
    showToast('Failed to save class: ' + err.message, 'error');
  } finally {
    btnSaveClass.disabled = false;
    btnSaveClassText.style.display = 'inline-flex';
    btnSaveClassSpinner.style.display = 'none';
  }
}

/**
 * Safe Deletion check before removing a class
 */
async function promptDeleteClass(cls) {
  classToDelete = cls;
  deleteClassName.textContent = `${cls.name} (${cls.section})`;

  // Check if class has registered students
  if (cls.studentCount > 0) {
    deleteClassWarning.innerHTML = `
      <div style="background-color: var(--danger-light); color: var(--danger); padding: 10px 14px; border-radius: var(--radius-md); border: 1px solid var(--danger-border);">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <strong>Warning:</strong> This class contains <strong>${cls.studentCount} student(s)</strong>.
        Deleting this class will leave these students without an assigned class.
      </div>
    `;
  } else {
    deleteClassWarning.innerHTML = `
      <div class="text-secondary">
        This class currently has 0 enrolled students and can be deleted safely.
      </div>
    `;
  }

  deleteClassBackdrop.classList.add('show');
}

async function handleConfirmDelete() {
  if (!classToDelete) return;

  btnConfirmDeleteClass.disabled = true;
  btnConfirmDeleteClass.innerHTML = '<span class="spinner"></span> Deleting...';

  try {
    const classRef = doc(db, 'users', currentUser.uid, 'classes', classToDelete.id);
    await deleteDoc(classRef);
    showToast(`Class "${classToDelete.name}" deleted successfully`, 'info');
    closeDeleteModal();
    await loadClasses();
  } catch (err) {
    console.error('Error deleting class:', err);
    showToast('Failed to delete class: ' + err.message, 'error');
  } finally {
    btnConfirmDeleteClass.disabled = false;
    btnConfirmDeleteClass.innerHTML = '<i class="fa-solid fa-trash"></i> Delete Class';
  }
}
