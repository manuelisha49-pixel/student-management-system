// Data Persistence Models
let users = JSON.parse(localStorage.getItem('sys_users')) || [];
let concerns = JSON.parse(localStorage.getItem('sys_concerns')) || [];
let equipmentReports = JSON.parse(localStorage.getItem('sys_equipment')) || [];
let currentUser = JSON.parse(localStorage.getItem('sys_current_user')) || null;

// Admin accounts (sign in with Admin ID + password). Passwords are stored as SHA-256 hashes.
const ADMIN_ACCOUNTS = [
  { id: 'ADMIN-001', name: 'System Administrator',   passwordHash: '744ad369f878174eb38802539de92d957b86846b90808835325db7df4a181861' },
  { id: 'ADMIN-002', name: 'Facilities Officer',      passwordHash: 'f9340a966e3f4c5346147f53eb6af534e57f2b511f65e40e703caa30508a869a' },
  { id: 'ADMIN-003', name: 'Student Affairs Officer', passwordHash: 'db095cb135b4d5bae081353d603a86f25982fc277b7fb1d04b60c558e2c3fc68' }
];
let currentAdminId = localStorage.getItem('sys_admin_current') || null;
let isAdminLoggedIn = (JSON.parse(localStorage.getItem('sys_admin_logged_in')) || false) &&
  ADMIN_ACCOUNTS.some((a) => a.id === currentAdminId);

// Global OTP state for password reset
let activeOtpData = null;

// EmailJS Credentials Configuration
const EMAILJS_PUBLIC_KEY = "vW4AkyFPFlHOLpayJ";
const EMAILJS_SERVICE_ID = "YOUR_SERVICE_ID";   // Replace with EmailJS Service ID
const EMAILJS_TEMPLATE_ID = "YOUR_TEMPLATE_ID"; // Replace with EmailJS Template ID

function normalizeText(value = '') {
  return String(value).trim();
}

function formatDate(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

async function hashPassword(value) {
  const text = String(value || '');
  if (window.crypto && crypto.subtle) {
    const encoded = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

async function authenticateAdmin(adminId, password) {
  const normalizedId = normalizeText(adminId).toUpperCase();
  const account = ADMIN_ACCOUNTS.find((a) => a.id === normalizedId);
  if (!account) {
    return null;
  }

  const hash = await hashPassword(password);
  return account.passwordHash === hash ? account : null;
}

function addHistoryEntry(record, action, details = '') {
  if (!record) return;
  if (!Array.isArray(record.history)) {
    record.history = [];
  }

  record.history.push({
    action,
    details,
    at: new Date().toISOString()
  });
}

function renderAttachmentPreview(attachments = []) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return '';
  }

  const imageMarkup = attachments
    .filter((attachment) => attachment && attachment.data)
    .map((attachment) => `<img src="${attachment.data}" alt="${escapeHtml(attachment.name || 'Attached image')}" />`)
    .join('');

  return imageMarkup ? `<div class="attachment-preview">${imageMarkup}</div>` : '';
}

function renderHistoryBlock(record) {
  if (!record || !Array.isArray(record.history) || record.history.length === 0) {
    return '';
  }

  const entries = record.history.slice().reverse().slice(0, 5).map((entry) => `
    <div class="history-item">
      <strong>${escapeHtml(entry.action)}</strong> - ${escapeHtml(entry.details || 'Status updated')}<br>
      <span>${escapeHtml(formatDate(entry.at))}</span>
    </div>
  `).join('');

  return `<div class="history-list">${entries}</div>`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
}

async function processSelectedFiles(fileInput) {
  const files = Array.from(fileInput?.files || []);
  if (!files.length) {
    return [];
  }

  const attachments = [];
  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      alert('Please upload only image files for attachments.');
      fileInput.value = '';
      return [];
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('Each image must be smaller than 2MB.');
      fileInput.value = '';
      return [];
    }

    attachments.push({
      name: file.name,
      type: file.type,
      data: await readFileAsDataUrl(file)
    });
  }

  return attachments;
}

// Initialize EmailJS
(function() {
  if (window.emailjs && EMAILJS_PUBLIC_KEY !== "YOUR_PUBLIC_KEY") {
    emailjs.init(EMAILJS_PUBLIC_KEY);
  }
})();

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  setupThemeToggle();
  loadCrest();
  setupPasswordToggles();
  if (document.body.dataset.page === 'admin') {
    setupAdminHandlers();
    updateAdminUIState();
  } else {
    setupAuthHandlers();
    setupResetPasswordHandlers();
    setupStudentHandlers();
    updateUIState();
  }
});

// Save Helper
function saveData() {
  localStorage.setItem('sys_users', JSON.stringify(users));
  localStorage.setItem('sys_concerns', JSON.stringify(concerns));
  localStorage.setItem('sys_equipment', JSON.stringify(equipmentReports));
  localStorage.setItem('sys_current_user', JSON.stringify(currentUser));
  localStorage.setItem('sys_admin_logged_in', JSON.stringify(isAdminLoggedIn));
  if (currentAdminId) localStorage.setItem('sys_admin_current', currentAdminId);
  else localStorage.removeItem('sys_admin_current');
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getUserFullName(user) {
  return user.firstName && user.lastName
    ? `${user.firstName} ${user.lastName}`
    : user.name || '';
}

function renderDashboardSummary() {
  const studentSummary = document.getElementById('studentSummaryGrid');
  const adminSummary = document.getElementById('adminSummaryGrid');

  if (studentSummary && currentUser) {
    const myConcerns = concerns.filter(c => c.studentId === currentUser.studentId);
    const myEquipment = equipmentReports.filter(e => e.studentId === currentUser.studentId);
    const resolvedConcerns = myConcerns.filter(c => c.status === 'Resolved').length;
    const pendingEquipment = myEquipment.filter(e => e.status === 'Reported' || e.status === 'Under-Maintenance').length;

    studentSummary.innerHTML = `
      <div class="summary-card">
        <span class="summary-label">Total concerns</span>
        <strong>${myConcerns.length}</strong>
      </div>
      <div class="summary-card">
        <span class="summary-label">Equipment reports</span>
        <strong>${myEquipment.length}</strong>
      </div>
      <div class="summary-card">
        <span class="summary-label">Resolved</span>
        <strong>${resolvedConcerns}</strong>
      </div>
      <div class="summary-card">
        <span class="summary-label">Active issues</span>
        <strong>${pendingEquipment}</strong>
      </div>
    `;
  }

  if (adminSummary && isAdminLoggedIn) {
    const totalConcerns = concerns.length;
    const pendingConcerns = concerns.filter(c => c.status === 'Pending').length;
    const inProgressConcerns = concerns.filter(c => c.status === 'In-Progress').length;
    const resolvedConcerns = concerns.filter(c => c.status === 'Resolved').length;
    const highPriorityReports = equipmentReports.filter(e => e.urgency === 'High').length;

    adminSummary.innerHTML = `
      <div class="summary-card">
        <span class="summary-label">Total submissions</span>
        <strong>${totalConcerns}</strong>
      </div>
      <div class="summary-card">
        <span class="summary-label">Pending</span>
        <strong>${pendingConcerns}</strong>
      </div>
      <div class="summary-card">
        <span class="summary-label">In progress</span>
        <strong>${inProgressConcerns}</strong>
      </div>
      <div class="summary-card">
        <span class="summary-label">High priority</span>
        <strong>${highPriorityReports}</strong>
      </div>
      <div class="summary-card">
        <span class="summary-label">Resolved</span>
        <strong>${resolvedConcerns}</strong>
      </div>
    `;
  }
}

// Dark / Light Theme Toggle Logic (header button + floating button on the sign-in screen)
function setupThemeToggle() {
  const buttons = Array.from(document.querySelectorAll('#themeToggleBtn, #themeFab'));

  function applyTheme(isDark) {
    document.body.classList.toggle('dark-mode', isDark);
    buttons.forEach((btn) => {
      if (btn.id === 'themeToggleBtn') btn.textContent = isDark ? 'Light Mode' : 'Dark Mode';
      btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    });
  }

  applyTheme((localStorage.getItem('sys_theme') || 'light') === 'dark');
  buttons.forEach((btn) => btn.addEventListener('click', () => {
    const isDark = !document.body.classList.contains('dark-mode');
    localStorage.setItem('sys_theme', isDark ? 'dark' : 'light');
    applyTheme(isDark);
  }));
}

// Use your school crest if crest.png is uploaded next to index.html
function loadCrest() {
  const slot = document.querySelector('.auth-crest');
  if (!slot) return;
  const img = new Image();
  img.alt = 'School crest';
  img.onload = () => { slot.textContent = ''; slot.appendChild(img); slot.classList.add('has-img'); };
  img.src = 'crest.png';
}

function setupPasswordToggles() {
  const eyeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.062 12s3.438-7 9.938-7 9.938 7 9.938 7-3.438 7-9.938 7-9.938-7-9.938-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
  const eyeOffIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m3 3 18 18"></path><path d="M10.58 10.58a2 2 0 0 0 2.83 2.83"></path><path d="M9.88 5.09A10.43 10.43 0 0 1 12 4.88c6.5 0 9.94 7.12 9.94 7.12a13.1 13.1 0 0 1-2.08 2.94"></path><path d="M6.61 6.61C3.7 8.57 2.06 12 2.06 12s3.44 7.12 9.94 7.12a10.4 10.4 0 0 0 5.39-1.5"></path></svg>';

  document.querySelectorAll('input[type="password"]').forEach((input) => {
    const field = document.createElement('div');
    field.className = 'password-field';
    input.parentNode.insertBefore(field, input);
    field.appendChild(input);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'password-toggle';
    toggle.setAttribute('aria-label', 'Show password');
    toggle.title = 'Show password';
    toggle.innerHTML = eyeIcon;
    toggle.addEventListener('click', () => {
      const isVisible = input.type === 'text';
      input.type = isVisible ? 'password' : 'text';
      toggle.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
      toggle.title = isVisible ? 'Show password' : 'Hide password';
      toggle.innerHTML = isVisible ? eyeIcon : eyeOffIcon;
      input.focus();
    });
    field.appendChild(toggle);
  });
}

// Update UI State based on current logged in user
function updateUIState() {
  const authCard = document.getElementById('studentAuthCard');
  const dashboard = document.getElementById('studentDashboard');
  const nameDisplay = document.getElementById('studentNameDisplay');
  document.body.classList.toggle('auth-mode', !currentUser);

  if (currentUser) {
    authCard.classList.add('hidden');
    dashboard.classList.remove('hidden');
    nameDisplay.textContent = getUserFullName(currentUser);
    renderStudentConcerns();
    renderStudentEquipment();
  } else {
    authCard.classList.remove('hidden');
    dashboard.classList.add('hidden');
  }

  renderDashboardSummary();
}

function updateAdminUIState() {
  const authCard = document.getElementById('adminAuthCard');
  const dashboard = document.getElementById('adminDashboard');

  document.body.classList.toggle('auth-mode', !isAdminLoggedIn);
  authCard.classList.toggle('hidden', isAdminLoggedIn);
  dashboard.classList.toggle('hidden', !isAdminLoggedIn);

  const whoami = document.getElementById('adminWhoami');
  const account = ADMIN_ACCOUNTS.find((a) => a.id === currentAdminId);
  if (whoami) whoami.textContent = isAdminLoggedIn && account ? `Signed in as ${account.name} (${account.id})` : '';

  if (isAdminLoggedIn) {
    renderAdminEquipment();
    renderAdminConcerns();
    renderAccountsList();
  }
  renderDashboardSummary();
}

// Authentication Logic
function setupAuthHandlers() {
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');
  const loginForm = document.getElementById('studentLoginForm');
  const regForm = document.getElementById('studentRegisterForm');
  const authShell = document.getElementById('studentAuthCard');

  function setAuthMode(mode) {
    const isRegister = mode === 'register';
    authShell.dataset.mode = mode;
    regForm.classList.toggle('hidden', !isRegister);
    loginForm.classList.toggle('hidden', isRegister);
  }

  loginTab.addEventListener('click', () => setAuthMode('login'));
  registerTab.addEventListener('click', () => setAuthMode('register'));

  // Register Student
  regForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const firstName = document.getElementById('regFirstName').value.trim();
    const lastName = document.getElementById('regLastName').value.trim();
    const studentId = document.getElementById('regStudentId').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;

    if (!firstName || !lastName || !studentId || !email || !password) {
      alert('Please complete all registration fields.');
      return;
    }

    if (/\d/.test(firstName) || /\d/.test(lastName)) {
      alert('First and last names must not contain numbers!');
      return;
    }

    const studentIdPattern = /^\d+-\d+$/;
    if (!studentIdPattern.test(studentId)) {
      alert('Invalid Student ID format! The accepted format is digits followed by a hyphen and digits (e.g., 2025-0461).');
      return;
    }

    const emailPattern = /^[^\s@]+@gmail\.com$/i;
    if (!emailPattern.test(email)) {
      alert('Please use a valid Gmail address ending in @gmail.com');
      return;
    }

    if (password.length < 6) {
      alert('Password must be at least 6 characters long.');
      return;
    }

    if (users.find(u => u.studentId === studentId || u.email.toLowerCase() === email.toLowerCase())) {
      alert('A student account with this ID or Gmail address already exists.');
      return;
    }

    const newUser = { id: Date.now(), firstName, lastName, studentId, email, password };
    users.push(newUser);
    currentUser = newUser;
    saveData();
    updateUIState();
    regForm.reset();
  });

  // Login Student
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const studentId = document.getElementById('loginStudentId').value.trim();
    const password = document.getElementById('loginPassword').value;

    const user = users.find(u => u.studentId === studentId && u.password === password);
    if (user) {
      currentUser = user;
      saveData();
      updateUIState();
      loginForm.reset();
    } else {
      alert('Invalid Student ID or Password!');
    }
  });

  // Student Logout
  document.getElementById('studentLogoutBtn').addEventListener('click', () => {
    currentUser = null;
    setAuthMode('login');
    saveData();
    updateUIState();
  });
}

// ----------------------------------------------------
// Forgot / Reset Password Logic via Gmail
// ----------------------------------------------------
function setupResetPasswordHandlers() {
  const forgotLink = document.getElementById('forgotPasswordLink');
  const resetModal = document.getElementById('resetModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const requestOtpForm = document.getElementById('requestOtpForm');
  const verifyOtpForm = document.getElementById('verifyOtpForm');
  const sendOtpBtn = document.getElementById('sendOtpBtn');

  forgotLink.addEventListener('click', (e) => {
    e.preventDefault();
    resetModal.classList.remove('hidden');
    requestOtpForm.classList.remove('hidden');
    verifyOtpForm.classList.add('hidden');
  });

  closeModalBtn.addEventListener('click', () => {
    resetModal.classList.add('hidden');
    requestOtpForm.reset();
    verifyOtpForm.reset();
  });

  // Step 1: Handle OTP Generation & Email Sending
  requestOtpForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const studentId = document.getElementById('resetStudentId').value.trim();
    const targetUser = users.find(u => u.studentId === studentId);

    if (!targetUser) {
      alert('No account found with that Student ID!');
      return;
    }

    if (!targetUser.email) {
      alert('No registered Gmail found for this student account.');
      return;
    }

    if (!window.emailjs || EMAILJS_SERVICE_ID === "YOUR_SERVICE_ID" || EMAILJS_TEMPLATE_ID === "YOUR_TEMPLATE_ID") {
      alert('Email verification is not configured. Add your EmailJS Service ID and Template ID in script.js.');
      return;
    }

    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    activeOtpData = null;

    sendOtpBtn.textContent = "Sending Email...";
    sendOtpBtn.disabled = true;

    window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        to_email: targetUser.email,
        to_name: getUserFullName(targetUser),
        otp_code: generatedOtp
      })
      .then(() => {
        activeOtpData = {
          studentId: targetUser.studentId,
          code: generatedOtp,
          expiresAt: Date.now() + 10 * 60 * 1000
        };
        alert(`Verification code sent to ${targetUser.email}`);
        requestOtpForm.classList.add('hidden');
        verifyOtpForm.classList.remove('hidden');
      })
      .catch((err) => {
        console.error('EmailJS Error:', err);
        activeOtpData = null;
        alert('Could not send the verification email. Check your EmailJS service, template, and account settings, then try again.');
      })
      .finally(() => {
        sendOtpBtn.textContent = "Send Verification Code to Gmail";
        sendOtpBtn.disabled = false;
      });
  });

  // Step 2: Verify Code and Update Password
  verifyOtpForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const inputOtp = document.getElementById('otpInput').value.trim();
    const newPassword = document.getElementById('resetNewPassword').value;

    if (!activeOtpData || Date.now() > activeOtpData.expiresAt) {
      alert('Verification code has expired. Please request a new one.');
      return;
    }

    if (inputOtp !== activeOtpData.code) {
      alert('Invalid verification code!');
      return;
    }

    const userIndex = users.findIndex(u => u.studentId === activeOtpData.studentId);
    if (userIndex !== -1) {
      users[userIndex].password = newPassword;
      saveData();
      alert('Password updated successfully! You can now log in.');
      resetModal.classList.add('hidden');
      requestOtpForm.reset();
      verifyOtpForm.reset();
      activeOtpData = null;
    }
  });
}

// Student Dashboard Handlers
function setupStudentHandlers() {
  const subConcernTabBtn = document.getElementById('subConcernTabBtn');
  const subEquipmentTabBtn = document.getElementById('subEquipmentTabBtn');
  const concernForm = document.getElementById('concernForm');
  const equipmentForm = document.getElementById('equipmentForm');

  const viewMyConcernsBtn = document.getElementById('viewMyConcernsBtn');
  const viewMyEquipmentBtn = document.getElementById('viewMyEquipmentBtn');
  const myConcernsList = document.getElementById('myConcernsList');
  const myEquipmentList = document.getElementById('myEquipmentList');

  subConcernTabBtn.addEventListener('click', () => {
    subConcernTabBtn.classList.add('active');
    subEquipmentTabBtn.classList.remove('active');
    concernForm.classList.remove('hidden');
    equipmentForm.classList.add('hidden');
  });

  subEquipmentTabBtn.addEventListener('click', () => {
    subEquipmentTabBtn.classList.add('active');
    subConcernTabBtn.classList.remove('active');
    equipmentForm.classList.remove('hidden');
    concernForm.classList.add('hidden');
  });

  viewMyConcernsBtn.addEventListener('click', () => {
    viewMyConcernsBtn.classList.add('active');
    viewMyEquipmentBtn.classList.remove('active');
    myConcernsList.classList.remove('hidden');
    myEquipmentList.classList.add('hidden');
  });

  viewMyEquipmentBtn.addEventListener('click', () => {
    viewMyEquipmentBtn.classList.add('active');
    viewMyConcernsBtn.classList.remove('active');
    myEquipmentList.classList.remove('hidden');
    myConcernsList.classList.add('hidden');
  });

  concernForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('concernTitle').value.trim();
    const details = document.getElementById('concernDetails').value.trim();
    const attachmentInput = document.getElementById('concernAttachment');

    if (!title || !details) {
      alert('Please provide a title and detailed description for your submission.');
      return;
    }

    const attachments = await processSelectedFiles(attachmentInput);

    const newConcern = {
      id: Date.now(),
      studentId: currentUser.studentId,
      studentName: getUserFullName(currentUser),
      type: document.getElementById('concernType').value,
      category: document.getElementById('concernCategory').value,
      title: title,
      details: details,
      status: 'Pending',
      response: '',
      attachments: attachments,
      history: [{
        action: 'Submitted',
        details: 'Student submitted a new concern.',
        at: new Date().toISOString()
      }],
      createdAt: new Date().toISOString()
    };

    concerns.push(newConcern);
    saveData();
    renderStudentConcerns();
    renderDashboardSummary();
    if (typeof renderAdminConcerns === 'function') {
      renderAdminConcerns();
    }
    concernForm.reset();
    alert('Concern submitted successfully!');
  });

  equipmentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const itemName = document.getElementById('eqName').value.trim();
    const location = document.getElementById('eqLocation').value.trim();
    const details = document.getElementById('eqDetails').value.trim();
    const attachmentInput = document.getElementById('equipmentAttachment');

    if (!itemName || !location || !details) {
      alert('Please complete the equipment issue details before submitting.');
      return;
    }

    const attachments = await processSelectedFiles(attachmentInput);

    const newReport = {
      id: Date.now(),
      studentId: currentUser.studentId,
      studentName: getUserFullName(currentUser),
      itemName: itemName,
      location: location,
      urgency: document.getElementById('eqUrgency').value,
      details: details,
      status: 'Reported',
      attachments: attachments,
      history: [{
        action: 'Reported',
        details: 'Equipment issue was reported to maintenance.',
        at: new Date().toISOString()
      }],
      createdAt: new Date().toISOString()
    };

    equipmentReports.push(newReport);
    saveData();
    renderStudentEquipment();
    renderDashboardSummary();
    if (typeof renderAdminEquipment === 'function') {
      renderAdminEquipment();
    }
    equipmentForm.reset();
    alert('Equipment report submitted to maintenance!');
  });
}

function renderStudentConcerns() {
  const container = document.getElementById('myConcernsList');
  container.innerHTML = '';
  const myConcerns = concerns.filter(c => c.studentId === currentUser.studentId);

  if (myConcerns.length === 0) {
    container.innerHTML = '<p class="subtitle">No general concerns submitted yet.</p>';
    return;
  }

  myConcerns.slice().reverse().forEach(c => {
    const item = document.createElement('div');
    item.className = 'record-item';
    item.innerHTML = `
      <div class="record-header">
        <div>
          <span class="tag ${escapeHtml(c.type)}">${escapeHtml(c.type)}</span>
          <strong style="margin-left: 8px;">${escapeHtml(c.title)}</strong>
        </div>
        <span class="status-badge status-${c.status.replace(/\s+/g, '-')}">${escapeHtml(c.status)}</span>
      </div>
      <p style="font-size: 0.9rem; margin-top: 6px;">${escapeHtml(c.details)}</p>
      <div class="subtitle" style="margin-top: 6px;">Category: ${escapeHtml(c.category)} | Date: ${escapeHtml(formatDate(c.createdAt))}</div>
      ${renderAttachmentPreview(c.attachments || [])}
      ${c.response ? `<div class="response-box"><strong>Admin Response:</strong> ${escapeHtml(c.response)}</div>` : ''}
      ${renderHistoryBlock(c)}
    `;
    container.appendChild(item);
  });
}

function renderStudentEquipment() {
  const container = document.getElementById('myEquipmentList');
  container.innerHTML = '';
  const myEquipment = equipmentReports.filter(e => e.studentId === currentUser.studentId);

  if (myEquipment.length === 0) {
    container.innerHTML = '<p class="subtitle">No equipment reports submitted yet.</p>';
    return;
  }

  myEquipment.slice().reverse().forEach(eq => {
    const item = document.createElement('div');
    item.className = 'record-item';
    item.innerHTML = `
      <div class="record-header">
        <div>
          <span class="tag Equipment">Equipment</span>
          <strong style="margin-left: 8px;">${escapeHtml(eq.itemName)}</strong>
        </div>
        <span class="status-badge status-${eq.status.replace(/\s+/g, '-')}">${escapeHtml(eq.status)}</span>
      </div>
      <p style="font-size: 0.9rem; margin-top: 6px;"><strong>Location:</strong> ${escapeHtml(eq.location)}</p>
      <p style="font-size: 0.9rem; margin-top: 2px;"><strong>Issue:</strong> ${escapeHtml(eq.details)}</p>
      <div class="subtitle" style="margin-top: 6px;">
        Urgency: <span class="tag urgency-${eq.urgency}">${escapeHtml(eq.urgency)}</span> | Date: ${escapeHtml(formatDate(eq.createdAt))}
      </div>
      ${renderAttachmentPreview(eq.attachments || [])}
      ${renderHistoryBlock(eq)}
    `;
    container.appendChild(item);
  });
}

// Admin Panel Logic
function setupAdminHandlers() {
  const adminLoginForm = document.getElementById('adminLoginForm');
  const searchInput = document.getElementById('adminSearchInput');
  const typeFilter = document.getElementById('adminTypeFilter');
  const adminMenu = document.querySelector('.dashboard-menu[aria-label="Admin dashboard menu"]');

  adminMenu.addEventListener('click', (event) => {
    const selectedButton = event.target.closest('[data-admin-view]');
    if (!selectedButton) return;

    const selectedView = selectedButton.dataset.adminView;
    adminMenu.querySelectorAll('[data-admin-view]').forEach((button) => {
      const isSelected = button === selectedButton;
      button.classList.toggle('active', isSelected);
      button.setAttribute('aria-pressed', String(isSelected));
    });
    document.querySelectorAll('[data-admin-panel]').forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.adminPanel !== selectedView);
    });
  });

  adminLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const adminId = document.getElementById('adminId').value.trim();
    const pass = document.getElementById('adminPassword').value;

    const account = await authenticateAdmin(adminId, pass);
    if (account) {
      isAdminLoggedIn = true;
      currentAdminId = account.id;
      saveData();
      updateAdminUIState();
      adminLoginForm.reset();
    } else {
      alert('Invalid Admin ID or password!');
    }
  });

  document.getElementById('adminLogoutBtn').addEventListener('click', () => {
    isAdminLoggedIn = false;
    currentAdminId = null;
    saveData();
    updateAdminUIState();
  });

  searchInput.addEventListener('input', renderAdminConcerns);
  typeFilter.addEventListener('change', renderAdminConcerns);
  const statusFilter = document.getElementById('adminStatusFilter');
  const sortOrder = document.getElementById('adminSortOrder');
  statusFilter.addEventListener('change', renderAdminConcerns);
  sortOrder.addEventListener('change', renderAdminConcerns);
}

function renderAdminEquipment() {
  const container = document.getElementById('adminEquipmentList');
  container.innerHTML = '';

  if (equipmentReports.length === 0) {
    container.innerHTML = '<p class="subtitle">No equipment issues reported yet.</p>';
    return;
  }

  equipmentReports.slice().reverse().forEach(eq => {
    const item = document.createElement('div');
    item.className = 'record-item';
    item.innerHTML = `
      <div class="record-header">
        <div>
          <strong style="font-size: 1rem;">${escapeHtml(eq.itemName)}</strong>
          <span class="tag urgency-${eq.urgency}" style="margin-left: 6px;">${escapeHtml(eq.urgency)} Priority</span>
        </div>
        <span class="status-badge status-${eq.status.replace(/\s+/g, '-')}">${escapeHtml(eq.status)}</span>
      </div>
      <p style="font-size: 0.9rem; margin: 4px 0;"><strong>Location:</strong> ${escapeHtml(eq.location)}</p>
      <p style="font-size: 0.9rem; margin: 4px 0;"><strong>Issue Details:</strong> ${escapeHtml(eq.details)}</p>
      <div class="subtitle">Reported By: ${escapeHtml(eq.studentName)} (${escapeHtml(eq.studentId)}) | Date: ${escapeHtml(formatDate(eq.createdAt))}</div>
      ${renderAttachmentPreview(eq.attachments || [])}
      ${renderHistoryBlock(eq)}
      <div class="admin-action-box">
        <label>Update Status</label>
        <select onchange="updateEquipmentStatus(${eq.id}, this.value)">
          <option value="Reported" ${eq.status === 'Reported' ? 'selected' : ''}>Reported</option>
          <option value="Under-Maintenance" ${eq.status === 'Under-Maintenance' ? 'selected' : ''}>Under Maintenance</option>
          <option value="Repaired-Replaced" ${eq.status === 'Repaired-Replaced' ? 'selected' : ''}>Repaired / Replaced</option>
        </select>
      </div>
    `;
    container.appendChild(item);
  });
}

function renderAdminConcerns() {
  const container = document.getElementById('adminConcernsList');
  const search = (document.getElementById('adminSearchInput')?.value || '').toLowerCase();
  const typeVal = document.getElementById('adminTypeFilter')?.value || 'ALL';
  const statusVal = document.getElementById('adminStatusFilter')?.value || 'ALL';
  const sortOrder = document.getElementById('adminSortOrder')?.value || 'newest';

  container.innerHTML = '';

  let filtered = concerns.filter(c => {
    const matchesSearch = (c.title || '').toLowerCase().includes(search) ||
                          (c.studentName || '').toLowerCase().includes(search) ||
                          (c.studentId || '').toLowerCase().includes(search);
    const matchesType = typeVal === 'ALL' || c.type === typeVal;
    const matchesStatus = statusVal === 'ALL' || c.status === statusVal;
    return matchesSearch && matchesType && matchesStatus;
  });

  const statusOrder = { Pending: 1, 'In-Progress': 2, Resolved: 3 };
  filtered = filtered.sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();

    if (sortOrder === 'oldest') return aTime - bTime;
    if (sortOrder === 'priority') {
      const aRank = statusOrder[a.status] || 99;
      const bRank = statusOrder[b.status] || 99;
      return aRank - bRank || bTime - aTime;
    }
    return bTime - aTime;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<p class="subtitle">No matching student submissions found.</p>';
    return;
  }

  filtered.forEach(c => {
    const item = document.createElement('div');
    item.className = 'record-item';
    item.innerHTML = `
      <div class="record-header">
        <div>
          <span class="tag ${escapeHtml(c.type)}">${escapeHtml(c.type)}</span>
          <strong style="margin-left: 8px;">${escapeHtml(c.title)}</strong>
        </div>
        <span class="status-badge status-${c.status.replace(/\s+/g, '-')}">${escapeHtml(c.status)}</span>
      </div>
      <p style="font-size: 0.9rem; margin-top: 6px;">${escapeHtml(c.details)}</p>
      <div class="subtitle" style="margin-top: 6px;">
        Category: ${escapeHtml(c.category)} | Student: ${escapeHtml(c.studentName)} (${escapeHtml(c.studentId)}) | Date: ${escapeHtml(formatDate(c.createdAt))}
      </div>
      ${renderAttachmentPreview(c.attachments || [])}
      ${renderHistoryBlock(c)}
      <div class="admin-action-box">
        <label>Status</label>
        <select onchange="updateConcernStatus(${c.id}, this.value)">
          <option value="Pending" ${c.status === 'Pending' ? 'selected' : ''}>Pending</option>
          <option value="In-Progress" ${c.status === 'In-Progress' ? 'selected' : ''}>In-Progress</option>
          <option value="Resolved" ${c.status === 'Resolved' ? 'selected' : ''}>Resolved</option>
        </select>
        <label>Admin Response</label>
        <textarea id="resp-${c.id}" rows="2" placeholder="Write official response...">${escapeHtml(c.response || '')}</textarea>
        <button class="btn primary" onclick="saveAdminResponse(${c.id})">Save Response</button>
      </div>
    `;
    container.appendChild(item);
  });
}

function renderAccountsList() {
  const container = document.getElementById('studentAccountsList');
  container.innerHTML = '';

  if (users.length === 0) {
    container.innerHTML = '<p class="subtitle">No registered student accounts yet.</p>';
    return;
  }

  users.forEach(u => {
    const item = document.createElement('div');
    item.className = 'account-item';
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(getUserFullName(u))}</strong> (${escapeHtml(u.studentId)})
        <div class="subtitle" style="margin:0;">${u.email}</div>
      </div>
    `;
    container.appendChild(item);
  });
}

// Global Actions for Admin Updates
window.updateEquipmentStatus = function(id, status) {
  const target = equipmentReports.find(e => e.id === id);
  if (target && target.status !== status) {
    target.status = status;
    addHistoryEntry(target, 'Status Updated', `Equipment moved to ${status}.`);
    saveData();
    renderAdminEquipment();
    renderDashboardSummary();
    if (currentUser) renderStudentEquipment();
  }
};

window.updateConcernStatus = function(id, status) {
  const target = concerns.find(c => c.id === id);
  if (target && target.status !== status) {
    target.status = status;
    addHistoryEntry(target, 'Status Updated', `Submission moved to ${status}.`);
    saveData();
    renderAdminConcerns();
    renderDashboardSummary();
    if (currentUser) renderStudentConcerns();
  }
};

window.saveAdminResponse = function(id) {
  const target = concerns.find(c => c.id === id);
  const respInput = document.getElementById(`resp-${id}`);
  if (target && respInput) {
    const nextResponse = respInput.value.trim();
    target.response = nextResponse;
    addHistoryEntry(target, 'Admin Response', 'Official response was added or updated.');
    saveData();
    alert('Admin response saved!');
    renderAdminConcerns();
    renderDashboardSummary();
    if (currentUser) renderStudentConcerns();
  }
};
