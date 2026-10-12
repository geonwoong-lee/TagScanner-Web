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


-- ============================================================
-- 6. 한 기기를 여러 계정이 쓴 흔적 확인
-- ============================================================
-- 2026-10-12 이전 버전에는 기기에 저장된 상품이 계정별로 구분되지 않았다.
-- 같은 휴대폰에서 계정을 바꿔 로그인하면 앞 계정 상품이 뒤 계정으로 올라갔다.

-- 6-1. 계정이 만들어지기 전에 저장된 상품.
--      가입보다 먼저 만들어진 상품은 다른 계정에서 넘어온 것이다.
select
  p.participant_code as 참가자,
  i.brand, i.product_name,
  i.created_at       as 상품생성,
  p.created_at       as 계정생성
from items i
join profiles p on p.id = i.user_id
where not i.deleted
  and i.created_at < p.created_at
order by p.participant_code, i.created_at;

-- 6-2. 여러 계정에 똑같이 들어 있는 상품.
--      local_id는 기기에서 만든 번호라, 이 값이 겹치면 같은 상품이 복제된 것이다.
select
  i.local_id,
  i.brand, i.product_name,
  count(*)                                   as 계정수,
  string_agg(p.participant_code, ', ')       as 참가자들
from items i
join profiles p on p.id = i.user_id
where not i.deleted
group by i.local_id, i.brand, i.product_name
having count(*) > 1
order by count(*) desc;

-- 6-3. 섞인 상품을 지울 때 (6-1 결과를 확인한 뒤에만 실행)
-- delete from items
-- where id in (
--   select i.id from items i
--   join profiles p on p.id = i.user_id
--   where i.created_at < p.created_at
-- );
