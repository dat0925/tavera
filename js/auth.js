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

  const overlay = document.createElement('div');
  overlay.className = 'eb-guide-overlay';
  overlay.innerHTML = `
    <div class="eb-guide-card">
      <div class="eb-guide-icon">🔒</div>
      <h3 class="eb-guide-title">このアプリ内ブラウザでは<br>Googleログインができません</h3>
      <p class="eb-guide-text">
        Googleのセキュリティポリシーにより、LINEなどアプリ内のブラウザから直接ログインすることができません。<br>
        右上の「•••」（メニュー）から<strong>「外部ブラウザで開く」</strong>を選択し、Safari（またはChrome）でTaveraを開き直してからログインしてください。
      </p>
      <button class="eb-guide-close-btn" id="ebGuideCloseBtn">閉じる</button>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('ebGuideCloseBtn').addEventListener('click', () => {
    overlay.remove();
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
      .eb-guide-close-btn {
        width: 100%; padding: 12px; border: none;
        border-radius: 99px; font-weight: 700; font-size: 0.9rem;
        cursor: pointer;
        background: var(--olive, #6B7A3A); color: #fff;
      }
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
// Undo付きトースト／遅延削除（UI洗練2）
// =====================
// 削除を「画面から即消す → 約6秒のUndo猶予が過ぎてからDB削除を実行する」
// 遅延削除にするための共有土台。UndoされればDBには一切触れないため、
// 復元時にIDが変わるなどの事故が起きない。
// 猶予中にページ遷移が起きた場合は pagehide / beforeunload で保留中の
// 削除を即実行に回し（ベストエフォート）、画面で見た「消えた」状態と
// DBの一致を図る。
const UNDO_DELETE_DELAY_MS = 6000;
const pendingDeletes = new Map();

function showToastWithAction(message, actionLabel, onAction, durationMs = UNDO_DELETE_DELAY_MS, type = 'info') {
  // 置換ルールは通常トーストと同じ（既存の .toast は消える）
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const colors = {
    info:    'var(--brown)',
    success: 'var(--olive)',
    error:   'var(--terra)',
  };

  const toast = document.createElement('div');
  toast.className = 'toast toast-action';
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '100px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: colors[type] || colors.info,
    color: '#fff',
    padding: '10px 12px 10px 20px',
    borderRadius: '99px',
    fontSize: '0.85rem',
    fontWeight: '700',
    zIndex: '9999',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    animation: 'fadeInUp 0.3s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    maxWidth: 'calc(100vw - 32px)',
    boxSizing: 'border-box',
  });

  const msg = document.createElement('span');
  msg.textContent = message;
  Object.assign(msg.style, {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: '0',
  });

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = actionLabel;
  Object.assign(btn.style, {
    flexShrink: '0',
    background: '#fff',
    color: colors[type] || colors.info,
    border: 'none',
    borderRadius: '99px',
    padding: '6px 14px',
    fontSize: '0.85rem',
    fontWeight: '700',
    fontFamily: 'inherit',
    cursor: 'pointer',
  });

  const timer = setTimeout(() => toast.remove(), durationMs);
  btn.addEventListener('click', () => {
    clearTimeout(timer);
    toast.remove();
    if (onAction) onAction();
  });

  toast.appendChild(msg);
  toast.appendChild(btn);
  document.body.appendChild(toast);
  return toast;
}

function isPendingDelete(key) {
  return pendingDeletes.has(key);
}

// scheduleDeferredDelete({ key, message, execute, onUndo, onCommit, onFail })
// - key: 対象を一意に指す文字列（例 'fridge:<id>'）。同じkeyの二重登録は無視する
// - execute: 猶予経過後に実行する実削除。trueを返したら成功扱い
// - onUndo / onCommit / onFail: それぞれの確定時に呼ばれる再描画用コールバック
function scheduleDeferredDelete(opts) {
  if (!opts || !opts.key || typeof opts.execute !== 'function') return false;
  if (pendingDeletes.has(opts.key)) return false;

  const entry = {
    execute: opts.execute,
    onCommit: opts.onCommit,
    onFail: opts.onFail,
    timer: null,
    settled: false,
  };
  pendingDeletes.set(opts.key, entry);
  entry.timer = setTimeout(() => { commitDeferredDelete(opts.key); }, UNDO_DELETE_DELAY_MS);

  showToastWithAction(opts.message || '削除しました', '元に戻す', () => {
    if (entry.settled) return;
    entry.settled = true;
    clearTimeout(entry.timer);
    pendingDeletes.delete(opts.key);
    if (opts.onUndo) opts.onUndo();
  });
  return true;
}

async function commitDeferredDelete(key) {
  const entry = pendingDeletes.get(key);
  if (!entry || entry.settled) return;
  entry.settled = true;
  pendingDeletes.delete(key);

  let ok = false;
  try {
    ok = await entry.execute();
  } catch (e) {
    console.error(e);
    ok = false;
  }
  if (ok) {
    if (entry.onCommit) entry.onCommit();
  } else {
    if (entry.onFail) entry.onFail();
    showToast('削除に失敗しました', 'error');
  }
}

// ページを離れる時は保留中の削除を即実行する（画面の状態とDBを一致させる）。
// unload中の非同期リクエストはブラウザに打ち切られる場合があるため
// ベストエフォートとして扱う。
function flushPendingDeletes() {
  for (const [key, entry] of Array.from(pendingDeletes.entries())) {
    if (entry.settled) continue;
    entry.settled = true;
    clearTimeout(entry.timer);
    pendingDeletes.delete(key);
    try {
      const p = entry.execute();
      if (p && typeof p.catch === 'function') p.catch(e => console.error(e));
    } catch (e) {
      console.error(e);
    }
  }
}
window.addEventListener('pagehide', flushPendingDeletes);
window.addEventListener('beforeunload', flushPendingDeletes);

// =====================
// コメント削除の保留判定（UI洗練 残り候補: コメント削除のUndo化）
// =====================
// 保留中コメントIDのレジストリは pendingDeletes そのものを使う
// （key = 'comment:<commentId>'）。scheduleDeferredDelete の二重登録ガードもそのまま効く。
// 一覧・件数の取得層（js/menu-log.js）がこの判定だけを参照すれば、
// home / history / log の描画側にフィルタを複製せずに済み、
// 保留中のコメントが再描画や件数バッジに復活しない。
function commentDeleteKey(commentId) {
  return 'comment:' + commentId;
}

function isCommentDeletePending(commentId) {
  return isPendingDelete(commentDeleteKey(commentId));
}

// 取得したコメント行の配列から削除保留中のものを取り除く
// （一覧取得・件数集計の共通フィルタ。行には id が含まれる前提）
function excludePendingDeletedComments(rows) {
  return (rows || []).filter(r => !isCommentDeletePending(r.id));
}

// =====================
//  シートの下スワイプで閉じる（UI洗練3: 5-軽）
// =====================
// ボトムシート／下付きモーダルのハンドル／タイトル領域からだけ
// ドラッグを開始し、下方向へ閾値を超えたら既存の閉じる処理を呼ぶ。
// シート内コンテンツのスクロールとは競合しない（開始領域が非スクロール）。
// ドラッグ中は transition を切り、transform のみで追従させる。
// 途中で離した場合は transform を戻し、シート側の transition で滑らかに復帰する。
const SHEET_DRAG_CLOSE_THRESHOLD_PX = 80;

function sheetDragOffset(startY, currentY) {
  return Math.max(0, currentY - startY);
}

function sheetDragShouldClose(dy) {
  return dy > SHEET_DRAG_CLOSE_THRESHOLD_PX;
}

// initSheetDragClose(sheetEl, dragEls, onClose)
// - dragEls: ドラッグ開始領域（要素、または要素の配列。ハンドルとタイトルを渡す）
// - onClose: 既存の閉じる処理そのもの（状態リセット含む）を渡す
function initSheetDragClose(sheetEl, dragEls, onClose) {
  if (!sheetEl || typeof onClose !== 'function') return;
  const els = (Array.isArray(dragEls) ? dragEls : [dragEls]).filter(Boolean);
  if (!els.length) return;

  let startY = null;
  let currentDy = 0;

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    startY = e.clientY;
    currentDy = 0;
    sheetEl.style.transition = 'none';
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
  }

  function onPointerMove(e) {
    if (startY === null) return;
    currentDy = sheetDragOffset(startY, e.clientY);
    sheetEl.style.transform = `translateY(${currentDy}px)`;
  }

  function finishDrag(shouldClose) {
    if (startY === null) return;
    startY = null;
    // シート側に transition が無いモーダル（系統B）でも滑らかに戻せるよう、
    // 復帰・退場の間だけ一時的な transition を当て、終わったら元の定義に戻す
    sheetEl.style.transition = 'transform 0.2s ease';
    sheetEl.style.transform = '';
    if (shouldClose && sheetDragShouldClose(currentDy)) {
      onClose();
    }
    currentDy = 0;
    setTimeout(() => { sheetEl.style.transition = ''; }, 220);
  }

  els.forEach(el => {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', () => finishDrag(true));
    el.addEventListener('pointercancel', () => finishDrag(false));
    // auth.js の Pull to Refresh（document の touch 監視）にシートの
    // ドラッグを拾わせないため、開始領域からの touch はここで止める
    el.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
    el.addEventListener('touchmove', e => e.stopPropagation(), { passive: true });
  });
}

// =====================
//  一覧の差し替え（UI洗練3-軽: 差分更新の軽い分）
// =====================
// コメント一覧のように「取得 → innerHTML 全再構築」が基本の一覧で、
// 再取得のたびに起きる点滅（ちらつき）を抑えるための共有ヘルパー。
// 行単位の diffing はせず、次の3点だけを行う:
//  1. 同一HTMLなら差し替えない（点滅なし、スクロール・DOM状態を保持）
//  2. 差し替える場合も、末尾付近を見ていない時は scrollTop を復元する。
//     末尾付近を見ている時と、初回・ローディングからの差し替え時は
//     従来どおり末尾へスクロールし、最新コメントを見せる挙動を維持する
//  3. 同じ対象の再取得では loading-dots に置き換えず、
//     既存表示のまま裏で取得して、差分がある時だけ差し替える
//     （対象が変わった場合は従来どおりローディング表示にする）
const LIST_LOADING_HTML = '<div class="loading-dots" style="justify-content:center;padding:8px 0"><span></span><span></span><span></span></div>';
const LIST_NEAR_BOTTOM_PX = 48;
const listAppliedHTML = new WeakMap();
const listTargetKeys = new WeakMap();

// 差し替え後のスクロール位置を決める（純粋関数・単体テスト対象）
function listScrollTopAfterApply(state) {
  return (state.wasPlaceholder || state.nearBottom) ? state.scrollHeight : state.prevTop;
}

// 取得開始時の表示切替。同じ対象で実コンテンツ表示中なら何もしない
// （既存表示のまま裏で取得する）。それ以外はローディング表示にする。
function beginListLoad(list, key) {
  if (!list) return;
  const sameTarget = key != null && listTargetKeys.get(list) === key;
  const hasContent = !!list.children.length && !list.querySelector('.loading-dots');
  if (sameTarget && hasContent) return;
  listTargetKeys.set(list, key);
  list.innerHTML = LIST_LOADING_HTML;
  listAppliedHTML.set(list, LIST_LOADING_HTML);
}

// 生成したHTMLを一覧へ反映する。同一なら差し替え自体をスキップする。
// 戻り値: 実際に差し替えたら true
function applyListHTML(list, html) {
  if (!list) return false;
  if (listAppliedHTML.get(list) === html || list.innerHTML === html) {
    listAppliedHTML.set(list, html);
    return false;
  }
  const wasPlaceholder = !list.children.length || !!list.querySelector('.loading-dots');
  const prevTop = list.scrollTop;
  const nearBottom = list.scrollHeight - prevTop - list.clientHeight <= LIST_NEAR_BOTTOM_PX;
  list.innerHTML = html;
  listAppliedHTML.set(list, html);
  list.scrollTop = listScrollTopAfterApply({
    wasPlaceholder, nearBottom, prevTop, scrollHeight: list.scrollHeight,
  });
  return true;
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
