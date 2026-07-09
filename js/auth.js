// =====================
// auth.js - Google認証
// =====================

// LINE・Instagram・Facebook・WeChat等のアプリ内ブラウザ(WebView)を検知する。
// これらのWebViewはGoogleのOAuthポリシーで恒久的にブロックされており
// （エラー403: disallowed_useragent）、Googleログインを試みても必ず失敗する。
// そのため、ログインボタンを押した時点でWebViewだと分かればOAuthを呼ばず、
// 先に「外部ブラウザで開いてください」という案内を表示する。
function isInAppBrowser() {
  const ua = navigator.userAgent || '';
  return /Line\//i.test(ua) ||
         /FBAN|FBAV/i.test(ua) ||      // Facebook
         /Instagram/i.test(ua) ||
         /MicroMessenger/i.test(ua) || // WeChat
         /Twitter/i.test(ua);
}

async function signInWithGoogle() {
  if (isInAppBrowser()) {
    showExternalBrowserGuide();
    return;
  }
  const { error } = await db.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'https://tavera.taskra.jp/home.html',
    }
  });
  if (error) {
    console.error('ログインエラー:', error.message);
    showToast('ログインに失敗しました', 'error');
  }
}

// 「外部ブラウザで開いてください」案内モーダルを表示する
function showExternalBrowserGuide() {
  if (document.querySelector('.eb-guide-overlay')) return;

  const currentUrl = window.location.href;

  const overlay = document.createElement('div');
  overlay.className = 'eb-guide-overlay';
  overlay.innerHTML = `
    <div class="eb-guide-card">
      <div class="eb-guide-icon">🔒</div>
      <h3 class="eb-guide-title">このアプリ内ブラウザでは<br>Googleログインができません</h3>
      <p class="eb-guide-text">
        Googleのセキュリティポリシーにより、LINEなどアプリ内のブラウザから直接ログインすることができません。<br>
        右上の「•••」（メニュー）から<strong>「外部ブラウザで開く」</strong>を選択してから、もう一度お試しください。
      </p>
      <button class="eb-guide-copy-btn" id="ebGuideCopyBtn">このページのURLをコピーする</button>
      <button class="eb-guide-close-btn" id="ebGuideCloseBtn">閉じる</button>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('ebGuideCloseBtn').addEventListener('click', () => {
    overlay.remove();
  });
  document.getElementById('ebGuideCopyBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      showToast('URLをコピーしました', 'success');
    } catch (e) {
      showToast('コピーに失敗しました', 'error');
    }
  });

  // スタイル未挿入なら一度だけ挿入
  if (!document.getElementById('ebGuideStyles')) {
    const style = document.createElement('style');
    style.id = 'ebGuideStyles';
    style.textContent = `
      .eb-guide-overlay {
        position: fixed; inset: 0; z-index: 10000;
        background: rgba(74,46,26,0.55);
        display: flex; align-items: center; justify-content: center;
        padding: 24px;
        animation: fadeInUp 0.2s ease;
      }
      .eb-guide-card {
        background: var(--surface, #FFF9F2);
        border-radius: var(--radius-lg, 24px);
        padding: 28px 24px;
        max-width: 360px;
        width: 100%;
        text-align: center;
        box-shadow: 0 8px 32px rgba(0,0,0,0.25);
      }
      .eb-guide-icon { font-size: 2rem; margin-bottom: 8px; }
      .eb-guide-title {
        font-family: var(--font-display, serif);
        color: var(--brown, #4A2E1A);
        font-size: 1.1rem; line-height: 1.5;
        margin: 0 0 12px;
      }
      .eb-guide-text {
        color: var(--brown, #4A2E1A);
        font-size: 0.9rem; line-height: 1.7;
        margin: 0 0 20px;
      }
      .eb-guide-copy-btn, .eb-guide-close-btn {
        width: 100%; padding: 12px; border: none;
        border-radius: 99px; font-weight: 700; font-size: 0.9rem;
        margin-bottom: 10px; cursor: pointer;
      }
      .eb-guide-copy-btn { background: var(--olive, #6B7A3A); color: #fff; }
      .eb-guide-close-btn { background: transparent; color: var(--muted, #9B8878); margin-bottom: 0; }
    `;
    document.head.appendChild(style);
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

// =====================
//  Pull to Refresh
// =====================
function initPullToRefresh(onRefresh) {
  // PWAモードのみ有効（スタンドアローン or display-mode）
  const isStandalone = window.navigator.standalone ||
    window.matchMedia('(display-mode: standalone)').matches;
  if (!isStandalone) return;

  // インジケーターを挿入
  const indicator = document.createElement('div');
  indicator.className = 'ptr-indicator';
  indicator.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
  document.body.appendChild(indicator);

  let startY = 0;
  let pulling = false;
  let scrollTarget = null;
  const THRESHOLD = 72;

  // タッチした要素の祖先をたどり、実際にスクロール可能な内部コンテナ
  // （overflow-y:auto/scroll かつ scrollHeight > clientHeight）を探す。
  // suggest.htmlのチャット欄など、ページ自体（window）は動かず内部のdivだけが
  // スクロールするレイアウトでは、window.scrollYだけでは「最上部にいるか」を
  // 判定できないため、この内部コンテナのscrollTopも併せて見る必要がある。
  function findScrollableAncestor(el) {
    while (el && el !== document.body && el !== document.documentElement) {
      const style = window.getComputedStyle(el);
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          el.scrollHeight > el.clientHeight + 1) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  document.addEventListener('touchstart', (e) => {
    scrollTarget = findScrollableAncestor(e.target);
    // ページ自体が最上部、かつ（内部スクロール領域が無い、またはそれも既に
    // 最上部）の場合のみpull-to-refreshを開始する。AI提案やリストなどを
    // スクロール中に誤発動して内容が消えてしまうのを防ぐ。
    if (window.scrollY === 0 && (!scrollTarget || scrollTarget.scrollTop === 0)) {
      startY = e.touches[0].clientY;
      pulling = true;
    } else {
      pulling = false;
    }
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    // 内部スクロール領域が動き始めた（=その領域内をスクロール中）場合は
    // pull-to-refreshを中断し、通常のスクロールに専念させる
    if (scrollTarget && scrollTarget.scrollTop > 0) {
      pulling = false;
      indicator.classList.remove('visible', 'pulling');
      return;
    }
    const diff = e.touches[0].clientY - startY;
    if (diff > 10) {
      indicator.classList.add('visible');
      if (diff > THRESHOLD) {
        indicator.classList.add('pulling');
      } else {
        indicator.classList.remove('pulling');
      }
    }
  }, { passive: true });

  document.addEventListener('touchend', async (e) => {
    if (!pulling) return;
    pulling = false;
    const diff = e.changedTouches[0].clientY - startY;
    if (diff > THRESHOLD) {
      indicator.classList.add('refreshing');
      indicator.classList.remove('pulling');
      await onRefresh();
      indicator.classList.remove('refreshing', 'visible');
    } else {
      indicator.classList.remove('visible', 'pulling');
    }
  }, { passive: true });
}
