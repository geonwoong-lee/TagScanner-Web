-- 보안 수정: 분석용 뷰가 접근 규칙을 우회하던 문제
-- Supabase 대시보드 > SQL Editor 에 전부 붙여넣고 한 번에 Run.
--
-- 무엇이 문제였나
--   public 스키마에 만든 뷰는 API로 그대로 공개된다.
--   게다가 뷰는 만든 사람 권한으로 도므로 원본 표의 접근 규칙을 건너뛴다.
--   그래서 로그인하지 않아도 참가자 명단(번호, 계정 id, 동의 시각)이 읽혔다.
--
-- 어떻게 고치나
--   API에 공개되지 않는 별도 스키마로 옮긴다.
--   SQL Editor에서는 그대로 쓸 수 있고, 밖에서는 아예 보이지 않는다.

-- 1) 공개돼 있던 뷰를 없앤다
drop view if exists public.pilot_participants;

-- 2) 분석 전용 스키마를 만든다 (API에 공개되지 않는다)
create schema if not exists analytics;

-- 3) 같은 내용을 그 안에 다시 만든다
create or replace view analytics.pilot_participants as
select p.id, p.participant_code, p.created_at, p.consented_at
from public.profiles p
join auth.users u on u.id = p.id
where u.email not like 'abcd@%'          -- 개발 중 만든 계정
  and u.email not like 'psu%@naver.com'  -- 팀 내부 테스트 계정
  and u.email <> 'asldfj@asddf.com';     -- 연동 확인용 계정

-- 4) 앱에서 쓰는 두 역할은 이 스키마에 손도 못 대게 한다
revoke all on schema analytics from anon, authenticated;
revoke all on all tables in schema analytics from anon, authenticated;

-- 5) 가입할 때 쓰는 함수를 밖에서 직접 부르지 못하게 한다
--    (가입 처리는 트리거가 부르는 것이라 이 설정과 무관하게 계속 동작한다)
revoke execute on function public.handle_new_user() from public, anon, authenticated;
