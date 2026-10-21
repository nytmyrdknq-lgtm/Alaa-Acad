create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  display_name text not null default '',
  grade text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  track text not null,
  subject text not null,
  book text not null,
  lesson text not null,
  status text not null default 'studying' check (status in ('studying', 'completed')),
  needs_review boolean not null default false,
  last_studied_at timestamptz not null default now(),
  unique (user_id, track, subject, book, lesson)
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  track text not null,
  subject text not null,
  book text not null,
  lesson text not null,
  question text not null,
  student_answer text not null,
  feedback text not null,
  correctness text not null check (correctness in ('correct', 'partial', 'incorrect', 'ungraded')),
  score numeric(5, 2) check (score is null or (score >= 0 and score <= 100)),
  incorrect_answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lesson_progress_user_recent
  on public.lesson_progress (user_id, last_studied_at desc);
create index if not exists quiz_attempts_user_recent
  on public.quiz_attempts (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.quiz_attempts enable row level security;

revoke all on public.profiles, public.lesson_progress, public.quiz_attempts from public, anon, authenticated;

drop policy if exists "Students can read their own profile" on public.profiles;
create policy "Students can read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
drop policy if exists "Students can create their own profile" on public.profiles;
create policy "Students can create their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
drop policy if exists "Students can update their own profile" on public.profiles;
create policy "Students can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Students can read their own lesson progress" on public.lesson_progress;
create policy "Students can read their own lesson progress"
  on public.lesson_progress for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Students can create their own lesson progress" on public.lesson_progress;
create policy "Students can create their own lesson progress"
  on public.lesson_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Students can update their own lesson progress" on public.lesson_progress;
create policy "Students can update their own lesson progress"
  on public.lesson_progress for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Students can read their own quiz attempts" on public.quiz_attempts;
create policy "Students can read their own quiz attempts"
  on public.quiz_attempts for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Students can create their own quiz attempts" on public.quiz_attempts;
create policy "Students can create their own quiz attempts"
  on public.quiz_attempts for insert to authenticated
  with check ((select auth.uid()) = user_id);

grant select on public.profiles to authenticated;
grant insert (id, email, display_name) on public.profiles to authenticated;
grant update (display_name, grade, onboarding_completed) on public.profiles to authenticated;
grant select, insert, update on public.lesson_progress to authenticated;
grant select, insert on public.quiz_attempts to authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
