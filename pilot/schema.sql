-- 파일럿 테스트용 데이터베이스 설계
-- Supabase 대시보드의 SQL Editor에 그대로 붙여넣고 실행한다. 여러 번 실행해도 안전하다.
--
-- 원칙
--  - 참가자는 자기 데이터만 읽고 쓸 수 있다 (Row Level Security)
--  - 삭제는 지우지 않고 deleted 표시만 한다 (기기 간 동기화에서 삭제가 되살아나지 않도록)
--  - 분석에 필요한 값은 별도 컬럼으로 둔다 (가격 숫자, 브랜드 등)

-- ========== 참가자 ==========
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  participant_code text,              -- 예: P01. 분석 때 사람 대신 쓰는 번호
  consented_at timestamptz,           -- 데이터 수집 동의 시각
  created_at timestamptz not null default now()
);

-- ========== 저장한 상품 ==========
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  local_id bigint not null,           -- 기기에서 쓰던 id (같은 상품을 다시 올리지 않도록)
  brand text,
  product_name text,
  price text,                         -- 화면에 보이는 그대로 (예: ₩39,900)
  price_num integer,                  -- 분석용 숫자
  size text,
  serial text,
  material text,
  care text,
  store text,
  memo text,
  category text,
  favorite boolean not null default false,
  cover_photo_id text,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_id)
);

create index if not exists items_user_updated_idx on public.items (user_id, updated_at desc);

-- ========== 상품 사진 ==========
create table if not exists public.item_photos (
  id text primary key,                -- 기기에서 쓰던 사진 id 그대로
  user_id uuid not null references auth.users on delete cascade,
  item_id uuid not null references public.items on delete cascade,
  kind text not null check (kind in ('tag', 'garment', 'wearing')),
  storage_path text not null,         -- photos 버킷 안의 경로 (uid/사진id.jpg)
  created_at timestamptz not null default now()
);

create index if not exists item_photos_item_idx on public.item_photos (item_id);

-- ========== 사용 로그 ==========
-- 저장, 비교, 찜처럼 참가자가 한 행동을 한 줄씩 쌓는다. 2차 발표의 분석 입력으로 쓴다.
create table if not exists public.usage_events (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  event text not null,                -- 예: item_saved, compare_opened, favorite_on
  payload jsonb not null default '{}'::jsonb,
  client_ts timestamptz,              -- 기기 시각 (오프라인에서 쌓였다 올라올 수 있음)
  created_at timestamptz not null default now()
);

create index if not exists usage_events_user_idx on public.usage_events (user_id, created_at desc);
create index if not exists usage_events_event_idx on public.usage_events (event);

-- ========== 접근 규칙 (자기 데이터만) ==========
alter table public.profiles enable row level security;
alter table public.items enable row level security;
alter table public.item_photos enable row level security;
alter table public.usage_events enable row level security;

drop policy if exists "본인 프로필" on public.profiles;
create policy "본인 프로필" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "본인 상품" on public.items;
create policy "본인 상품" on public.items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "본인 사진" on public.item_photos;
create policy "본인 사진" on public.item_photos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 로그는 넣기만 하고 본인 것만 볼 수 있다 (수정·삭제 불가)
drop policy if exists "본인 로그 기록" on public.usage_events;
create policy "본인 로그 기록" on public.usage_events
  for insert with check (auth.uid() = user_id);

drop policy if exists "본인 로그 조회" on public.usage_events;
create policy "본인 로그 조회" on public.usage_events
  for select using (auth.uid() = user_id);

-- ========== 가입하면 프로필 자동 생성 ==========
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, participant_code)
  values (new.id, new.raw_user_meta_data ->> 'participant_code')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ========== 사진 저장소 ==========
-- photos 버킷을 비공개로 만들고, 자기 폴더(uid/...)에만 접근하게 한다.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "본인 사진 파일" on storage.objects;
create policy "본인 사진 파일" on storage.objects
  for all to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
