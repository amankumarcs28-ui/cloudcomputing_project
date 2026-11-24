/**
 * Subject Management Module
 * Namespace: users/{teacherUid}/subjects/{subjectId}
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
  orderBy,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { showToast, escapeHTML, formatDate } from './utils.js';

let currentUser = null;
let currentSubjects = [];
let availableClasses = [];
let subjectToDelete = null;

// UI Elements
const subjectsTbody = document.getElementById('subjects-tbody');
const subjectCountBadge = document.getElementById('subject-count-badge');
const btnOpenAddSubject = document.getElementById('btn-open-add-subject');
const subjectModalBackdrop = document.getElementById('subject-modal-backdrop');
const btnCloseSubjectModal = document.getElementById('btn-close-subject-modal');
const btnCancelSubject = document.getElementById('btn-cancel-subject');
const subjectForm = document.getElementById('subject-form');
const subjectModalTitle = document.getElementById('subject-modal-title');
const subjectDocIdInput = document.getElementById('subject-doc-id');
const subjectNameInput = document.getElementById('subject-name');
const subjectCodeInput = document.getElementById('subject-code');
const subjectClassSelect = document.getElementById('subject-class');
const btnSaveSubject = document.getElementById('btn-save-subject');
const btnSaveSubjectText = document.getElementById('btn-save-subject-text');
const btnSaveSubjectSpinner = document.getElementById('btn-save-subject-spinner');

// Delete Modal Elements
const deleteSubjectBackdrop = document.getElementById('delete-subject-backdrop');
const btnCloseDeleteSubject = document.getElementById('btn-close-delete-subject');
const btnCancelDeleteSubject = document.getElementById('btn-cancel-delete-subject');
const btnConfirmDeleteSubject = document.getElementById('btn-confirm-delete-subject');
const deleteSubjectName = document.getElementById('delete-subject-name');

// Initialize Module with Route Protection
requireAuth(async (user) => {
  currentUser = user;
  setupEventListeners();
  await loadClassesForDropdown();
  await loadSubjects();
});

function setupEventListeners() {
  btnOpenAddSubject.addEventListener('click', () => openSubjectModal());
  btnCloseSubjectModal.addEventListener('click', closeSubjectModal);
  btnCancelSubject.addEventListener('click', closeSubjectModal);
  subjectForm.addEventListener('submit', handleSaveSubject);

  btnCloseDeleteSubject.addEventListener('click', closeDeleteModal);
  btnCancelDeleteSubject.addEventListener('click', closeDeleteModal);
  btnConfirmDeleteSubject.addEventListener('click', handleConfirmDelete);
}

/**
 * Fetch classes to populate the Class dropdown in the modal
 */
async function loadClassesForDropdown() {
  try {
    const classesRef = collection(db, 'users', currentUser.uid, 'classes');
    const classesSnap = await getDocs(query(classesRef, orderBy('name', 'asc')));
    availableClasses = [];
    subjectClassSelect.innerHTML = '<option value="">Select a Class...</option>';

    classesSnap.forEach((doc) => {
      const data = doc.data();
      const cls = { id: doc.id, ...data };
      availableClasses.push(cls);
      const option = document.createElement('option');
      option.value = cls.id;
      option.textContent = `${cls.name} (${cls.section || 'Sec A'})`;
      subjectClassSelect.appendChild(option);
    });
  } catch (err) {
    console.error('Error loading classes for subject dropdown:', err);
  }
}

function openSubjectModal(subjectData = null) {
  if (availableClasses.length === 0) {
    showToast('Please create at least one Class before adding subjects!', 'warning');
    setTimeout(() => {
      if (confirm('No classes found. Would you like to create a class now?')) {
        window.location.href = 'classes.html';
      }
    }, 200);
    return;
  }

  if (subjectData) {
    subjectModalTitle.textContent = 'Edit Subject';
    subjectDocIdInput.value = subjectData.id;
    subjectNameInput.value = subjectData.name || '';
    subjectCodeInput.value = subjectData.code || '';
    subjectClassSelect.value = subjectData.classId || '';
    btnSaveSubjectText.textContent = 'Update Subject';
  } else {
    subjectModalTitle.textContent = 'Create New Subject';
    subjectDocIdInput.value = '';
    subjectForm.reset();
    btnSaveSubjectText.textContent = 'Save Subject';
  }

  subjectModalBackdrop.classList.add('show');
  subjectNameInput.focus();
}

function closeSubjectModal() {
  subjectModalBackdrop.classList.remove('show');
  subjectForm.reset();
  subjectDocIdInput.value = '';
}

function closeDeleteModal() {
  deleteSubjectBackdrop.classList.remove('show');
  subjectToDelete = null;
}

/**
 * Load subjects from Firestore
 */
export async function loadSubjects() {
  subjectsTbody.innerHTML = `
    <tr>
      <td colspan="5" class="text-center" style="padding: 40px;">
        <div class="spinner spinner-primary"></div>
        <div style="margin-top: 10px; color: var(--text-secondary);">Loading subjects from Firestore...</div>
      </td>
    </tr>
  `;

  try {
    const subjectsRef = collection(db, 'users', currentUser.uid, 'subjects');
    const subjectsSnap = await getDocs(query(subjectsRef, orderBy('createdAt', 'desc')));

    currentSubjects = [];
    subjectsSnap.forEach((doc) => {
      currentSubjects.push({ id: doc.id, ...doc.data() });
    });

    renderSubjectsTable();
  } catch (err) {
    console.error('Error loading subjects:', err);
    subjectsTbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center" style="padding: 30px; color: var(--danger);">
          <i class="fa-solid fa-circle-exclamation"></i> Failed to load subjects: ${escapeHTML(err.message)}
        </td>
      </tr>
    `;
    showToast('Failed to load subjects: ' + err.message, 'error');
  }
}

function renderSubjectsTable() {
  subjectCountBadge.textContent = currentSubjects.length;

  if (currentSubjects.length === 0) {
    subjectsTbody.innerHTML = `
      <tr>
        <td colspan="5" style="padding: 0;">
          <div class="empty-state">
            <div class="empty-state-icon">
              <i class="fa-solid fa-book-open"></i>
            </div>
            <div class="empty-state-title">No Subjects Added Yet</div>
            <p class="empty-state-desc">
              Define the subjects or courses (e.g. Mathematics, CS101, Physics) for which you take attendance.
            </p>
            <button class="btn btn-primary btn-sm" id="btn-empty-add-subject">
              <i class="fa-solid fa-plus"></i> Add First Subject
            </button>
          </div>
        </td>
      </tr>
    `;
    document.getElementById('btn-empty-add-subject')?.addEventListener('click', () => openSubjectModal());
    return;
  }

  // Create class lookup map
  const classMap = {};
  availableClasses.forEach((c) => {
    classMap[c.id] = `${c.name} (${c.section || 'A'})`;
  });

  subjectsTbody.innerHTML = currentSubjects.map((sub) => {
    const className = classMap[sub.classId] || sub.className || 'General Class';
    return `
      <tr>
        <td>
          <span class="badge badge-primary" style="font-family: monospace; font-size: 0.85rem;">
            ${escapeHTML(sub.code || 'SUB')}
          </span>
        </td>
        <td>
          <strong>${escapeHTML(sub.name)}</strong>
        </td>
        <td>
          <span class="badge badge-secondary">
            <i class="fa-solid fa-chalkboard"></i> ${escapeHTML(className)}
          </span>
        </td>
        <td class="text-secondary" style="font-size: 0.825rem;">
          ${formatDate(sub.createdAt?.toDate ? sub.createdAt.toDate().toISOString() : sub.createdAt)}
        </td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-sm btn-edit-subject" data-id="${sub.id}" title="Edit Subject">
            <i class="fa-solid fa-pen-to-square"></i> Edit
          </button>
          <button class="btn btn-outline-danger btn-sm btn-delete-subject" data-id="${sub.id}" title="Delete Subject" style="margin-left: 6px;">
            <i class="fa-solid fa-trash"></i> Delete
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Attach button events
  subjectsTbody.querySelectorAll('.btn-edit-subject').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sub = currentSubjects.find((s) => s.id === btn.dataset.id);
      if (sub) openSubjectModal(sub);
    });
  });

  subjectsTbody.querySelectorAll('.btn-delete-subject').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sub = currentSubjects.find((s) => s.id === btn.dataset.id);
      if (sub) promptDeleteSubject(sub);
    });
  });
}

/**
 * Handle Save/Edit Subject
 */
async function handleSaveSubject(e) {
  e.preventDefault();

  const name = subjectNameInput.value.trim();
  const code = subjectCodeInput.value.trim().toUpperCase();
  const classId = subjectClassSelect.value;
  const docId = subjectDocIdInput.value;

  if (!name || !code || !classId) {
    showToast('Please fill out all required fields', 'warning');
    return;
  }

  const selectedClass = availableClasses.find((c) => c.id === classId);
  const className = selectedClass ? `${selectedClass.name} (${selectedClass.section})` : '';

  btnSaveSubject.disabled = true;
  btnSaveSubjectText.style.display = 'none';
  btnSaveSubjectSpinner.style.display = 'inline-block';

  try {
    const subjectData = {
      name,
      code,
      classId,
      className,
      teacherUid: currentUser.uid,
      updatedAt: serverTimestamp()
    };

    if (docId) {
      const subRef = doc(db, 'users', currentUser.uid, 'subjects', docId);
      await updateDoc(subRef, subjectData);
      showToast(`Subject "${name}" updated successfully!`, 'success');
    } else {
      subjectData.createdAt = serverTimestamp();
      const subsRef = collection(db, 'users', currentUser.uid, 'subjects');
      await addDoc(subsRef, subjectData);
      showToast(`Subject "${name}" added successfully!`, 'success');
    }

    closeSubjectModal();
    await loadSubjects();
  } catch (err) {
    console.error('Error saving subject:', err);
    showToast('Failed to save subject: ' + err.message, 'error');
  } finally {
    btnSaveSubject.disabled = false;
    btnSaveSubjectText.style.display = 'inline-flex';
    btnSaveSubjectSpinner.style.display = 'none';
  }
}

function promptDeleteSubject(sub) {
  subjectToDelete = sub;
  deleteSubjectName.textContent = `${sub.name} (${sub.code})`;
  deleteSubjectBackdrop.classList.add('show');
}

async function handleConfirmDelete() {
  if (!subjectToDelete) return;

  btnConfirmDeleteSubject.disabled = true;
  btnConfirmDeleteSubject.innerHTML = '<span class="spinner"></span> Deleting...';

  try {
    const subRef = doc(db, 'users', currentUser.uid, 'subjects', subjectToDelete.id);
    await deleteDoc(subRef);
    showToast(`Subject "${subjectToDelete.name}" deleted successfully`, 'info');
    closeDeleteModal();
    await loadSubjects();
  } catch (err) {
    console.error('Error deleting subject:', err);
    showToast('Failed to delete subject: ' + err.message, 'error');
  } finally {
    btnConfirmDeleteSubject.disabled = false;
    btnConfirmDeleteSubject.innerHTML = '<i class="fa-solid fa-trash"></i> Delete';
  }
}
