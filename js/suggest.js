// =====================
// suggest.js - AI献立提案
// Supabase Edge Function経由でClaude APIを呼び出す
// =====================

const EDGE_FUNCTION_URL = 'YOUR_SUPABASE_URL/functions/v1/tavera-suggest';

async function fetchAISuggest({ ingredients, budget, mood, likedDishes }) {
  const session = await getSession();
  if (!session) return null;

  const res = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ ingredients, budget, mood, likedDishes }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('AI提案エラー:', err);
    return null;
  }

  const data = await res.json();
  return data.suggestion;
}

// AI提案履歴を保存
async function saveAIHistory(householdId, { promptSummary, response, used = false }) {
  const { error } = await db
    .from('menu_ai_history')
    .insert({
      household_id: householdId,
      prompt_summary: promptSummary,
      response,
      used,
    });
  if (error) console.error(error);
}
