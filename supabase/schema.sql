-- Tasajaot: database schema for Supabase.
-- Run this file one time in Supabase: SQL Editor > New query > paste > Run.

-- Admin users. Add a row here for each user who can edit players and draw teams.
create table if not exists public.admins (
	user_id uuid primary key references auth.users on delete cascade
);

create table if not exists public.players (
	id bigint generated always as identity primary key,
	name text not null unique check ( char_length( btrim( name ) ) between 1 and 80 ),
	position text not null check ( position in ( 'P', 'H', 'HP', 'PH' ) ),
	rating numeric( 2, 1 ) not null check ( rating between 1 and 5 ),
	created_at timestamptz not null default now()
);

-- One draw per ISO week. The unique "week" column makes a second draw for the same week fail.
-- The "teams" column has only names and positions. It does not have ratings, because all users can read it.
create table if not exists public.draws (
	id bigint generated always as identity primary key,
	game_date date not null,
	week text not null unique,
	teams jsonb not null,
	created_by uuid default auth.uid() references auth.users on delete set null,
	created_at timestamptz not null default now()
);

-- The database calculates the week from the date, so the client cannot send a wrong week.
create or replace function public.set_draw_week()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	new.week := to_char( new.game_date, 'IYYY-"W"IW' );
	return new;
end;
$$;

drop trigger if exists draws_set_week on public.draws;
create trigger draws_set_week
	before insert or update on public.draws
	for each row execute function public.set_draw_week();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists ( select 1 from public.admins where user_id = auth.uid() );
$$;

alter table public.admins enable row level security;
alter table public.players enable row level security;
alter table public.draws enable row level security;

-- A user can see only the admin row of that user. The app uses this row to show the admin view.
drop policy if exists "Users read own admin row" on public.admins;
create policy "Users read own admin row" on public.admins
	for select to authenticated
	using ( user_id = auth.uid() );

-- Only admins can read and change players. Thus the ratings are not public.
drop policy if exists "Admins manage players" on public.players;
create policy "Admins manage players" on public.players
	for all to authenticated
	using ( public.is_admin() )
	with check ( public.is_admin() );

-- All users can read the drawn teams.
drop policy if exists "Everyone reads draws" on public.draws;
create policy "Everyone reads draws" on public.draws
	for select to anon, authenticated
	using ( true );

-- Admins can add a draw. There is no update or delete policy, so the app cannot change a draw.
drop policy if exists "Admins insert draws" on public.draws;
create policy "Admins insert draws" on public.draws
	for insert to authenticated
	with check ( public.is_admin() );

grant select on public.draws to anon, authenticated;
grant insert on public.draws to authenticated;
grant select on public.admins to authenticated;
grant select, insert, update, delete on public.players to authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- Evaluation after the game ----------
-- You can run this file again. The statements below add only the parts that do not exist.

-- Correction value of a player. The draw uses rating + adjustment.
alter table public.players add column if not exists adjustment numeric( 3, 2 ) not null default 0;
alter table public.players drop constraint if exists players_adjustment_range;
alter table public.players add constraint players_adjustment_range check ( adjustment between -1 and 1 );

-- Evaluations are in a separate table, because only admins can see them.
-- The table "draws" is public, so it must not contain the evaluations.
-- evaluation: 2 = white clearly better, 0 = even, -2 = black clearly better.
create table if not exists public.draw_evaluations (
	draw_id bigint primary key references public.draws on delete cascade,
	evaluation smallint not null check ( evaluation between -2 and 2 ),
	white_goals smallint,
	black_goals smallint,
	evaluated_at timestamptz not null default now(),
	evaluated_by uuid default auth.uid() references auth.users on delete set null,
	constraint draw_evaluations_goals_valid check (
		( white_goals is null and black_goals is null )
		or ( white_goals between 0 and 99 and black_goals between 0 and 99 )
	)
);

-- An earlier version kept the evaluations in the table "draws". This block moves them and removes the old columns.
do $$
begin
	if exists (
		select 1 from information_schema.columns
		where table_schema = 'public' and table_name = 'draws' and column_name = 'evaluation'
	) then
		insert into public.draw_evaluations ( draw_id, evaluation, white_goals, black_goals, evaluated_at, evaluated_by )
		select id, evaluation, white_goals, black_goals, coalesce( evaluated_at, now() ), evaluated_by
		from public.draws
		where evaluation is not null
		on conflict ( draw_id ) do nothing;

		alter table public.draws
			drop column if exists evaluation,
			drop column if exists white_goals,
			drop column if exists black_goals,
			drop column if exists evaluated_at,
			drop column if exists evaluated_by;
	end if;
end;
$$;

alter table public.draw_evaluations enable row level security;

-- Only admins can read the evaluations. The function evaluate_draw adds them.
drop policy if exists "Admins read evaluations" on public.draw_evaluations;
create policy "Admins read evaluations" on public.draw_evaluations
	for select to authenticated
	using ( public.is_admin() );

revoke all on public.draw_evaluations from anon;
grant select on public.draw_evaluations to authenticated;

-- Saves the evaluation and changes the adjustments of the players in one transaction.
-- There is no insert policy for evaluations, so this function is the only way to save an evaluation.
-- The primary key allows only one evaluation for each draw, so the adjustments change only one time for each game.
create or replace function public.evaluate_draw(
	p_draw_id bigint,
	p_evaluation smallint,
	p_white_goals smallint default null,
	p_black_goals smallint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	target public.draws%rowtype;
	-- Change of the adjustment for each evaluation step. "Clearly better" (2) gives 0.10.
	adjustment_step constant numeric := 0.05;
begin
	if not public.is_admin() then
		raise exception 'Vain admin voi arvioida vuoron.' using errcode = '42501';
	end if;
	if p_evaluation is null or p_evaluation not between -2 and 2 then
		raise exception 'Virheellinen arvio.' using errcode = '22023';
	end if;
	if ( p_white_goals is null ) <> ( p_black_goals is null ) then
		raise exception 'Anna molempien joukkueiden maalit tai jätä molemmat tyhjiksi.' using errcode = '22023';
	end if;

	select * into target from public.draws where id = p_draw_id for update;
	if not found then
		raise exception 'Arvontaa ei löydy.' using errcode = 'P0002';
	end if;
	if exists ( select 1 from public.draw_evaluations where draw_id = p_draw_id ) then
		raise exception 'Tämä vuoro on jo arvioitu.' using errcode = '23505';
	end if;
	if target.game_date > current_date then
		raise exception 'Vuoroa ei ole vielä pelattu.' using errcode = '22023';
	end if;

	insert into public.draw_evaluations ( draw_id, evaluation, white_goals, black_goals, evaluated_by )
	values ( p_draw_id, p_evaluation, p_white_goals, p_black_goals, auth.uid() );

	if p_evaluation <> 0 then
		-- The better team was stronger than the ratings told, so its players get a higher adjustment.
		update public.players as player
		set adjustment = least( 1, greatest( -1, player.adjustment + adjustment_step * p_evaluation * team.direction ) )
		from (
			select ( member ->> 'id' )::bigint as player_id, 1 as direction
			from jsonb_array_elements( target.teams -> 'white' ) as member
			union all
			select ( member ->> 'id' )::bigint, -1
			from jsonb_array_elements( target.teams -> 'black' ) as member
		) as team
		where player.id = team.player_id;
	end if;
end;
$$;

revoke execute on function public.evaluate_draw( bigint, smallint, smallint, smallint ) from public, anon;
grant execute on function public.evaluate_draw( bigint, smallint, smallint, smallint ) to authenticated;
