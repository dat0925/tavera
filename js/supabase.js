// =====================
// Supabase 設定
// ここにSupabaseのURL・ANON KEYを設定してください
// =====================
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

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
  return currentUser;
}

// ログインページへリダイレクト（未認証時）
async function requireAuth() {
  const user = await getUser();
  if (!user) {
    window.location.href = '/tavera/index.html';
    return null;
  }
  return user;
}

// ホームへリダイレクト（認証済み時）
async function redirectIfAuthed() {
  const user = await getUser();
  if (user) {
    window.location.href = '/tavera/home.html';
  }
}
