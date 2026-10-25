-- Tensie: one owner, every row owned by auth.uid(), soft deletes only (CLAUDE.md, P1–P3).
--
-- Sync model: the client generates ids and updated_at; the server decides "last change wins"
-- (keep_newest) and stamps every accepted change with its own synced_at, which devices use as
-- their pull cursor, so a device with a wrong clock can never miss changes.

-- Readings -------------------------------------------------------------------------------------

create table public.readings (
	user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
	id uuid not null,
	measured_at timestamptz not null,
	time_zone text not null check (char_length(time_zone) between 1 and 64),
	systolic smallint not null check (systolic > 0 and systolic < 400),
	diastolic smallint not null check (diastolic > 0 and diastolic < 400),
	arm text check (arm in ('left', 'right')),
	note text check (char_length(note) <= 2000),
	session_id uuid,
	source text not null check (source in ('manual', 'import')),
	import_id uuid,
	created_at timestamptz not null,
	updated_at timestamptz not null,
	deleted boolean not null default false,
	synced_at timestamptz not null default clock_timestamp(),
	primary key (user_id, id)
);

create index readings_pull on public.readings (user_id, synced_at);

-- Settings: a single row per owner, id 'settings' (see src/lib/data/settings.ts) --------------

create table public.settings (
	user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
	id text not null check (id = 'settings'),
	time_zone text not null check (char_length(time_zone) between 1 and 64),
	patient_name text check (char_length(patient_name) <= 200),
	birth_year smallint check (birth_year between 1900 and 2100),
	thresholds jsonb not null,
	day_part_windows jsonb not null,
	updated_at timestamptz not null,
	deleted boolean not null default false,
	synced_at timestamptz not null default clock_timestamp(),
	primary key (user_id, id)
);

create index settings_pull on public.settings (user_id, synced_at);

-- Imports: history so a whole import can be undone on any device (C9) -------------------------

create table public.imports (
	user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
	id uuid not null,
	file_name text not null check (char_length(file_name) <= 500),
	imported_at timestamptz not null,
	reading_count integer not null check (reading_count >= 0),
	undone_at timestamptz,
	updated_at timestamptz not null,
	deleted boolean not null default false,
	synced_at timestamptz not null default clock_timestamp(),
	primary key (user_id, id)
);

create index imports_pull on public.imports (user_id, synced_at);

-- Last change wins, decided by the database ----------------------------------------------------

create function public.keep_newest() returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if tg_op = 'UPDATE' then
		-- Older or equal: keep what is stored. Equal also stops a pulled row that a device
		-- pushes back from counting as a new change.
		if new.updated_at <= old.updated_at then
			return null;
		end if;
		-- A row never moves to another owner.
		new.user_id := old.user_id;
	end if;
	-- The server's clock, never the client's, orders changes for pulling.
	new.synced_at := clock_timestamp();
	return new;
end;
$$;

create trigger readings_keep_newest before insert or update on public.readings
	for each row execute function public.keep_newest();
create trigger settings_keep_newest before insert or update on public.settings
	for each row execute function public.keep_newest();
create trigger imports_keep_newest before insert or update on public.imports
	for each row execute function public.keep_newest();

-- Row-level security: only the signed-in owner sees and changes their rows ---------------------

alter table public.readings enable row level security;
alter table public.settings enable row level security;
alter table public.imports enable row level security;

create policy "owner reads" on public.readings for select to authenticated
	using (user_id = (select auth.uid()));
create policy "owner adds" on public.readings for insert to authenticated
	with check (user_id = (select auth.uid()));
create policy "owner changes" on public.readings for update to authenticated
	using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "owner reads" on public.settings for select to authenticated
	using (user_id = (select auth.uid()));
create policy "owner adds" on public.settings for insert to authenticated
	with check (user_id = (select auth.uid()));
create policy "owner changes" on public.settings for update to authenticated
	using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "owner reads" on public.imports for select to authenticated
	using (user_id = (select auth.uid()));
create policy "owner adds" on public.imports for insert to authenticated
	with check (user_id = (select auth.uid()));
create policy "owner changes" on public.imports for update to authenticated
	using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- No delete policy, and no delete rights: deletions are soft, so they sync. The public (anon)
-- key gets nothing at all.
revoke all on table public.readings, public.settings, public.imports from anon;
revoke delete, truncate on table public.readings, public.settings, public.imports from authenticated;
