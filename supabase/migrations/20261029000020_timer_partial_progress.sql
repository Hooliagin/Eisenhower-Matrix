-- Interrupted timer sessions keep their progress ("später weitermachen"); partial minutes count on the day saved.
-- Full view definitions: see the applied migration "timer_partial_progress" (tasks_planned + progress_seconds,
-- xp_events / element_events / nutrition_daily with an extra branch for unfinished tasks with progress_seconds >= 30).
alter table public.tasks add column progress_seconds int not null default 0 check (progress_seconds >= 0);
