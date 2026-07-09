import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LINE_CHANNEL_SECRET  = Deno.env.get('TAVERA_LINE_CHANNEL_SECRET')!;
const LINE_ACCESS_TOKEN    = Deno.env.get('TAVERA_LINE_CHANNEL_ACCESS_TOKEN')!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const MEAL_LABEL: Record<string, string> = { breakfast: '朝食', lunch: '昼食', dinner: '夕食' };

async function verifySignature(body: string, signature: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(LINE_CHANNEL_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    return btoa(String.fromCharCode(...new Uint8Array(sig))) === signature;
  } catch { return false; }
}

// text のみ、またはquickReply付きの返信メッセージを送信
async function replyMessage(replyToken: string, text: string, quickReplyItems?: any[]) {
  const message: Record<string, unknown> = { type: 'text', text };
  if (quickReplyItems?.length) message.quickReply = { items: quickReplyItems };
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` },
    body: JSON.stringify({ replyToken, messages: [message] }),
  });
}

async function pushMessage(lineUserId: string, text: string) {
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
  });
}

// 献立（日付・食事区分）へ直接飛べるTavera側のディープリンクを生成
// openExternalBrowser=1 を付与することで、LINEアプリ内ブラウザ(WebView)ではなく
// 端末のデフォルトブラウザで開かせる（LINE公式が対応しているクエリパラメータ）。
// これによりGoogleログイン時の「disallowed_useragent」エラーを未然に防ぐ。
function buildMealLink(date: string, mealType: string): string {
  return `https://tavera.taskra.jp/home.html?date=${date}&meal=${mealType}&openExternalBrowser=1`;
}

// 自動割り当てを訂正するためのクイックリプライ（現在の食事区分以外の2つの食事区分＋前日／翌日）
function buildQuickReplyItems(commentId: string, currentMeal: string) {
  const mealOptions = [
    { key: 'breakfast', label: '🌅 朝', text: '朝に変更' },
    { key: 'lunch',     label: '☀️ 昼', text: '昼に変更' },
    { key: 'dinner',    label: '🌙 夕', text: '夕に変更' },
  ].filter(m => m.key !== currentMeal);

  const items: any[] = mealOptions.map(m => ({
    type: 'action',
    action: { type: 'postback', label: m.label, data: `fixmeal:${commentId}:${m.key}`, displayText: m.text },
  }));

  items.push({
    type: 'action',
    action: { type: 'postback', label: '📅 前日', data: `fixdate:${commentId}:-1`, displayText: '前日に変更' },
  });
  items.push({
    type: 'action',
    action: { type: 'postback', label: '📅 翌日', data: `fixdate:${commentId}:1`, displayText: '翌日に変更' },
  });

  return items;
}

// JST基準で今日から+n日の日付を返す（現在時刻を+9時間シフトしてからUTCの日付を読む方式なので実行環境のタイムゾーンに依存せず正しい）
function getJstDate(plusDays = 0): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000 + plusDays * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

// 日付文字列（YYYY-MM-DD）を直接パースして表示用ラベルを作る。
// Dateオブジェクトを経由してgetMonth()/getDate()を使うと、Deno実行環境（UTC）の
// ローカルタイムゾーンで解釈されてJSTとズレる（1日ズレる）ため、文字列直接パースで回避する。
function formatDateLabel(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

// 日付文字列（YYYY-MM-DD）にN日加算する。Date.UTCでカレンダー日付として手場に構築し、
// setUTCDate/getUTCDateで計算することで、実行環境のタイムゾーンに一切依存せず正確にシフトできる。
function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, dd] = dateStr.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, dd));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

// 現在時刻からデフォルトの食事区分を推定（log.htmlのgetDefaultMealSlotと同一ロジック）
function getDefaultMealSlot(): { date: string; mealType: string } {
  const hour = Number(new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(11, 13));
  if (hour >= 21) return { date: getJstDate(1), mealType: 'breakfast' };
  if (hour >= 14) return { date: getJstDate(0), mealType: 'dinner' };
  if (hour >= 9)  return { date: getJstDate(0), mealType: 'lunch' };
  return { date: getJstDate(0), mealType: 'breakfast' };
}

Deno.serve(async (req) => {
  if (req.method === 'GET') return new Response('OK', { status: 200 });

  const body = await req.text();
  const signature = req.headers.get('x-line-signature') || '';
  if (!body || body === '{}') return new Response('OK', { status: 200 });

  const valid = await verifySignature(body, signature);
  if (!valid) {
    const payload = JSON.parse(body);
    if (!payload.events?.length) return new Response('OK', { status: 200 });
    return new Response('Unauthorized', { status: 401 });
  }

  const { events = [] } = JSON.parse(body);

  for (const event of events) {
    const lineUserId = event.source?.userId;
    if (!lineUserId) continue;

    // 友だち追加時のウェルカム
    if (event.type === 'follow') {
      await replyMessage(event.replyToken,
        '🍚 Taveraの公式 LINEです！\n\nTaveraアプリの設定　→　LINE連携　で発行した8桁の連携コードを、このまま送信してください。\n\n連携後は、献立へのコメントが届いたり、LINEから返信するとそのままTaveraに記録できるようになります。'
      );
      continue;
    }

    // クイックリプライ（日付・食事区分の訂正）のタップ
    if (event.type === 'postback') {
      const data: string = event.postback?.data || '';
      const [action, commentId, value] = data.split(':');
      if (!commentId || (action !== 'fixmeal' && action !== 'fixdate')) continue;

      const { data: member } = await sb.from('menu_members').select('id, household_id, name').eq('line_user_id', lineUserId).maybeSingle();
      if (!member) continue;

      const { data: comment } = await sb.from('menu_meal_comments').select('*').eq('id', commentId).maybeSingle();
      if (!comment || comment.author_id !== member.id) {
        await replyMessage(event.replyToken, '❌ すでに変更されているか、この操作はできませんでした。');
        continue;
      }

      let newDate = comment.date;
      let newMeal = comment.meal_type;
      if (action === 'fixmeal') {
        newMeal = value;
      } else {
        const days = parseInt(value, 10) || 0;
        newDate = addDaysToDateStr(comment.date, days);
      }

      await sb.from('menu_meal_comments').update({ date: newDate, meal_type: newMeal }).eq('id', commentId);
      // 訂正は話題の「終わり」として扱い、文脈は更新しない（更新すると、この後の
      // 無関係な新しい発言まで訂正後の内容に引きずられてしまうため）

      await replyMessage(event.replyToken, `✅ ${formatDateLabel(newDate)}の${MEAL_LABEL[newMeal]}に変更しました\n${buildMealLink(newDate, newMeal)}`);
      continue;
    }

    if (event.type !== 'message' || event.message?.type !== 'text') continue;

    const replyToken = event.replyToken;
    const text = (event.message.text || '').trim();

    const { data: member } = await sb.from('menu_members').select('id, household_id, name').eq('line_user_id', lineUserId).maybeSingle();

    // 未連携 → 連携コードとして処理を試行
    if (!member) {
      const code = text.toUpperCase();
      if (/^[A-Z0-9]{6,10}$/.test(code)) {
        const { data: linkData } = await sb.from('menu_line_link_codes').select('*')
          .eq('code', code).is('used_at', null)
          .gt('expires_at', new Date().toISOString()).maybeSingle();

        if (linkData) {
          await sb.from('menu_members').update({ line_user_id: lineUserId, line_linked_at: new Date().toISOString() }).eq('id', linkData.member_id);
          await sb.from('menu_line_link_codes').update({ used_at: new Date().toISOString() }).eq('code', code);
          await replyMessage(replyToken, '✅ Taveraとの連携が完了しました！\n\n今後、献立へのコメントがここに届きます。このまま返信すると、その内容がTaveraのコメントとして記録されます。');
        } else {
          await replyMessage(replyToken, '❌ 連携コードが無効か期限切れです。\nTaveraの設定→LINE連携から新しいコードを発行してください。');
        }
      } else {
        await replyMessage(replyToken, '👋 Taveraとの連携がまだです。\n\nTaveraアプリの設定→LINE連携から発行した8桁のコードを送信してください。');
      }
      continue;
    }

    // 連携済み → この発言をコメントとして記録
    // 文脈（どの日付・食事区分に対する発言か）を、直近のプッシュ通知から推定。
    // 1時間以内の文脈がなければ、現在時刻からのデフォルトの食事区分にフォールバック
    // （以前は6時間だったが、直前の訂正操作の文脈を無関係な後続発言まで
    // 引きずらってしまう不具合があったため短縮。あわせて訂正操作自体は
    // 文脈を更新しないよう変更済み）
    const { data: ctx } = await sb.from('menu_line_contexts').select('*').eq('member_id', member.id).maybeSingle();
    let date: string, mealType: string;
    const ctxFresh = ctx && (Date.now() - new Date(ctx.updated_at).getTime()) < 1 * 3600 * 1000;
    if (ctxFresh) {
      date = ctx.date; mealType = ctx.meal_type;
    } else {
      const slot = getDefaultMealSlot();
      date = slot.date; mealType = slot.mealType;
    }

    const { data: newComment, error: insErr } = await sb.from('menu_meal_comments').insert({
      household_id: member.household_id, date, meal_type: mealType,
      author_id: member.id, body: text, source: 'line',
    }).select().single();

    if (insErr || !newComment) {
      await replyMessage(replyToken, '❌ 記録に失敗しました。時間をおいてお試しください。');
      continue;
    }

    // 自分の文脈も更新
    await sb.from('menu_line_contexts').upsert({ member_id: member.id, household_id: member.household_id, date, meal_type: mealType, updated_at: new Date().toISOString() });

    const dateLabel = formatDateLabel(date);
    const mealLink = buildMealLink(date, mealType);
    const quickReplyItems = buildQuickReplyItems(newComment.id, mealType);
    await replyMessage(
      replyToken,
      `✅ 記録しました：${dateLabel}の${MEAL_LABEL[mealType]}に「${text}」\n${mealLink}\n違ったらこちらから選び直せます👇`,
      quickReplyItems
    );

    // 他の連携済みメンバーにも通知
    const { data: others } = await sb.from('menu_members').select('id, line_user_id, name')
      .eq('household_id', member.household_id).not('line_user_id', 'is', null).neq('id', member.id);
    for (const o of others || []) {
      await pushMessage(o.line_user_id, `🍚 Tavera｜${dateLabel}の${MEAL_LABEL[mealType]}\n${member.name || '家族'}: ${text}\n${mealLink}`);
      await sb.from('menu_line_contexts').upsert({ member_id: o.id, household_id: member.household_id, date, meal_type: mealType, updated_at: new Date().toISOString() });
    }
  }

  return new Response('OK', { status: 200 });
});
