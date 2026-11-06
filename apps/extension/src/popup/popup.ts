import { BrowserApi } from '@snaptype/browser-compat';
import { Snippet } from '@snaptype/shared';

const authView = document.getElementById('auth-view')!;
const mainView = document.getElementById('main-view')!;
const emailStep = document.getElementById('email-step')!;
const otpStep = document.getElementById('otp-step')!;
const emailForm = document.getElementById('email-form') as HTMLFormElement;
const otpForm = document.getElementById('otp-form') as HTMLFormElement;
const authEmail = document.getElementById('auth-email') as HTMLInputElement;
const authOtp = document.getElementById('auth-otp') as HTMLInputElement;
const authError = document.getElementById('auth-error')!;
const snippetSearch = document.getElementById('snippet-search') as HTMLInputElement;
const snippetList = document.getElementById('snippet-list')!;
const headerStatus = document.getElementById('header-status')!;
const btnSyncNow = document.getElementById('btn-sync-now')!;
const btnOpenDash = document.getElementById('btn-open-dash')!;
const btnLogout = document.getElementById('btn-logout')!;
const btnBackEmail = document.getElementById('btn-back-email')!;

let currentSnippets: Snippet[] = [];
let pendingEmail = '';

async function init() {
  const data = await BrowserApi.sendMessage({ action: 'GET_DATA' });

  if (!data || !data.isAuthenticated) {
    showAuthView();
  } else {
    showMainView(data);
  }
}

function showAuthView() {
  authView.style.display = 'block';
  mainView.style.display = 'none';
  emailStep.style.display = 'block';
  otpStep.style.display = 'none';
  headerStatus.textContent = 'Not signed in';
}

function showMainView(data: any) {
  authView.style.display = 'none';
  mainView.style.display = 'flex';
  currentSnippets = data.snippets || [];
  headerStatus.textContent = `${currentSnippets.length} snippets`;
  renderSnippetList(currentSnippets);
}

function renderSnippetList(snippets: Snippet[]) {
  snippetList.innerHTML = '';
  if (snippets.length === 0) {
    snippetList.innerHTML = '<div style="padding: 20px; text-align: center; color: #686b66; font-size: 12px;">No snippets available</div>';
    return;
  }

  for (const s of snippets) {
    const row = document.createElement('div');
    row.className = 'snippet-row';
    row.innerHTML = `
      <span class="row-title">${s.name}</span>
      <span class="row-shortcut">${s.shortcut}</span>
    `;

    // Click to copy or insert
    row.onclick = async () => {
      await navigator.clipboard.writeText(s.plainContent);
      row.style.backgroundColor = '#eefde9';
      setTimeout(() => (row.style.backgroundColor = ''), 800);
    };

    snippetList.appendChild(row);
  }
}

// Search
snippetSearch?.addEventListener('input', () => {
  const q = snippetSearch.value.toLowerCase().trim();
  const filtered = currentSnippets.filter(
    (s) => s.name.toLowerCase().includes(q) || s.shortcut.toLowerCase().includes(q)
  );
  renderSnippetList(filtered);
});

// Auth form 1: Request OTP
emailForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.textContent = '';
  const email = authEmail.value.trim();
  if (!email) return;

  pendingEmail = email;
  const res = await BrowserApi.sendMessage({ action: 'AUTH_REQUEST_OTP', email });
  if (res && res.success) {
    emailStep.style.display = 'none';
    otpStep.style.display = 'block';
    authOtp.focus();
  } else {
    authError.textContent = res?.error || 'Failed to send OTP';
  }
});

// Auth form 2: Verify OTP
otpForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.textContent = '';
  const code = authOtp.value.trim();
  if (code.length !== 6) return;

  const res = await BrowserApi.sendMessage({ action: 'AUTH_VERIFY_OTP', email: pendingEmail, code });
  if (res && res.success) {
    const data = await BrowserApi.sendMessage({ action: 'GET_DATA' });
    showMainView(data);
  } else {
    authError.textContent = res?.error || 'Invalid verification code';
  }
});

btnBackEmail?.addEventListener('click', () => {
  otpStep.style.display = 'none';
  emailStep.style.display = 'block';
  authError.textContent = '';
});

// Sync Now
btnSyncNow?.addEventListener('click', async () => {
  btnSyncNow.textContent = 'Syncing...';
  await BrowserApi.sendMessage({ action: 'SYNC_NOW' });
  const data = await BrowserApi.sendMessage({ action: 'GET_DATA' });
  showMainView(data);
  btnSyncNow.textContent = '🔄 Sync';
});

// Open Dashboard
btnOpenDash?.addEventListener('click', () => {
  chrome.tabs.create({ url: 'http://localhost:5173' });
});

// Logout
btnLogout?.addEventListener('click', async () => {
  await BrowserApi.sendMessage({ action: 'LOGOUT' });
  showAuthView();
});

init();

