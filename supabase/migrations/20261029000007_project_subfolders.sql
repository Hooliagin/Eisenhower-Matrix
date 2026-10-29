alter table public.projects add column parent_id uuid references public.projects(id) on delete cascade;
create index projects_parent_idx on public.projects (parent_id);
