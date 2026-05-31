// =====================
// auth.js - Google認証
// =====================

async function signInWithGoogle() {
  const { error } = await db.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'https://tavera.taskra.jp/home.html'
    }
  });
  if (error) {
    console.error('ログインエラー:', error.message);
    showToast('ログインに失敗しました', 'error');
  }
}

async function signOut() {
  const { error } = await db.auth.signOut();
  if (!error) {
    window.location.href = 'https://tavera.taskra.jp/';
  }
}

// ユーザー情報をUIに反映
async function renderUserInfo(elementId) {
  const user = await getUser();
  if (!user) return;
  const el = document.getElementById(elementId);
  if (!el) return;
  el.innerHTML = `
    <img src="${user.user_metadata.avatar_url || ''}" 
         alt="${user.user_metadata.full_name || ''}"
         style="width:28px;height:28px;border-radius:50%;object-fit:cover;">
  `;
}

// Toast通知
function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;

  const colors = {
    info:    'var(--brown)',
    success: 'var(--olive)',
    error:   'var(--terra)',
  };

  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '100px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: colors[type] || colors.info,
    color: '#fff',
    padding: '10px 20px',
    borderRadius: '99px',
    fontSize: '0.85rem',
    fontWeight: '700',
    zIndex: '9999',
    whiteSpace: 'nowrap',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    animation: 'fadeInUp 0.3s ease',
  });

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
