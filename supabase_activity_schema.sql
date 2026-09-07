-- Run after supabase_access_control.sql in the Supabase SQL Editor.
BEGIN;
CREATE TABLE IF NOT EXISTS public.app_login_history (
  session_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.app_user_access(user_id) ON DELETE CASCADE,
  logged_in_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS app_login_history_recent ON public.app_login_history(logged_in_at DESC);
CREATE TABLE IF NOT EXISTS public.app_user_activity (
  user_id uuid PRIMARY KEY REFERENCES public.app_user_access(user_id) ON DELETE CASCADE,
  last_login_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_section_path text NOT NULL
);
ALTER TABLE public.app_login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_user_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_login_history, public.app_user_activity FROM anon, authenticated;
GRANT SELECT ON public.app_login_history, public.app_user_activity TO authenticated;
DROP POLICY IF EXISTS "admins read login history" ON public.app_login_history;
CREATE POLICY "admins read login history" ON public.app_login_history FOR SELECT TO authenticated USING (public.is_app_admin());
DROP POLICY IF EXISTS "admins read activity" ON public.app_user_activity;
CREATE POLICY "admins read activity" ON public.app_user_activity FOR SELECT TO authenticated USING (public.is_app_admin());

-- Identity, session and timestamps come from the authenticated server session.
-- Session ID uniqueness prevents refreshes/token renewal from duplicating logins.
CREATE OR REPLACE FUNCTION public.record_app_activity(section_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  current_session_id uuid := (auth.jwt()->>'session_id')::uuid;
  login_time timestamptz;
BEGIN
  IF NOT public.has_active_app_access() THEN
    RAISE EXCEPTION 'Approved account required' USING ERRCODE = '42501';
  END IF;
  IF section_path IS NULL OR length(section_path) > 120 OR
     section_path !~ '^/([a-z0-9-]+/?)*$' THEN
    RAISE EXCEPTION 'Invalid section path' USING ERRCODE = '22023';
  END IF;
  SELECT created_at INTO login_time FROM auth.sessions
    WHERE id = current_session_id AND user_id = current_user_id;
  IF login_time IS NULL THEN
    RAISE EXCEPTION 'Active session required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.app_login_history(session_id, user_id, logged_in_at)
    VALUES(current_session_id, current_user_id, login_time) ON CONFLICT DO NOTHING;
  INSERT INTO public.app_user_activity(user_id, last_login_at, last_seen_at, last_section_path)
    VALUES(current_user_id, login_time, clock_timestamp(), section_path)
    ON CONFLICT(user_id) DO UPDATE SET
      last_login_at = greatest(app_user_activity.last_login_at, EXCLUDED.last_login_at),
      last_seen_at = EXCLUDED.last_seen_at,
      last_section_path = EXCLUDED.last_section_path;
END;
$$;
REVOKE ALL ON FUNCTION public.record_app_activity(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_app_activity(text) TO authenticated;
COMMIT;
