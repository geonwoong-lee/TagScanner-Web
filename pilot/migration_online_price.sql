-- 참가자가 적어 둔 온라인 가격을 저장할 열
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.

alter table public.items add column if not exists online_price integer;
