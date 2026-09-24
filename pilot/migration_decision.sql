-- 구매 결정 기록을 위한 열 추가
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.
-- 이미 만들어진 표에 열만 더하는 것이라 기존 데이터는 그대로 남는다.

alter table public.items add column if not exists decision text;
alter table public.items add column if not exists decided_at timestamptz;
alter table public.items add column if not exists compared_count integer not null default 0;
alter table public.items add column if not exists first_compared_at timestamptz;

-- 결정값은 셋 중 하나이거나 비어 있다
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'items_decision_check') then
    alter table public.items
      add constraint items_decision_check
      check (decision is null or decision in ('bought', 'hold', 'dropped'));
  end if;
end $$;

create index if not exists items_decision_idx on public.items (user_id, decision);
