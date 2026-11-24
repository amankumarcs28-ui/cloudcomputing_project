# CloudAttend - Cloud-Based Student Attendance Management System

A modern, responsive, multi-device web-based Student Attendance Management System built for educators, schools, and universities. Powered by **Vanilla JavaScript (ES6+ Modules)**, **Firebase Authentication**, **Cloud Firestore (Modular SDK v10)**, and **Chart.js**.

---

## 🚀 Key Features

### 1. Educator Authentication & Session Security
- **Teacher Registration & Login:** Direct authentication with Firebase Auth.
- **Teacher Data Isolation:** Each teacher's data resides exclusively within their own secure root document namespace (`users/{teacherUid}/...`).
- **Route Guards:** Instant redirection to `login.html` for unauthenticated sessions, and auto-forwarding to `dashboard.html` for authenticated sessions.
- **Session Persistence:** Remembers logged-in teachers across browser refreshes and tab reopens.

### 2. Student Management (CRUD)
- Create, view, update, and delete student records.
- Fields: Full Name, Roll Number, Class/Section, Email, Enrolled Date.
- **Duplicate Prevention:** Automatically checks and prevents duplicate roll numbers within the same teacher's class.
- Instant search across student names, roll numbers, and emails.
- Filter students by assigned class.

### 3. Class & Section Management
- Create classes with Class/Grade Name, Section (e.g., A, B, Batch 1), and Academic Year.
- Tracks active student counts per class in real-time.
- **Safe Deletion Guard:** Alerts if a class still contains active students before allowing deletion.

### 4. Subject Management
- Associate subjects and course codes (e.g., CS-101, Data Structures) with specific classes.
- Full CRUD operations with instant Firestore updates.

### 5. Attendance Management (Core Module)
- **1-Click Class Loading:** Select Class, Subject, and Date to load the student roster.
- **Correction / Edit Mode:** Automatically detects if attendance for that date, class, and subject has already been recorded and pre-populates existing statuses.
- **Deterministic Cloud Document IDs:** Uses `${studentId}_${classId}_${subjectId}_${attendanceDate}` to guarantee zero duplicate documents in Firestore.
- **Batch Actions:** "Mark All Present" and "Mark All Absent" shortcuts.
- **Atomic Batch Writes:** All student statuses commit atomically via Firestore `writeBatch`.
- Live attendance percentage calculation and present/absent counters.

### 6. Reports & CSV Export
- Student-wise attendance audit with calculated attendance percentage:
  $$\text{Attendance Percentage} = \left(\frac{\text{Present Classes}}{\text{Total Recorded Classes}}\right) \times 100$$
- Performance tiers: **Good (≥75%)**, **Average (60%–74%)**, and **Defaulter / Low (<60%)**.
- Date-range filtering (From Date to To Date) and subject filtering.
- **One-Click CSV Export:** Generates clean, RFC-compliant `.csv` spreadsheets for offline records or administrative submission.

### 7. Real-Time Dashboard & Visual Analytics
- Dynamic counts directly from Cloud Firestore:
  - Total Enrolled Students
  - Present Today
  - Absent Today
  - Lifetime Attendance Percentage
- **Chart.js Doughnut Chart:** Attendance Ratio (Present vs. Absent).
- **Chart.js Line Chart:** Attendance Trends over recent dates.
- **Chart.js Bar Chart:** Class-wise average attendance rate comparison.
- Recent attendance activity stream.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend UI** | HTML5, CSS3 (Modern SaaS Blue & Slate Design System), Inter Font |
| **Icons** | Font Awesome 6.5 |
| **JavaScript** | Vanilla JavaScript (ES6+ Modules, async/await) |
| **Data Visualization** | Chart.js 4.x |
| **Backend & Cloud** | Firebase Authentication, Cloud Firestore (Modular SDK v10 ESM) |
| **Security** | Firestore Security Rules (`firestore.rules`) |
| **Hosting & Deployment** | Firebase Hosting (`firebase.json`) |

> **Note:** Zero heavy frameworks (no React, Vue, or Angular) and zero build steps required. The application uses native browser ES Modules (`<script type="module">`).

---

## 📁 Project Structure

```text
attendance-management-system/
│
├── index.html                 # Landing / Portal page with auth auto-router
├── login.html                 # Teacher sign-in page
├── register.html              # Teacher registration page
├── dashboard.html             # Master analytics dashboard with Chart.js
├── students.html              # Student CRUD directory & search
├── classes.html               # Class & section management with safe deletion
├── subjects.html              # Subject catalog linked to classes
├── attendance.html            # Daily attendance tracker & batch save
├── reports.html               # Attendance percentages & CSV export
├── settings.html              # Teacher profile & Firebase status
│
├── css/
│   └── style.css              # Master SaaS design system (variables, components)
│
├── js/
│   ├── firebase-config.js     # Firebase modular initialization & credentials
│   ├── auth.js                # Auth state, login/register, route protection
│   ├── dashboard.js           # Analytics queries & Chart.js instances
│   ├── students.js            # Student CRUD & roll number uniqueness
│   ├── classes.js             # Class CRUD & enrollment counting
│   ├── subjects.js            # Subject CRUD & class association
│   ├── attendance.js          # Core attendance module (deterministic IDs)
│   ├── reports.js             # Statistics calculation & CSV download
│   └── utils.js               # Toast notifications, modals, date helpers
│
├── firestore.rules            # Teacher-isolated database security rules
├── firestore.indexes.json     # Composite query indexes
├── firebase.json              # Firebase Hosting configuration
├── .gitignore                 # Standard repository ignores
└── README.md                  # Comprehensive technical documentation
```

---

## 🔒 Firestore Database Architecture & Security

### Namespace Hierarchy

Every record is isolated inside the authenticated teacher's unique document hierarchy:

```text
users/{teacherUid}                                  (Teacher Profile)
  ├── students/{studentId}                          (Student Record)
  ├── classes/{classId}                             (Class Record)
  ├── subjects/{subjectId}                          (Subject Record)
  └── attendance/{studentId_classId_subjectId_date} (Attendance Document)
```

### Deterministic Attendance Document IDs

To prevent duplicate attendance entries if a teacher clicks "Save" multiple times or updates an attendance record on the same day, document IDs are generated deterministically:

$$\text{Document ID} = \texttt{studentId} + \text{"\_"} + \texttt{classId} + \text{"\_"} + \texttt{subjectId} + \text{"\_"} + \texttt{attendanceDate}$$

### Security Rules (`firestore.rules`)

Cross-teacher data access is denied at the database rule level:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{teacherUid} {
      allow read, write: if request.auth != null && request.auth.uid == teacherUid;

      match /{allChildren=**} {
        allow read, write: if request.auth != null && request.auth.uid == teacherUid;
      }
    }

    match /{document=**} {
      allow read, write: false;
    }
  }
}
```

---

## ⚙️ How to Configure Firebase

To connect the application to your Firebase Cloud project:

1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add Project** and name it (e.g., `cloud-attendance-app`).
3. Inside your project overview, click the **Web icon (`</>`)** to register a web application.
4. Copy the `firebaseConfig` object values provided by Firebase.
5. In your project workspace, open `js/firebase-config.js` and paste your credentials:

```javascript
export const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
```

6. In Firebase Console, enable:
   - **Authentication:** Go to *Build -> Authentication -> Sign-in method* and enable **Email/Password**.
   - **Cloud Firestore:** Go to *Build -> Firestore Database -> Create Database* (choose production or test mode in your preferred region).

---

## 💻 Running the Application Locally

Because this project uses native browser ES Modules (`<script type="module">`), it must be served through a local HTTP server rather than opening files directly with `file://`.

### Method 1: Using VS Code Live Server Extension
1. Install the **Live Server** extension in Visual Studio Code.
2. Right-click `index.html` or `login.html` and click **Open with Live Server**.

### Method 2: Using Python (Built-in)
Run the following command in PowerShell inside the project directory:

```powershell
python -m http.server 3000
```
Then visit: `http://localhost:3000`

### Method 3: Using Node.js `npx serve`
```powershell
npx serve .
```

---

## 🌐 Deploying to Firebase Hosting

You can deploy this application publicly using the Firebase CLI:

1. Install Firebase CLI (if not already installed):
   ```powershell
   npm install -g firebase-tools
   ```
2. Log in to your Firebase account:
   ```powershell
   firebase login
   ```
3. Deploy Firestore Security Rules:
   ```powershell
   firebase deploy --only firestore:rules
   ```
4. Deploy the Web Application to Firebase Hosting:
   ```powershell
   firebase deploy --only hosting
   ```
5. Firebase will provide you with a live hosting URL (e.g., `https://your-project-id.web.app`).

---

## 📄 License
This project is open-source and intended for educational and institutional attendance tracking.
