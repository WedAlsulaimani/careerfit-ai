-- CareerFit AI — initial schema
-- Every user-owned table carries user_id, is protected by Row Level Security,
-- and child records use composite foreign keys (id, user_id) so a row can never
-- reference another user's parent record even if its UUID is known.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Master profile: singletons (one row per user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name_en text check (char_length(full_name_en) <= 200),
  full_name_ar text check (char_length(full_name_ar) <= 200),
  headline text check (char_length(headline) <= 200),
  email text check (char_length(email) <= 320),
  phone_country_code text check (char_length(phone_country_code) <= 8),
  phone text check (char_length(phone) <= 32),
  city text check (char_length(city) <= 120),
  country text check (char_length(country) <= 120),
  linkedin_url text check (char_length(linkedin_url) <= 500),
  portfolio_url text check (char_length(portfolio_url) <= 500),
  github_url text check (char_length(github_url) <= 500),
  other_links jsonb not null default '[]'::jsonb check (jsonb_typeof(other_links) = 'array'),
  date_of_birth date,
  nationality text check (char_length(nationality) <= 120),
  summary text check (char_length(summary) <= 4000),
  -- Sensitive fields are excluded from resumes unless the user opts in.
  include_dob_in_resume boolean not null default false,
  include_nationality_in_resume boolean not null default false,
  preferred_locale text not null default 'en' check (preferred_locale in ('en', 'ar')),
  onboarding_step smallint not null default 1 check (onboarding_step between 1 and 14),
  onboarding_completed_at timestamptz,
  ai_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.career_goals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  target_titles text[] not null default '{}',
  industries text[] not null default '{}',
  specializations text[] not null default '{}',
  interests text[] not null default '{}',
  work_arrangements text[] not null default '{}',
  preferred_locations text[] not null default '{}',
  willing_to_relocate boolean,
  objective text check (char_length(objective) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Attachments (private storage metadata)
-- ---------------------------------------------------------------------------
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bucket text not null default 'documents' check (bucket = 'documents'),
  storage_path text not null,
  file_name text not null check (char_length(file_name) <= 255),
  mime_type text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  purpose text not null check (purpose in ('transcript', 'project', 'certification', 'recommendation', 'other')),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (storage_path)
);
create index attachments_user_idx on public.attachments (user_id);

-- ---------------------------------------------------------------------------
-- Master profile: repeatable sections
-- ---------------------------------------------------------------------------
create table public.education (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  institution text not null check (char_length(institution) between 1 and 200),
  degree_type text check (char_length(degree_type) <= 120),
  major text check (char_length(major) <= 200),
  minor text check (char_length(minor) <= 200),
  start_date date,
  end_date date,
  is_expected boolean not null default false,
  gpa numeric(6, 2) check (gpa >= 0),
  gpa_scale text check (gpa_scale in ('4.0', '5.0', 'percentage', 'custom')),
  gpa_scale_custom text check (char_length(gpa_scale_custom) <= 40),
  honors text check (char_length(honors) <= 500),
  coursework text[] not null default '{}',
  thesis text check (char_length(thesis) <= 2000),
  distinctions text check (char_length(distinctions) <= 1000),
  transcript_attachment_id uuid,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (end_date is null or start_date is null or end_date >= start_date),
  foreign key (transcript_attachment_id, user_id) references public.attachments (id, user_id) on delete set null (transcript_attachment_id)
);

create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'full_time', 'part_time', 'internship', 'freelance', 'research_assistant',
    'teaching_assistant', 'volunteer', 'club_leadership', 'student_org',
    'community_service', 'other'
  )),
  title text not null check (char_length(title) between 1 and 200),
  organization text not null check (char_length(organization) between 1 and 200),
  location text check (char_length(location) <= 200),
  start_date date,
  end_date date,
  is_current boolean not null default false,
  responsibilities text[] not null default '{}',
  achievements text[] not null default '{}',
  quantifiable_results text[] not null default '{}',
  tools text[] not null default '{}',
  evidence_urls text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  category text not null check (category in (
    'university', 'capstone', 'personal', 'research', 'industry',
    'open_source', 'hackathon', 'collaborative', 'other'
  )),
  description text check (char_length(description) <= 4000),
  problem text check (char_length(problem) <= 2000),
  contribution text check (char_length(contribution) <= 2000),
  tools text[] not null default '{}',
  methods text[] not null default '{}',
  outcomes text[] not null default '{}',
  start_date date,
  end_date date,
  github_url text check (char_length(github_url) <= 500),
  demo_url text check (char_length(demo_url) <= 500),
  docs_url text check (char_length(docs_url) <= 500),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.certifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'certification', 'course', 'workshop', 'training', 'language_test', 'standardized_exam'
  )),
  name text not null check (char_length(name) between 1 and 200),
  issuer text check (char_length(issuer) <= 200),
  score text check (char_length(score) <= 40),
  score_scale text check (char_length(score_scale) <= 40),
  completion_date date,
  expiration_date date,
  verification_url text check (char_length(verification_url) <= 500),
  attachment_id uuid,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (attachment_id, user_id) references public.attachments (id, user_id) on delete set null (attachment_id)
);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('technical', 'soft')),
  name text not null check (char_length(name) between 1 and 120),
  category text check (char_length(category) <= 120),
  -- Never auto-assigned: null means "not stated".
  proficiency text check (proficiency in ('beginner', 'intermediate', 'advanced', 'expert')),
  evidence text check (char_length(evidence) <= 1000),
  related_experience_id uuid,
  related_project_id uuid,
  related_certification_id uuid,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (related_experience_id, user_id) references public.experiences (id, user_id) on delete set null (related_experience_id),
  foreign key (related_project_id, user_id) references public.projects (id, user_id) on delete set null (related_project_id),
  foreign key (related_certification_id, user_id) references public.certifications (id, user_id) on delete set null (related_certification_id)
);

create table public.publications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'journal', 'conference', 'poster', 'presentation', 'thesis',
    'collaboration', 'participation', 'other'
  )),
  title text not null check (char_length(title) between 1 and 400),
  authors text check (char_length(authors) <= 1000),
  contribution text check (char_length(contribution) <= 2000),
  -- Status is preserved verbatim: unpublished work is never shown as published.
  status text not null check (status in (
    'published', 'accepted', 'under_review', 'in_preparation', 'presented', 'not_published'
  )),
  venue text check (char_length(venue) <= 300),
  year smallint check (year between 1950 and 2100),
  reference_url text check (char_length(reference_url) <= 500),
  description text check (char_length(description) <= 2000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'award', 'competition', 'scholarship', 'academic_excellence', 'volunteer',
    'leadership', 'patent_application', 'patent_granted', 'innovation',
    'hackathon', 'entrepreneurship', 'other'
  )),
  title text not null check (char_length(title) between 1 and 300),
  issuer text check (char_length(issuer) <= 200),
  achieved_on date,
  description text check (char_length(description) <= 2000),
  url text check (char_length(url) <= 500),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recommender_name text not null check (char_length(recommender_name) between 1 and 200),
  recommender_position text check (char_length(recommender_position) <= 200),
  organization text check (char_length(organization) <= 200),
  contact_email text check (char_length(contact_email) <= 320),
  contact_phone text check (char_length(contact_phone) <= 40),
  contact_consent boolean not null default false,
  field text check (char_length(field) <= 200),
  notes text check (char_length(notes) <= 2000),
  attachment_id uuid,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (attachment_id, user_id) references public.attachments (id, user_id) on delete set null (attachment_id)
);

create table public.languages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  language text not null check (char_length(language) between 1 and 80),
  proficiency text check (proficiency in ('native', 'fluent', 'advanced', 'intermediate', 'basic')),
  certification text check (char_length(certification) <= 200),
  notes text check (char_length(notes) <= 1000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.additional_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 80),
  title text not null check (char_length(title) between 1 and 300),
  description text check (char_length(description) <= 4000),
  tags text[] not null default '{}',
  occurred_on date,
  url text check (char_length(url) <= 500),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

-- ---------------------------------------------------------------------------
-- Opportunities, sources, analyses, matches
-- ---------------------------------------------------------------------------
create table public.job_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_type text not null check (source_type in ('url', 'image', 'qr', 'manual')),
  source_url text check (char_length(source_url) <= 2048),
  title text check (char_length(title) <= 300),
  organization text check (char_length(organization) <= 300),
  location text check (char_length(location) <= 300),
  employment_type text check (char_length(employment_type) <= 120),
  deadline date,
  status text not null default 'captured' check (status in ('captured', 'analyzed', 'approved', 'matched', 'failed')),
  last_error text check (char_length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index job_opportunities_user_idx on public.job_opportunities (user_id, created_at desc);

create table public.job_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  opportunity_id uuid not null,
  source_type text not null check (source_type in ('url', 'image', 'qr', 'manual')),
  source_url text check (char_length(source_url) <= 2048),
  raw_text text not null check (char_length(raw_text) between 1 and 60000),
  -- Extraction diagnostics (method, OCR confidence, HTTP status) — schemaless by nature.
  extraction_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (opportunity_id, user_id) references public.job_opportunities (id, user_id) on delete cascade
);
create index job_sources_opportunity_idx on public.job_sources (opportunity_id);

create table public.job_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  opportunity_id uuid not null,
  version integer not null default 1,
  -- Schema-validated JobAnalysis document (see src/lib/schemas/job-analysis.ts).
  -- Stored as an immutable, versioned snapshot so edits never rewrite history.
  analysis jsonb not null,
  model text,
  user_edited boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (opportunity_id, version),
  foreign key (opportunity_id, user_id) references public.job_opportunities (id, user_id) on delete cascade
);

create table public.match_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  opportunity_id uuid not null,
  analysis_id uuid not null,
  -- Validated MatchResult document (per-requirement evidence references).
  result jsonb not null,
  heuristic_score numeric(5, 2) check (heuristic_score between 0 and 100),
  model text,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (opportunity_id, user_id) references public.job_opportunities (id, user_id) on delete cascade,
  foreign key (analysis_id, user_id) references public.job_analyses (id, user_id) on delete cascade
);
create index match_assessments_opportunity_idx on public.match_assessments (opportunity_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Resumes and versions
-- ---------------------------------------------------------------------------
create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  opportunity_id uuid,
  match_id uuid,
  title text not null check (char_length(title) between 1 and 300),
  language text not null check (language in ('en', 'ar')),
  layout text not null default 'classic' check (layout in ('classic', 'compact')),
  -- Validated ResumeDocument (see src/lib/schemas/resume.ts).
  content jsonb not null,
  current_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (opportunity_id, user_id) references public.job_opportunities (id, user_id) on delete set null (opportunity_id),
  foreign key (match_id, user_id) references public.match_assessments (id, user_id) on delete set null (match_id)
);
create index resumes_user_idx on public.resumes (user_id, updated_at desc);

create table public.resume_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  resume_id uuid not null,
  version integer not null,
  content jsonb not null,
  reason text not null check (reason in ('generated', 'manual_save', 'section_regenerated', 'restored', 'duplicated')),
  created_at timestamptz not null default now(),
  unique (resume_id, version),
  foreign key (resume_id, user_id) references public.resumes (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Application tracker (user-managed; never auto-submitted)
-- ---------------------------------------------------------------------------
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  opportunity_id uuid not null,
  resume_id uuid,
  status text not null default 'saved' check (status in (
    'saved', 'preparing', 'ready', 'applied', 'interview', 'offer', 'rejected', 'withdrawn'
  )),
  applied_on date,
  notes text check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id),
  foreign key (opportunity_id, user_id) references public.job_opportunities (id, user_id) on delete cascade,
  foreign key (resume_id, user_id) references public.resumes (id, user_id) on delete set null (resume_id)
);

-- ---------------------------------------------------------------------------
-- AI usage ledger (usage limits). Users may read and append; never edit/delete.
-- ---------------------------------------------------------------------------
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  operation text not null check (char_length(operation) <= 60),
  model text check (char_length(model) <= 120),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  succeeded boolean not null default true,
  created_at timestamptz not null default now()
);
create index ai_usage_user_time_idx on public.ai_usage (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Indexes for ownership lookups
-- ---------------------------------------------------------------------------
create index education_user_idx on public.education (user_id, sort_order);
create index experiences_user_idx on public.experiences (user_id, sort_order);
create index projects_user_idx on public.projects (user_id, sort_order);
create index certifications_user_idx on public.certifications (user_id, sort_order);
create index skills_user_idx on public.skills (user_id, kind, sort_order);
create index publications_user_idx on public.publications (user_id, sort_order);
create index achievements_user_idx on public.achievements (user_id, sort_order);
create index recommendations_user_idx on public.recommendations (user_id, sort_order);
create index languages_user_idx on public.languages (user_id, sort_order);
create index additional_records_user_idx on public.additional_records (user_id, sort_order);
create index job_analyses_opportunity_idx on public.job_analyses (opportunity_id, version desc);
create index resume_versions_resume_idx on public.resume_versions (resume_id, version desc);
create index applications_user_idx on public.applications (user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'career_goals', 'education', 'experiences', 'projects', 'certifications',
    'skills', 'publications', 'achievements', 'recommendations', 'languages',
    'additional_records', 'job_opportunities', 'resumes', 'applications'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'career_goals', 'attachments', 'education', 'experiences', 'projects',
    'certifications', 'skills', 'publications', 'achievements', 'recommendations',
    'languages', 'additional_records', 'job_opportunities', 'job_sources', 'job_analyses',
    'match_assessments', 'resumes', 'resume_versions', 'applications'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      t || '_insert_own', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_update_own', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t || '_delete_own', t
    );
  end loop;
end;
$$;

-- ai_usage: append-only for the owner, so usage limits cannot be reset client-side.
alter table public.ai_usage enable row level security;
create policy ai_usage_select_own on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));
create policy ai_usage_insert_own on public.ai_usage
  for insert to authenticated with check (user_id = (select auth.uid()));

-- Anonymous users get nothing.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- New-user bootstrap: create profile + goals rows.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email, full_name_en)
  values (
    new.id,
    new.email,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 200), '')
  )
  on conflict (user_id) do nothing;

  insert into public.career_goals (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Private storage bucket. Objects live under "<user_id>/..." and only the owner
-- can read, write or delete them. The bucket is never public.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 10485760,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy documents_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy documents_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy documents_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy documents_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
