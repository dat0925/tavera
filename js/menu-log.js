// =====================
// menu-log.js - 献立ログ CRUD
// =====================

// 日付フォーマット (YYYY-MM-DD)
// 注意：toISOString()はUTCに変換してから文字列化するため、日本時間の
// 深夜0:00〜8:59台に呼ぶと前日の日付になってしまうバグがあった（v1.16.2で修正）。
// ローカルの年月日をそのまま使うことで、タイムゾーンに関わらず「現地の今日」を返す。
function toDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 現在時刻から「次に記録するのに最も近い」食事区分と日付を推定する（v1.16.2）
// 0:00〜8:59  → 今日の朝（まだ朝食前）
// 9:00〜13:59 → 今日の昼
// 14:00〜20:59→ 今日の夜
// 21:00〜23:59→ 翌日の朝（夜も終わっているため次は翌朝）
function getDefaultMealSlot(now = new Date()) {
  const hour = now.getHours();
  let mealType = 'breakfast';
  let dateObj = now;
  if (hour >= 21) {
    mealType = 'breakfast';
    dateObj = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  } else if (hour >= 14) {
    mealType = 'dinner';
  } else if (hour >= 9) {
    mealType = 'lunch';
  } else {
    mealType = 'breakfast';
  }
  return { date: toDateStr(dateObj), mealType };
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
  return new Set(data.map(d => d.date));
}

// 献立ログを保存（upsert）
async function saveLog({ householdId, date, mealType, dishName, memo, ingredients, rating }) {
  const user = await getUser();
  if (!user) return null;

  const { data: existing } = await db
    .from('menu_logs')
    .select('id')
    .eq('household_id', householdId)
    .eq('date', date)
    .eq('meal_type', mealType)
    .single();

  if (existing) {
    const { data, error } = await db
      .from('menu_logs')
      .update({ dish_name: dishName, memo, ingredients, rating })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) { console.error(error); return null; }
    return data;
  } else {
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
  const { data: member } = await db
    .from('menu_members')
    .select('household_id')
    .eq('id', userId)
    .single();

  if (member?.household_id) return member.household_id;

  const { data: household, error: hErr } = await db
    .from('menu_households')
    .insert({ created_by: userId, name: 'わが家' })
    .select()
    .single();

  if (hErr) { console.error(hErr); return null; }

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

// 招待コードで世帯に参加
async function joinHouseholdByCode(userId, code) {
  const { data: households, error: searchErr } = await db
    .rpc('find_household_by_code', { code: code.toLowerCase() });

  if (searchErr) { console.error(searchErr); return { ok: false, message: 'エラーが発生しました' }; }
  if (!households || households.length === 0) return { ok: false, message: '招待コードが見つかりません' };
  if (households.length > 1) return { ok: false, message: 'コードが一致する世帯が複数あります。もう一度お試しください' };

  const targetHousehold = households[0];

  const { data: existing } = await db
    .from('menu_members')
    .select('household_id')
    .eq('id', userId)
    .single();

  if (existing?.household_id === targetHousehold.id) {
    return { ok: false, message: 'すでにこの世帯のメンバーです' };
  }

  const { error: updateErr } = await db
    .from('menu_members')
    .update({ household_id: targetHousehold.id, role: 'member' })
    .eq('id', userId);

  if (updateErr) { console.error(updateErr); return { ok: false, message: '参加に失敗しました' }; }
  return { ok: true, householdName: targetHousehold.name };
}

// =====================
// 冷蔵庫食材 CRUD
// =====================

// 冷蔵庫食材を全件取得
async function getFridgeItems(householdId) {
  const { data, error } = await db
    .from('menu_fridge_items')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: true });
  if (error) { console.error(error); return []; }
  return data || [];
}

// 冷蔵庫食材を追加
async function addFridgeItem(householdId, name, expiresOn = null) {
  const user = await getUser();
  if (!user) return null;
  const { data, error } = await db
    .from('menu_fridge_items')
    .insert({
      household_id: householdId,
      name: name.trim(),
      expires_on: expiresOn || null,
      created_by: user.id,
    })
    .select()
    .single();
  if (error) { console.error(error); return null; }
  return data;
}

// 冷蔵庫食材を削除
async function deleteFridgeItem(itemId) {
  const { error } = await db
    .from('menu_fridge_items')
    .delete()
    .eq('id', itemId);
  return !error;
}

// 冷蔵庫食材の期限を更新
async function updateFridgeExpiry(itemId, expiresOn) {
  const { error } = await db
    .from('menu_fridge_items')
    .update({ expires_on: expiresOn || null })
    .eq('id', itemId);
  return !error;
}

// =====================
//  家族メンバー（アレルギー管理）
// =====================

// 家族メンバー一覧を取得
async function getFamilyMembers(householdId) {
  const { data } = await db
    .from('menu_family_members')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at');
  return data || [];
}

// 食材リストとアレルギーを照合
// 戻り値: [{ memberName, allergen }, ...]
function checkAllergies(ingredients, familyMembers) {
  const hits = [];
  familyMembers.forEach(m => {
    (m.allergies || []).forEach(allergen => {
      const matched = ingredients.find(ing =>
        ing.includes(allergen) || allergen.includes(ing)
      );
      if (matched) {
        hits.push({ memberName: m.nickname, allergen });
      }
    });
  });
  return hits;
}

// AI（Gemini/Claude）が判定したアレルゲン名の配列を、家族メンバーに割り当てる
// 戻り値: [{ memberName, allergen }, ...]（checkAllergies()と同じ形式）
// 給食取込のように「AIが食材から推測したアレルゲン名」（食材リストそのものではない）を
// 家族の登録アレルギーと突き合わせる場合に使う
function mapAllergensToMembers(allergenNames, familyMembers) {
  const hits = [];
  (familyMembers || []).forEach(m => {
    (m.allergies || []).forEach(allergen => {
      const matched = (allergenNames || []).some(a =>
        a.includes(allergen) || allergen.includes(a)
      );
      if (matched) {
        hits.push({ memberName: m.nickname, allergen });
      }
    });
  });
  return hits;
}

// アレルギーヒット配列の重複を除去（memberName+allergenの組み合わせで判定）
function dedupeAllergyHits(hits) {
  const seen = new Set();
  const result = [];
  (hits || []).forEach(h => {
    const key = h.memberName + '::' + h.allergen;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(h);
    }
  });
  return result;
}

// 給食インポート由来の記録に付けるバッジHTML（source='kyushoku'の時のみ表示）
function srcBadge(log) {
  if (!log || log.source !== 'kyushoku') return '';
  return '<span class="src-badge-kyushoku">🍱 給食</span>';
}
