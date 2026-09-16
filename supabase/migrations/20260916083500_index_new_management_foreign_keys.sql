create index if not exists announcements_created_by_idx on public.announcements(created_by);
create index if not exists school_classes_created_by_idx on public.school_classes(created_by);
create index if not exists school_settings_updated_by_idx on public.school_settings(updated_by);
