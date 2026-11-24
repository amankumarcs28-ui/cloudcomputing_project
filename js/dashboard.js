/**
 * Master Dashboard Module
 * Real-time dynamic Firestore analytics with Chart.js visualizations
 */

import { db } from './firebase-config.js';
import { requireAuth } from './auth.js';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  limit
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  showToast,
  escapeHTML,
  formatDate,
  getTodayDateString
} from './utils.js';

let currentUser = null;
let chartRatio = null;
let chartTrends = null;
let chartClass = null;

// UI Metric Elements
const welcomeTitle = document.getElementById('welcome-title');
const statTotalStudents = document.getElementById('stat-total-students');
const statPresentToday = document.getElementById('stat-present-today');
const statAbsentToday = document.getElementById('stat-absent-today');
const statOverallPercentage = document.getElementById('stat-overall-percentage');
const recentActivityContainer = document.getElementById('recent-activity-container');

// Initialize with Route Guard
requireAuth(async (user) => {
  currentUser = user;

  const firstName = (user.displayName || user.email || 'Teacher').split(' ')[0];
  welcomeTitle.textContent = `Welcome Back, ${firstName}!`;

  await loadDashboardAnalytics();
});

/**
 * Load all actual records from Firestore and construct dynamic Chart.js dashboards
 */
export async function loadDashboardAnalytics() {
  try {
    const todayStr = getTodayDateString();

    // 1. Fetch Total Students
    const studentsRef = collection(db, 'users', currentUser.uid, 'students');
    const studentsSnap = await getDocs(studentsRef);
    const totalStudents = studentsSnap.size;
    statTotalStudents.textContent = totalStudents;

    // 2. Fetch Classes
    const classesRef = collection(db, 'users', currentUser.uid, 'classes');
    const classesSnap = await getDocs(classesRef);
    const classesList = [];
    classesSnap.forEach((d) => classesList.push({ id: d.id, ...d.data() }));

    // 3. Fetch All Attendance Records for this Teacher
    const attendanceRef = collection(db, 'users', currentUser.uid, 'attendance');
    const attendanceSnap = await getDocs(attendanceRef);

    let totalRecordedAttendance = 0;
    let totalPresentOverall = 0;
    let presentToday = 0;
    let absentToday = 0;

    // Data structures for charts
    const dateCountsMap = {}; // { 'YYYY-MM-DD': { present: 0, total: 0 } }
    const classStatsMap = {}; // { classId: { present: 0, total: 0 } }
    const recentActivitySessions = []; // Unique session list

    attendanceSnap.forEach((d) => {
      const data = d.data();
      totalRecordedAttendance++;

      const isPresent = data.status === 'Present';
      if (isPresent) totalPresentOverall++;

      // Check if recorded today
      if (data.attendanceDate === todayStr) {
        if (isPresent) presentToday++;
        else absentToday++;
      }

      // Trends accumulator
      if (data.attendanceDate) {
        if (!dateCountsMap[data.attendanceDate]) {
          dateCountsMap[data.attendanceDate] = { present: 0, total: 0 };
        }
        dateCountsMap[data.attendanceDate].total++;
        if (isPresent) dateCountsMap[data.attendanceDate].present++;
      }

      // Class accumulator
      if (data.classId) {
        if (!classStatsMap[data.classId]) {
          classStatsMap[data.classId] = { present: 0, total: 0 };
        }
        classStatsMap[data.classId].total++;
        if (isPresent) classStatsMap[data.classId].present++;
      }

      // Session tracking
      const sessionKey = `${data.classId}_${data.subjectId}_${data.attendanceDate}`;
      if (!recentActivitySessions.find((s) => s.key === sessionKey)) {
        recentActivitySessions.push({
          key: sessionKey,
          classId: data.classId,
          subjectId: data.subjectId,
          date: data.attendanceDate,
          status: data.status,
          updatedAt: data.updatedAt
        });
      }
    });

    // Update Top Stat Cards
    statPresentToday.textContent = presentToday;
    statAbsentToday.textContent = absentToday;

    const overallPercentage = totalRecordedAttendance > 0
      ? Math.round((totalPresentOverall / totalRecordedAttendance) * 100)
      : 0;
    statOverallPercentage.textContent = `${overallPercentage}%`;

    // Render Charts with Actual Firestore Data
    renderRatioChart(totalPresentOverall, totalRecordedAttendance - totalPresentOverall);
    renderTrendsChart(dateCountsMap);
    renderClassBarChart(classesList, classStatsMap);
    renderRecentActivity(recentActivitySessions, classesList);

  } catch (err) {
    console.error('Error loading dashboard analytics:', err);
    showToast('Failed to load dashboard statistics: ' + err.message, 'error');
  }
}

/**
 * Chart 1: Present vs Absent Doughnut Chart
 */
function renderRatioChart(presentCount, absentCount) {
  const ctx = document.getElementById('chart-attendance-ratio')?.getContext('2d');
  if (!ctx) return;

  if (chartRatio) chartRatio.destroy();

  const hasData = presentCount > 0 || absentCount > 0;
  const dataValues = hasData ? [presentCount, absentCount] : [1, 0];
  const bgColors = hasData ? ['#10b981', '#ef4444'] : ['#e2e8f0', '#cbd5e1'];

  chartRatio = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: hasData ? ['Present', 'Absent'] : ['No Records Yet', ''],
      datasets: [{
        data: dataValues,
        backgroundColor: bgColors,
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 12,
            font: { family: 'Inter', size: 12 }
          }
        },
        tooltip: {
          enabled: hasData
        }
      },
      cutout: '72%'
    }
  });
}

/**
 * Chart 2: Recent Trends Line Chart
 */
function renderTrendsChart(dateCountsMap) {
  const ctx = document.getElementById('chart-attendance-trends')?.getContext('2d');
  if (!ctx) return;

  if (chartTrends) chartTrends.destroy();

  // Sort dates ascending
  const sortedDates = Object.keys(dateCountsMap).sort().slice(-7); // Last 7 recorded dates

  const labels = sortedDates.length > 0 ? sortedDates.map((d) => formatDate(d)) : ['No Sessions Recorded'];
  const percentages = sortedDates.length > 0
    ? sortedDates.map((d) => {
        const item = dateCountsMap[d];
        return item.total > 0 ? Math.round((item.present / item.total) * 100) : 0;
      })
    : [0];

  chartTrends = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Attendance Rate (%)',
        data: percentages,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.08)',
        fill: true,
        tension: 0.35,
        pointBackgroundColor: '#2563eb',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: (v) => `${v}%`,
            font: { family: 'Inter' }
          },
          grid: { color: '#f1f5f9' }
        },
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Inter' } }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

/**
 * Chart 3: Class-wise Attendance Bar Chart
 */
function renderClassBarChart(classesList, classStatsMap) {
  const ctx = document.getElementById('chart-class-attendance')?.getContext('2d');
  if (!ctx) return;

  if (chartClass) chartClass.destroy();

  const labels = [];
  const data = [];

  classesList.forEach((cls) => {
    labels.push(`${cls.name} (${cls.section || 'A'})`);
    const stats = classStatsMap[cls.id];
    if (stats && stats.total > 0) {
      data.push(Math.round((stats.present / stats.total) * 100));
    } else {
      data.push(0);
    }
  });

  if (labels.length === 0) {
    labels.push('No Classes Created');
    data.push(0);
  }

  chartClass = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Average Attendance (%)',
        data,
        backgroundColor: '#0ea5e9',
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: (v) => `${v}%`,
            font: { family: 'Inter' }
          },
          grid: { color: '#f1f5f9' }
        },
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Inter' } }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

/**
 * Render recent attendance sessions list in dashboard
 */
function renderRecentActivity(sessions, classesList) {
  if (!recentActivityContainer) return;

  if (sessions.length === 0) {
    recentActivityContainer.innerHTML = `
      <div class="empty-state" style="padding: 24px 10px;">
        <div class="empty-state-icon" style="width: 44px; height: 44px; font-size: 1.15rem;">
          <i class="fa-solid fa-clipboard-list"></i>
        </div>
        <div class="empty-state-title" style="font-size: 0.95rem;">No attendance recorded yet</div>
        <p class="empty-state-desc" style="font-size: 0.8rem; margin-bottom: 12px;">
          Start recording daily attendance sessions to see activity logs here.
        </p>
        <a href="attendance.html" class="btn btn-primary btn-sm">
          <i class="fa-solid fa-plus"></i> Take Attendance
        </a>
      </div>
    `;
    return;
  }

  const classMap = {};
  classesList.forEach((c) => {
    classMap[c.id] = `${c.name} (${c.section || 'A'})`;
  });

  // Show last 5 sessions
  const latestSessions = sessions.slice(0, 5);

  recentActivityContainer.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${latestSessions.map((s) => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background-color: var(--bg-muted); border-radius: var(--radius-md);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 32px; height: 32px; border-radius: 50%; background-color: var(--primary-light); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 0.85rem;">
              <i class="fa-solid fa-calendar-check"></i>
            </div>
            <div>
              <div style="font-weight: 600; font-size: 0.875rem;">${escapeHTML(classMap[s.classId] || 'Class Attendance')}</div>
              <div style="font-size: 0.775rem; color: var(--text-secondary);">${formatDate(s.date)}</div>
            </div>
          </div>
          <span class="badge badge-success">Saved to Cloud</span>
        </div>
      `).join('')}
    </div>
  `;
}
