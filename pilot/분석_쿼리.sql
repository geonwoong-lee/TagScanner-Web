-- 파일럿 결과 분석용 쿼리 모음
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.
--
-- 아래 쿼리들은 analytics.pilot_participants 를 쓴다.
-- pilot/보안수정.sql 을 먼저 한 번 실행해 두면 만들어진다.
-- 걸러낼 계정은 보안수정.sql 안에 하나씩 적혀 있다.
-- 참가자에게 나눠준 계정(psu100~psu500)은 빠지지 않는다.
--
-- 뷰는 API에 공개되지 않는 analytics 스키마에 둔다.
-- public 스키마에 두면 로그인하지 않은 사람도 참가자 명단을 읽을 수 있다.
-- 테스트 계정이 늘어나면 보안수정.sql의 뷰 정의만 고쳐서 다시 실행하면 된다.

-- ============================================================
-- 1. 인식 정확도: 자동 인식 결과를 참가자가 얼마나 고쳤는가
-- ============================================================

-- 1-1. 전체 수정률. 저장한 상품 중 나중에 고친 비율
select
  count(*) filter (where e.event = 'item_saved')                as 저장,
  count(*) filter (where e.event = 'item_updated')              as 수정,
  round(100.0 * count(*) filter (where e.event = 'item_updated')
        / nullif(count(*) filter (where e.event = 'item_saved'), 0), 1) as 수정률
from usage_events e
join analytics.pilot_participants p on p.id = e.user_id;

-- 1-2. 어떤 항목이 자주 틀리는가. 이게 인식 정확도의 실질 지표다.
--      brand가 많이 나오면 브랜드 사전을, size가 많이 나오면 파서를 손봐야 한다.
select
  field                       as 항목,
  count(*)                    as 수정_횟수,
  count(distinct e.user_id)   as 수정한_사람수
from usage_events e
join analytics.pilot_participants p on p.id = e.user_id
cross join lateral unnest(string_to_array(e.payload->>'fields', ',')) as field
where e.event = 'item_updated'
  and field not in ('decision', 'decidedAt', 'favorite')
group by field
order by 수정_횟수 desc;

-- 1-3. 촬영해서 저장까지 이어진 비율.
--      인식이 너무 엉망이면 저장을 포기하므로, 이탈률이 정확도의 간접 지표가 된다.
select
  count(*) filter (where event = 'ocr_called') as 촬영,
  count(*) filter (where event = 'item_saved') as 저장,
  round(100.0 * count(*) filter (where event = 'item_saved')
        / nullif(count(*) filter (where event = 'ocr_called'), 0), 1) as 저장률
from usage_events e
join analytics.pilot_participants p on p.id = e.user_id;


-- 1-4. 참가자 기기에서 인식이 실제로 몇 초 걸렸는가.
--      개발 환경에서 잰 값이 아니라 현장 값이라 발표에 쓸 수 있다.
select
  e.payload->>'engine'                                     as 엔진,
  count(*)                                                 as 건수,
  round(avg((e.payload->>'seconds')::numeric), 2)          as 평균초,
  round((percentile_cont(0.5) within group (
    order by (e.payload->>'seconds')::numeric))::numeric, 2) as 중앙값,
  round(max((e.payload->>'seconds')::numeric), 2)          as 최대초,
  count(*) filter (where (e.payload->>'seconds')::numeric <= 5) as 오초이내
from usage_events e
join analytics.pilot_participants p on p.id = e.user_id
where e.event = 'ocr_done'
group by 1;

-- 1-5. 항목별 인식 성공률. 자동으로 채워 넣은 비율이다.
--      1-2의 수정률과 함께 보면 "채웠는데 틀렸다"와 "아예 못 채웠다"를 나눌 수 있다.
select
  count(*)                                                       as 촬영,
  round(100.0 * count(*) filter (where (e.payload->>'found_brand')::boolean) / count(*), 1)    as 브랜드,
  round(100.0 * count(*) filter (where (e.payload->>'found_price')::boolean) / count(*), 1)    as 가격,
  round(100.0 * count(*) filter (where (e.payload->>'found_size')::boolean) / count(*), 1)     as 사이즈,
  round(100.0 * count(*) filter (where (e.payload->>'found_material')::boolean) / count(*), 1) as 소재
from usage_events e
join analytics.pilot_participants p on p.id = e.user_id
where e.event = 'ocr_done';

-- 1-6. 인식 실패 사유
select
  e.payload->>'reason' as 사유,
  count(*)             as 횟수
from usage_events e
join analytics.pilot_participants p on p.id = e.user_id
where e.event = 'ocr_failed'
group by 1 order by 2 desc;


-- ============================================================
-- 2. 비교 기능이 의사결정에 쓰였는가
-- ============================================================

-- 2-1. 핵심 지표. 비교를 거친 상품과 아닌 상품의 결정률 차이
--      이 표 하나가 "비교 기능이 결정을 도왔다"는 주장의 근거가 된다.
select
  case when i.compared_count > 0 then '비교함' else '비교 안 함' end as 구분,
  count(*)                                              as 상품수,
  count(*) filter (where i.decision is not null)        as 결정한_상품,
  round(100.0 * count(*) filter (where i.decision is not null)
        / nullif(count(*), 0), 1)                       as 결정률,
  count(*) filter (where i.decision = 'bought')         as 구매,
  count(*) filter (where i.decision = 'hold')           as 보류,
  count(*) filter (where i.decision = 'dropped')        as 안삼
from items i
join analytics.pilot_participants p on p.id = i.user_id
where not i.deleted
group by 1;

-- 2-2. 결정까지 걸린 시간. 비교를 쓰면 더 빨리 정하는가
select
  case when i.compared_count > 0 then '비교함' else '비교 안 함' end as 구분,
  count(*)                                                    as 결정한_상품,
  round(avg(extract(epoch from (i.decided_at - i.created_at)) / 3600)::numeric, 1) as 평균_시간,
  round((percentile_cont(0.5) within group (
    order by extract(epoch from (i.decided_at - i.created_at)) / 3600))::numeric, 1) as 중앙값_시간
from items i
join analytics.pilot_participants p on p.id = i.user_id
where i.decision is not null and not i.deleted
group by 1;

-- 2-3. 결정이 어느 화면에서 나왔는가.
--      compare 비중이 높으면 비교 화면이 결정 지점 역할을 했다는 뜻이다.
select
  e.payload->>'source'                       as 화면,
  e.payload->>'decision'                     as 결정,
  count(*)                                   as 횟수
from usage_events e
join analytics.pilot_participants p on p.id = e.user_id
where e.event = 'decision_made'
group by 1, 2
order by 1, 3 desc;

-- 2-4. 비교를 몇 개 놓고 하는가. 2개인지 5개인지에 따라 화면 설계가 달라진다.
select
  (e.payload->>'count')::int as 비교한_상품수,
  count(*)                   as 횟수
from usage_events e
join analytics.pilot_participants p on p.id = e.user_id
where e.event = 'compare_run'
group by 1 order by 1;

-- 2-5. 찜 목록을 열고 실제 비교까지 간 비율
select
  count(*) filter (where event = 'compare_list_opened') as 목록_열기,
  count(*) filter (where event = 'compare_run')         as 비교_실행,
  round(100.0 * count(*) filter (where event = 'compare_run')
        / nullif(count(*) filter (where event = 'compare_list_opened'), 0), 1) as 실행률
from usage_events e
join analytics.pilot_participants p on p.id = e.user_id;


-- 2-6. 사람 단위로 본 결정. 앞의 쿼리들은 상품 단위라 이것과 따로 본다.
--      "10명 중 몇 명이 이 기능으로 실제 결정까지 갔는가"에 답한다.
select
  count(distinct p.id)                                          as 전체_참가자,
  count(distinct e.user_id) filter (where e.event = 'compare_run')   as 비교한_사람,
  count(distinct e.user_id) filter (where e.event = 'decision_made') as 결정한_사람
from analytics.pilot_participants p
left join usage_events e on e.user_id = p.id;

-- 2-7. 참가자별 최종 결정 현황. items의 현재 상태만 본다(되돌린 것은 빠진다).
select
  p.participant_code                             as 참가자,
  count(*) filter (where i.decision = 'bought')  as 구매,
  count(*) filter (where i.decision = 'hold')    as 보류,
  count(*) filter (where i.decision = 'dropped') as 안삼,
  count(*) filter (where i.decision is null)     as 미정
from items i
join analytics.pilot_participants p on p.id = i.user_id
where not i.deleted
group by 1 order by 1;

-- 2-8. 마음을 바꾼 경우. previous에 값이 있으면 이전 결정을 뒤집은 것이다.
select
  e.payload->>'previous' as 이전결정,
  e.payload->>'decision' as 바꾼결정,
  count(*)               as 횟수
from usage_events e
join analytics.pilot_participants p on p.id = e.user_id
where e.event = 'decision_made'
  and coalesce(e.payload->>'previous', '') <> ''
group by 1, 2 order by 3 desc;


-- ============================================================
-- 3. 참가자별 현황 (중간 점검용)
-- ============================================================

-- items와 usage_events를 한 번에 조인하면 행이 곱해져서 횟수가 부풀려진다.
-- 각각 따로 센 뒤 붙인다.
select
  p.participant_code as 참가자,
  coalesce(it.저장상품, 0)   as 저장상품,
  coalesce(it.비교한상품, 0) as 비교한상품,
  coalesce(it.결정한상품, 0) as 결정한상품,
  coalesce(ev.비교횟수, 0)   as 비교횟수,
  ev.마지막_사용
from analytics.pilot_participants p
left join (
  select
    user_id,
    count(*) filter (where not deleted)                             as 저장상품,
    count(*) filter (where compared_count > 0 and not deleted)      as 비교한상품,
    count(*) filter (where decision is not null and not deleted)    as 결정한상품
  from items group by user_id
) it on it.user_id = p.id
left join (
  select
    user_id,
    count(*) filter (where event = 'compare_run') as 비교횟수,
    max(created_at)                              as 마지막_사용
  from usage_events group by user_id
) ev on ev.user_id = p.id
order by p.participant_code;

-- 3-2. 날짜별 사용량. 초반에만 쓰고 마는지 2주 내내 쓰는지 본다.
select
  date_trunc('day', e.created_at)::date as 날짜,
  count(distinct e.user_id)             as 사용한_사람,
  count(*) filter (where e.event = 'item_saved')  as 저장,
  count(*) filter (where e.event = 'compare_run') as 비교
from usage_events e
join analytics.pilot_participants p on p.id = e.user_id
group by 1 order by 1;


-- ============================================================
-- 4. 온라인 가격이 결정에 영향을 주었는가
-- ============================================================

-- 4-1. 온라인 가격을 적어 둔 상품의 결정 분포.
--      온라인이 쌀수록 매장에서 안 사기로 하는지 본다.
select
  case
    when i.online_price is null then '안 적음'
    when i.price_num is null then '매장가 모름'
    when i.price_num - i.online_price > 10000 then '온라인이 1만원 넘게 쌈'
    when i.price_num - i.online_price > 0 then '온라인이 조금 쌈'
    else '매장이 같거나 쌈'
  end                                            as 구분,
  count(*)                                       as 상품수,
  count(*) filter (where i.decision = 'bought')  as 구매,
  count(*) filter (where i.decision = 'dropped') as 안삼,
  count(*) filter (where i.decision = 'hold')    as 보류
from items i
join analytics.pilot_participants p on p.id = i.user_id
where not i.deleted
group by 1 order by 1;

-- 4-2. 가격을 적어 둔 뒤 결정까지 걸린 시간
select
  count(*)                                                  as 적어둔상품,
  count(*) filter (where i.decision is not null)            as 결정한상품,
  round(avg(i.price_num - i.online_price)::numeric, 0)      as 평균차액
from items i
join analytics.pilot_participants p on p.id = i.user_id
where not i.deleted and i.online_price is not null and i.price_num is not null;

-- 4-3. 새로 넣은 기능들이 실제로 쓰였는가
select
  e.event  as 기능,
  count(*) as 횟수,
  count(distinct e.user_id) as 쓴사람
from usage_events e
join analytics.pilot_participants p on p.id = e.user_id
where e.event in ('duplicate_warned', 'duplicate_opened', 'hold_reminder_shown',
                  'hold_reminder_opened', 'auto_held', 'item_shared',
                  'price_search_opened', 'online_price_entered')
group by 1 order by 2 desc;
