// =====================
// Supabase 設定
// =====================
const SUPABASE_URL = 'https://sfhtvtcmgueystyuhzvd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_g-33XdOGA-W_dRg_MT8Xfg_K1qzoDer';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// セッション管理
let currentUser = null;
let currentHousehold = null;

async function getSession() {
  const { data: { session } } = await db.auth.getSession();
  return session;
}

async function getUser() {
  const session = await getSession();
  if (!session) return null;
  currentUser = session.user;
  pushUserIdToDataLayer(currentUser.id);
  return currentUser;
}

// GA4 に user_id（Supabase の UUID）を渡す。
// メールアドレスなど個人を直接特定できる値は送らない。
// getUser() はページ内で何度も呼ばれるので、1ページにつき1回だけ push する。
let userIdPushed = false;
function pushUserIdToDataLayer(userId) {
  if (userIdPushed || !userId) return;
  userIdPushed = true;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ user_id: userId });
}

// ログインページへリダイレクト（未認証時）
async function requireAuth() {
  const user = await getUser();
  if (!user) {
    window.location.href = 'https://tavera.taskra.jp/';
    return null;
  }
  return user;
}

// ホームへリダイレクト（認証済み時）
async function redirectIfAuthed() {
  const user = await getUser();
  if (user) {
    window.location.href = 'https://tavera.taskra.jp/home.html';
  }
}
