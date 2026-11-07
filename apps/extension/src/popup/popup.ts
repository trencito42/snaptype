import { BrowserApi } from '@snaptype/browser-compat';
import { Snippet } from '@snaptype/shared';
import { renderSnippet } from '@snaptype/snippet-engine';

declare const __SNAPTYPE_APP_URL__: string;
const APP_URL = typeof __SNAPTYPE_APP_URL__ !== 'undefined' ? __SNAPTYPE_APP_URL__ : 'http://localhost:5173';
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
    const emptyDiv = document.createElement('div');
    emptyDiv.style.padding = '20px';
    emptyDiv.style.textAlign = 'center';
    emptyDiv.style.color = '#686b66';
    emptyDiv.style.fontSize = '12px';
    emptyDiv.textContent = 'No snippets available';
    snippetList.appendChild(emptyDiv);
    return;
  }

  for (const s of snippets) {
    const row = document.createElement('div');
    row.className = 'snippet-row';

    const infoDiv = document.createElement('div');
    infoDiv.style.display = 'flex';
    infoDiv.style.flexDirection = 'column';
    infoDiv.style.flex = '1';
    infoDiv.style.overflow = 'hidden';

    const titleEl = document.createElement('span');
    titleEl.className = 'row-title';
    titleEl.textContent = s.name;

    const shortcutEl = document.createElement('span');
    shortcutEl.className = 'row-shortcut';
    shortcutEl.textContent = s.shortcut;
    shortcutEl.style.alignSelf = 'flex-start';
    shortcutEl.style.marginTop = '2px';

    infoDiv.appendChild(titleEl);
    infoDiv.appendChild(shortcutEl);

    const actionDiv = document.createElement('div');
    actionDiv.style.display = 'flex';
    actionDiv.style.gap = '4px';

    // Insert Button (Primary Action)
    const insertBtn = document.createElement('button');
    insertBtn.className = 'popup-btn popup-btn-primary';
    insertBtn.style.padding = '3px 8px';
    insertBtn.style.fontSize = '11px';
    insertBtn.style.margin = '0';
    insertBtn.textContent = 'Insert';
    insertBtn.onclick = (e) => {
      e.stopPropagation();
      const rendered = renderSnippet(s.plainContent);
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(
              tabs[0].id,
              {
                action: 'INSERT_TEXT',
                text: rendered.text,
                cursorOffset: rendered.cursorOffset
              },
              () => {
                insertBtn.textContent = 'Inserted!';
                setTimeout(() => (insertBtn.textContent = 'Insert'), 1000);
              }
            );
          }
        });
      } catch {
        // Tab not available or permissions restricted
      }
    };

    // Copy Button (Secondary Action, ST-017)
    const copyBtn = document.createElement('button');
    copyBtn.className = 'popup-btn popup-btn-ghost';
    copyBtn.style.padding = '3px 8px';
    copyBtn.style.fontSize = '11px';
    copyBtn.style.margin = '0';
    copyBtn.style.border = '1px solid var(--border)';
    copyBtn.textContent = 'Copy';
    copyBtn.onclick = async (e) => {
      e.stopPropagation();
      try {
        const rendered = renderSnippet(s.plainContent);
        await navigator.clipboard.writeText(rendered.text);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => (copyBtn.textContent = 'Copy'), 1000);
      } catch {
        copyBtn.textContent = 'Failed';
        setTimeout(() => (copyBtn.textContent = 'Copy'), 1000);
      }
    };

    actionDiv.appendChild(insertBtn);
    actionDiv.appendChild(copyBtn);

    row.appendChild(infoDiv);
    row.appendChild(actionDiv);

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
  chrome.tabs.create({ url: APP_URL });
});

// Logout
btnLogout?.addEventListener('click', async () => {
  await BrowserApi.sendMessage({ action: 'LOGOUT' });
  showAuthView();
});

init();

