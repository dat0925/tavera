import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LINE_ACCESS_TOKEN    = Deno.env.get('TAVERA_LINE_CHANNEL_ACCESS_TOKEN') || '';

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const MEAL_LABEL: Record<string, string> = { breakfast: '朝食', lunch: '昼食', dinner: '夕食' };
// 食べる側・作る側、両方のスタンプを統合（js/menu-log.jsのMEAL_COMMENT_STAMPSと同一内容）
const STAMP_LABEL: Record<string, string> = {
  eating_out:  '🍽️ 外で食べてきます',
  side_only:   '🍖 おかずだけ食べたいな',
  tasty:       '😋 おいしかった',
  thanks:      '🙏 ごちそうさま',
  appreciated: '🙏 いつもありがとう',
  cooking:     '🍳 これから作るね',
  running_late:'⏰ 少し遅れます',
  shopping:    '🛒 買い出し中',
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  };
}

// 日付文字列（YYYY-MM-DD）を直接パースして表示用ラベルを作る。
// Dateオブジェクトを経由してgetMonth()/getDate()を使うと、Deno実行環境（UTC）の
// ローカルタイムゾーンで解釈されてJSTとズレる（1日ズレる）ため、文字列直接パースで回避する。
function formatDateLabel(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

async function pushLine(lineUserId: string, text: string) {
  if (!LINE_ACCESS_TOKEN) return;
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  try {
    const { comment_id } = await req.json();
    if (!comment_id) {
      return new Response(JSON.stringify({ error: 'comment_id is required' }), { status: 400, headers: corsHeaders() });
    }

    const { data: comment, error: cErr } = await sb
      .from('menu_meal_comments')
      .select('*, menu_members!menu_meal_comments_author_id_fkey(name)')
      .eq('id', comment_id)
      .single();
    if (cErr || !comment) {
      return new Response(JSON.stringify({ error: 'comment not found' }), { status: 404, headers: corsHeaders() });
    }

    // 通知先：同じ世帯の投稿者以外のメンバーで、LINE連携済みの人
    const { data: recipients } = await sb
      .from('menu_members')
      .select('id, line_user_id')
      .eq('household_id', comment.household_id)
      .not('line_user_id', 'is', null)
      .neq('id', comment.author_id || '00000000-0000-0000-0000-000000000000');

    if (!recipients?.length) {
      return new Response(JSON.stringify({ ok: true, notified: 0 }), { status: 200, headers: corsHeaders() });
    }

    const authorName = comment.menu_members?.name || '家族';
    const dateLabel = formatDateLabel(comment.date);
    const mealLabel = MEAL_LABEL[comment.meal_type] || comment.meal_type;
    const parts = [comment.stamp ? STAMP_LABEL[comment.stamp] || comment.stamp : null, comment.body].filter(Boolean);
    const link = `https://tavera.taskra.jp/home.html?date=${comment.date}&meal=${comment.meal_type}`;
    const text = `🍚 Tavera｜${dateLabel}の${mealLabel}\n${authorName}: ${parts.join('　')}\n${link}\n\n（このままLINEで返信すると、この献立へのコメントとして記録されます）`;

    let notified = 0;
    for (const r of recipients) {
      await pushLine(r.line_user_id, text);
      // 返信の文脈（どの日付・食事区分への返信か）を更新
      await sb.from('menu_line_contexts').upsert({
        member_id: r.id,
        household_id: comment.household_id,
        date: comment.date,
        meal_type: comment.meal_type,
        updated_at: new Date().toISOString(),
      });
      notified++;
    }

    return new Response(JSON.stringify({ ok: true, notified }), { status: 200, headers: corsHeaders() });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders() });
  }
});
