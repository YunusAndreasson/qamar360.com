-- Retire per-habit reminders.
--
-- `habits.reminder_time` backed a per-habit local notification ("Time for {name}") that was
-- opt-in, needed a development build and an OS grant, and carried no information the user did
-- not already have. It is replaced by lunar updates: four notifications a lunar month, at the
-- quarters of the moon, each carrying the month's real completion (see src/lib/lunar-*.ts).
--
-- ⚠ ORDERING. Apply this ONLY after a client that no longer writes the column is live on every
-- surface — the mobile app (OTA or build) and the web app both used to send `reminder_time` on
-- insert, and those inserts fail the moment the column is gone. The client change is safe to
-- ship first: the column is nullable, so an insert that omits it works either way.

alter table public.habits
  drop column if exists reminder_time;
