// =====================
// menu-log.js - 献立ログ CRUD
// =====================

// 日付フォーマット (YYYY-MM-DD)
function toDateStr(date = new Date()) {
  return date.toISOString().split('T')[0];
}

// 今日の献立ログを取得
async function getTodayLogs(householdId) {
  const today = toDateStr();
  const { data, error } = await db
    .from('menu_logs')
    .select('*')
    .eq('household_id', householdId)
    .eq('date', today)
    .order('meal_type');
  if (error) { console.error(error); return []; }
  return data;
}

// 直近7日間の献立ログを取得（AI提案の文脈生成用）
async function getLogsForWeek(householdId) {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 6);
  const { data, error } = await db
    .from('menu_logs')
    .select('dish_name, date, meal_type, rating')
    .eq('household_id', householdId)
    .gte('date', toDateStr(weekAgo))
    .lte('date', toDateStr(today))
    .order('date', { ascending: false });
  if (error) { console.error(error); return []; }
  return data || [];
}

// 指定日の献立ログを取得
async function getLogsByDate(householdId, dateStr) {
  const { data, error } = await db
    .from('menu_logs')
    .select('*')
    .eq('household_id', householdId)
    .eq('date', dateStr)
    .order('meal_type');
  if (error) { console.error(error); return []; }
  return data;
}

// 月間ログ取得（カレンダー表示用）
async function getLogsForMonth(householdId, year, month) {
  const from = `${year}-${String(month).padStart(2,'0')}-01`;
  const to   = `${year}-${String(month).padStart(2,'0')}-31`;
  const { data, error } = await db
    .from('menu_logs')
    .select('date')
    .eq('household_id', householdId)
    .gte('date', from)
    .lte('date', to);
  if (error) { console.error(error); return []; }
  // ログがある日付のSetを返す
  return new Set(data.map(d => d.date));
}

// 献立ログを保存（upsert）
async function saveLog({ householdId, date, mealType, dishName, memo, ingredients, rating }) {
  const user = await getUser();
  if (!user) return null;

  // 既存レコードを確認
  const { data: existing } = await db
    .from('menu_logs')
    .select('id')
    .eq('household_id', householdId)
    .eq('date', date)
    .eq('meal_type', mealType)
    .single();

  if (existing) {
    // 更新
    const { data, error } = await db
      .from('menu_logs')
      .update({ dish_name: dishName, memo, ingredients, rating })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) { console.error(error); return null; }
    return data;
  } else {
    // 新規
    const { data, error } = await db
      .from('menu_logs')
      .insert({
        household_id: householdId,
        date,
        meal_type: mealType,
        dish_name: dishName,
        memo,
        ingredients,
        rating,
        created_by: user.id,
      })
      .select()
      .single();
    if (error) { console.error(error); return null; }
    return data;
  }
}

// 献立ログを削除
async function deleteLog(logId) {
  const { error } = await db
    .from('menu_logs')
    .delete()
    .eq('id', logId);
  return !error;
}

// 過去ログを検索
async function searchLogs(householdId, keyword) {
  const { data, error } = await db
    .from('menu_logs')
    .select('*')
    .eq('household_id', householdId)
    .ilike('dish_name', `%${keyword}%`)
    .order('date', { ascending: false })
    .limit(50);
  if (error) { console.error(error); return []; }
  return data;
}

// 高評価メニューを取得（AI提案用）
async function getLikedDishes(householdId, limit = 10) {
  const { data, error } = await db
    .from('menu_logs')
    .select('dish_name, rating, date')
    .eq('household_id', householdId)
    .gte('rating', 4)
    .order('rating', { ascending: false })
    .limit(limit);
  if (error) { console.error(error); return []; }
  return data;
}

// ユーザーのhousehold_idを取得（なければ作成）
async function getOrCreateHousehold(userId) {
  // まず既存のhousehold確認
  const { data: member } = await db
    .from('menu_members')
    .select('household_id')
    .eq('id', userId)
    .single();

  if (member?.household_id) return member.household_id;

  // なければ世帯を新規作成
  const { data: household, error: hErr } = await db
    .from('menu_households')
    .insert({ created_by: userId, name: 'わが家' })
    .select()
    .single();

  if (hErr) { console.error(hErr); return null; }

  // メンバーとして登録
  await db.from('menu_members').insert({
    id: userId,
    household_id: household.id,
    name: 'オーナー',
    role: 'owner',
  });

  return household.id;
}

// meal_typeの表示名
const MEAL_LABELS = {
  breakfast: '朝',
  lunch:     '昼',
  dinner:    '夜',
};

// 世帯メンバー一覧を取得
async function getHouseholdMembers(householdId) {
  const { data, error } = await db
    .from('menu_members')
    .select('id, name, role')
    .eq('household_id', householdId);
  if (error) { console.error(error); return []; }
  return data || [];
}

// 招待コードで世帯に参加（UPDATEで自分のhousehold_idを切り替え）
async function joinHouseholdByCode(userId, code) {
  // 招待コード（8文字）で世帯を検索（UUID→textにキャストして前方一致）
  const { data: households, error: searchErr } = await db
    .from('menu_households')
    .select('id, name')
    .filter('id::text', 'ilike', code.toLowerCase() + '%');

  if (searchErr) { console.error(searchErr); return { ok: false, message: 'エラーが発生しました' }; }
  if (!households || households.length === 0) return { ok: false, message: '招待コードが見つかりません' };
  if (households.length > 1) return { ok: false, message: 'コードが一致する世帯が複数あります。もう一度お試しください' };

  const targetHousehold = households[0];

  // すでにこの世帯のメンバーかチェック
  const { data: existing } = await db
    .from('menu_members')
    .select('household_id')
    .eq('id', userId)
    .single();

  if (existing?.household_id === targetHousehold.id) {
    return { ok: false, message: 'すでにこの世帯のメンバーです' };
  }

  // 自分のhousehold_idを更新
  const { error: updateErr } = await db
    .from('menu_members')
    .update({ household_id: targetHousehold.id })
    .eq('id', userId);

  if (updateErr) { console.error(updateErr); return { ok: false, message: '参加に失敗しました' }; }
  return { ok: true, householdName: targetHousehold.name };
}
