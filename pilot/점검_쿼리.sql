-- 참가자 문제를 확인할 때 쓰는 쿼리.
-- Supabase 대시보드 > SQL Editor 에 한 번에 하나씩 붙여넣고 Run.

-- 1. 가입한 참가자 목록. P05가 여기 있으면 회원가입은 된 것이다.
select
  p.participant_code as 참가자,
  u.email            as 이메일,
  p.created_at       as 가입시각,
  p.consented_at     as 동의시각,
  u.last_sign_in_at  as 마지막로그인
from profiles p
join auth.users u on u.id = p.id
order by p.created_at desc;

-- 2. 참가자가 저장한 상품. 서버까지 올라왔는지 본다.
--    기기에만 저장되고 동기화가 안 됐으면 여기 안 보인다.
select
  p.participant_code as 참가자,
  i.brand, i.product_name, i.price,
  i.created_at, i.updated_at
from items i
join profiles p on p.id = i.user_id
where not i.deleted
order by i.created_at desc
limit 30;

-- 3. 앱에서 터진 오류. 저장이 안 되는 원인이 여기 찍힌다.
select
  p.participant_code        as 참가자,
  e.payload->>'kind'        as 종류,
  e.payload->>'message'     as 메시지,
  e.payload->>'source'      as 위치,
  e.payload->>'screen'      as 화면,
  e.created_at
from usage_events e
join profiles p on p.id = e.user_id
where e.event = 'js_error'
order by e.created_at desc
limit 30;

-- 4. 저장 실패와 동기화 실패
select
  p.participant_code as 참가자,
  e.event            as 종류,
  e.payload,
  e.created_at
from usage_events e
join profiles p on p.id = e.user_id
where e.event in ('storage_failed', 'sync_failed', 'ocr_failed')
order by e.created_at desc
limit 30;

-- 5. 참가자별로 무슨 행동을 했는지 시간순으로. 어디서 막혔는지 보인다.
select
  p.participant_code as 참가자,
  e.event,
  e.created_at
from usage_events e
join profiles p on p.id = e.user_id
where p.participant_code = 'P05'   -- 확인할 참가자 번호로 바꿔서 쓴다
order by e.created_at;
