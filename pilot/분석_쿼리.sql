-- 파일럿 결과 분석용 쿼리 모음
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.
-- 본인 테스트 계정(participant_code = 'admin')은 전부 제외한다.

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
join profiles p on p.id = e.user_id
where p.participant_code is distinct from 'admin';

-- 1-2. 어떤 항목이 자주 틀리는가. 이게 인식 정확도의 실질 지표다.
--      brand가 많이 나오면 브랜드 사전을, size가 많이 나오면 파서를 손봐야 한다.
select
  field                       as 항목,
  count(*)                    as 수정_횟수,
  count(distinct e.user_id)   as 수정한_사람수
from usage_events e
join profiles p on p.id = e.user_id
cross join lateral unnest(string_to_array(e.payload->>'fields', ',')) as field
where e.event = 'item_updated'
  and p.participant_code is distinct from 'admin'
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
join profiles p on p.id = e.user_id
where p.participant_code is distinct from 'admin';


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
join profiles p on p.id = e.user_id
where e.event = 'ocr_done'
  and p.participant_code is distinct from 'admin'
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
join profiles p on p.id = e.user_id
where e.event = 'ocr_done'
  and p.participant_code is distinct from 'admin';

-- 1-6. 인식 실패 사유
select
  e.payload->>'reason' as 사유,
  count(*)             as 횟수
from usage_events e
join profiles p on p.id = e.user_id
where e.event = 'ocr_failed'
  and p.participant_code is distinct from 'admin'
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
join profiles p on p.id = i.user_id
where not i.deleted
  and p.participant_code is distinct from 'admin'
group by 1;

-- 2-2. 결정까지 걸린 시간. 비교를 쓰면 더 빨리 정하는가
select
  case when i.compared_count > 0 then '비교함' else '비교 안 함' end as 구분,
  count(*)                                                    as 결정한_상품,
  round(avg(extract(epoch from (i.decided_at - i.created_at)) / 3600)::numeric, 1) as 평균_시간,
  round((percentile_cont(0.5) within group (
    order by extract(epoch from (i.decided_at - i.created_at)) / 3600))::numeric, 1) as 중앙값_시간
from items i
join profiles p on p.id = i.user_id
where i.decision is not null and not i.deleted
  and p.participant_code is distinct from 'admin'
group by 1;

-- 2-3. 결정이 어느 화면에서 나왔는가.
--      compare 비중이 높으면 비교 화면이 결정 지점 역할을 했다는 뜻이다.
select
  e.payload->>'source'                       as 화면,
  e.payload->>'decision'                     as 결정,
  count(*)                                   as 횟수
from usage_events e
join profiles p on p.id = e.user_id
where e.event = 'decision_made'
  and p.participant_code is distinct from 'admin'
group by 1, 2
order by 1, 3 desc;

-- 2-4. 비교를 몇 개 놓고 하는가. 2개인지 5개인지에 따라 화면 설계가 달라진다.
select
  (e.payload->>'count')::int as 비교한_상품수,
  count(*)                   as 횟수
from usage_events e
join profiles p on p.id = e.user_id
where e.event = 'compare_run'
  and p.participant_code is distinct from 'admin'
group by 1 order by 1;

-- 2-5. 찜 목록을 열고 실제 비교까지 간 비율
select
  count(*) filter (where event = 'compare_list_opened') as 목록_열기,
  count(*) filter (where event = 'compare_run')         as 비교_실행,
  round(100.0 * count(*) filter (where event = 'compare_run')
        / nullif(count(*) filter (where event = 'compare_list_opened'), 0), 1) as 실행률
from usage_events e
join profiles p on p.id = e.user_id
where p.participant_code is distinct from 'admin';


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
from profiles p
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
where p.participant_code is distinct from 'admin'
order by p.participant_code;

-- 3-2. 날짜별 사용량. 초반에만 쓰고 마는지 2주 내내 쓰는지 본다.
select
  date_trunc('day', e.created_at)::date as 날짜,
  count(distinct e.user_id)             as 사용한_사람,
  count(*) filter (where e.event = 'item_saved')  as 저장,
  count(*) filter (where e.event = 'compare_run') as 비교
from usage_events e
join profiles p on p.id = e.user_id
where p.participant_code is distinct from 'admin'
group by 1 order by 1;
