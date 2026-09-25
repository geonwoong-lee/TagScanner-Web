// Supabase Edge Function: 앱 대신 Google Vision을 호출한다.
// 참가자가 각자 API 키를 넣지 않아도 되고, 키가 브라우저에 노출되지 않는다.
//
// 배포: Supabase 대시보드 > Edge Functions > Create function (이름: vision) > 이 코드 붙여넣기
// 비밀값: 같은 화면의 Secrets에 GOOGLE_VISION_API_KEY 등록
//
// 요청: POST { image: "<base64>" }  (로그인 사용자만, Authorization 헤더 필요)
// 응답: Vision API의 responses[0] 그대로

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';
const DAILY_LIMIT = 20; // 참가자 1명이 하루에 호출할 수 있는 횟수 (무료 한도와 비용을 지키기 위한 상한)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: '지원하지 않는 요청입니다' }, 405);

  const apiKey = Deno.env.get('GOOGLE_VISION_API_KEY');
  if (!apiKey) return json({ error: '서버에 API 키가 설정되지 않았습니다' }, 500);

  // 로그인한 참가자만 사용할 수 있게 확인한다
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: '로그인이 필요합니다' }, 401);

  // 하루 호출 횟수 제한 (무료 한도와 비용을 지키기 위해)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('event', 'ocr_called')
    .gte('created_at', since);
  if ((count ?? 0) >= DAILY_LIMIT) {
    return json({ error: `하루 인식 횟수(${DAILY_LIMIT}회)를 넘었습니다. 내일 다시 시도해 주세요.` }, 429);
  }

  let image: string | undefined;
  try {
    ({ image } = await req.json());
  } catch {
    return json({ error: '요청 형식이 올바르지 않습니다' }, 400);
  }
  if (!image) return json({ error: '이미지가 없습니다' }, 400);

  const res = await fetch(VISION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
    body: JSON.stringify({
      requests: [{
        image: { content: image },
        features: [{ type: 'TEXT_DETECTION', maxResults: 1 }, { type: 'LOGO_DETECTION', maxResults: 5 }],
        imageContext: { languageHints: ['ko', 'en'] },
      }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return json({ error: 'Vision 호출 실패', status: res.status, detail: detail.slice(0, 300) }, 502);
  }

  const data = await res.json();
  await supabase.from('usage_events').insert({
    user_id: user.id,
    event: 'ocr_called',
    payload: { bytes: image.length },
  });
  return json(data.responses?.[0] ?? {});
});
