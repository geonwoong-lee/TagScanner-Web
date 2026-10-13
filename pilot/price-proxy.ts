// Supabase Edge Function: 네이버 쇼핑에서 온라인 최저가를 찾아온다.
// 크롤링이 아니라 네이버가 공개한 검색 API를 쓴다. 약관 안에서 동작하고 무료다.
//
// 배포: Supabase 대시보드 > Edge Functions > Deploy a new function (이름: price)
// 비밀값: Secrets 에 NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 등록
//
// 요청: POST { brand, productName, size? }  (로그인 사용자만)
// 응답: { query, count, lowest: {...}, items: [...] }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SEARCH_URL = 'https://openapi.naver.com/v1/search/shop.json';
const DAILY_LIMIT = 60; // 참가자 1명이 하루에 조회할 수 있는 횟수

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// 네이버는 상품명에 <b> 같은 태그를 섞어 보낸다
const clean = (s: string) => String(s || '').replace(/<[^>]*>/g, '').trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: '지원하지 않는 요청입니다' }, 405);

  const id = Deno.env.get('NAVER_CLIENT_ID');
  const secret = Deno.env.get('NAVER_CLIENT_SECRET');
  if (!id || !secret) return json({ error: '서버에 네이버 키가 설정되지 않았습니다' }, 500);

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: '로그인이 필요합니다' }, 401);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('event', 'price_looked_up')
    .gte('created_at', since);
  if ((count ?? 0) >= DAILY_LIMIT) {
    return json({ error: `하루 가격 조회 횟수(${DAILY_LIMIT}회)를 넘었습니다.` }, 429);
  }

  let brand = '', productName = '', size = '';
  try {
    ({ brand = '', productName = '', size = '' } = await req.json());
  } catch {
    return json({ error: '요청 형식이 올바르지 않습니다' }, 400);
  }

  // 사이즈는 검색을 좁히기만 하고 가격에는 영향이 없어서 빼는 쪽이 결과가 낫다
  const query = [brand, productName].map((v) => String(v || '').trim()).filter(Boolean).join(' ');
  if (query.length < 2) return json({ error: '검색할 상품 정보가 부족합니다' }, 400);

  const url = `${SEARCH_URL}?query=${encodeURIComponent(query)}&display=10&sort=asc`;
  const res = await fetch(url, {
    headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret },
  });

  if (!res.ok) {
    const detail = await res.text();
    return json({ error: '네이버 검색 실패', status: res.status, detail: detail.slice(0, 300) }, 502);
  }

  const data = await res.json();
  const items = (data.items || [])
    .map((it: Record<string, string>) => ({
      title: clean(it.title),
      price: Number(it.lprice) || 0,
      mall: clean(it.mallName),
      link: it.link,
      brand: clean(it.brand),
      image: it.image,
    }))
    .filter((it: { price: number }) => it.price > 0)
    .sort((a: { price: number }, b: { price: number }) => a.price - b.price);

  await supabase.from('usage_events').insert({
    user_id: user.id,
    event: 'price_looked_up',
    payload: { query, count: items.length, lowest: items[0]?.price ?? null },
  });

  return json({ query, count: items.length, lowest: items[0] ?? null, items: items.slice(0, 5) });
});
