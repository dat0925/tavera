// =====================
// Supabase 設定
// =====================
const SUPABASE_URL = 'https://sfhtvtcmgueystyuhzvd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmaHR2dGNtZ3VleXN0eXVoenZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3Nzg0MDYsImV4cCI6MjA5MDM1NDQwNn0.qsON2xYdDf22LtU-jGd96Ubaif0xzzswC9KnzWndKNw';

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
