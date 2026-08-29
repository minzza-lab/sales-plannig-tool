-- 영업기획 도구 접근 승인 및 관리자 권한
-- Supabase SQL Editor에서 한 번 실행합니다.

CREATE TABLE IF NOT EXISTS public.app_user_access (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  full_name text,
  department text,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.has_active_app_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_user_access
    WHERE user_id = auth.uid() AND status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_user_access
    WHERE user_id = auth.uid() AND status = 'approved' AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_active_app_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_app_user_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.app_user_access (user_id, email, full_name, department, role, status, approved_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'department', ''),
    CASE WHEN NEW.email = 'emp_20203029@wellyhilly.com' THEN 'admin' ELSE 'member' END,
    CASE WHEN NEW.email = 'emp_20203029@wellyhilly.com' THEN 'approved' ELSE 'pending' END,
    CASE WHEN NEW.email = 'emp_20203029@wellyhilly.com' THEN now() ELSE NULL END
  ) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_app_access ON auth.users;
CREATE TRIGGER on_auth_user_created_app_access
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_app_user_access();

-- 이미 생성된 팀원은 업무가 끊기지 않도록 승인 상태로 옮기고,
-- 20203029 계정만 관리자 권한으로 승격합니다.
INSERT INTO public.app_user_access (user_id, email, full_name, department, role, status, approved_at)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data ->> 'full_name', ''),
  COALESCE(raw_user_meta_data ->> 'department', ''),
  CASE WHEN email = 'emp_20203029@wellyhilly.com' THEN 'admin' ELSE 'member' END,
  'approved',
  now()
FROM auth.users
ON CONFLICT (user_id) DO UPDATE SET
  email = EXCLUDED.email,
  role = CASE WHEN EXCLUDED.email = 'emp_20203029@wellyhilly.com' THEN 'admin' ELSE app_user_access.role END,
  status = CASE WHEN EXCLUDED.email = 'emp_20203029@wellyhilly.com' THEN 'approved' ELSE app_user_access.status END,
  approved_at = CASE WHEN EXCLUDED.email = 'emp_20203029@wellyhilly.com' THEN now() ELSE app_user_access.approved_at END,
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.app_access_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_role text,
  previous_status text,
  next_role text,
  next_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.log_app_access_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  IF OLD.role IS DISTINCT FROM NEW.role OR OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.app_access_audit (target_user_id, actor_user_id, previous_role, previous_status, next_role, next_status)
    VALUES (NEW.user_id, auth.uid(), OLD.role, OLD.status, NEW.role, NEW.status);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_app_user_access_changed ON public.app_user_access;
CREATE TRIGGER on_app_user_access_changed
  BEFORE UPDATE ON public.app_user_access
  FOR EACH ROW EXECUTE FUNCTION public.log_app_access_change();

ALTER TABLE public.app_user_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_access_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own access" ON public.app_user_access;
DROP POLICY IF EXISTS "admins manage access" ON public.app_user_access;
DROP POLICY IF EXISTS "admins read access audit" ON public.app_access_audit;
CREATE POLICY "users read own access" ON public.app_user_access
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_app_admin());
CREATE POLICY "admins manage access" ON public.app_user_access
  FOR UPDATE TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
CREATE POLICY "admins read access audit" ON public.app_access_audit
  FOR SELECT TO authenticated USING (public.is_app_admin());

-- 기존 도구 데이터는 승인된 계정만 접근하도록 전환합니다.
DO $$
DECLARE
  target_table text;
  existing_policy record;
  protected_tables text[] := ARRAY[
    'daily_reports', 'sync_status', 'waterpark_sales', 'season_pass_baseline', 'season_pass_orders',
    'package_orders', 'sales_companies', 'sales_products', 'sales_daily_results', 'sales_product_files',
    'team_calendar_events', 'work_tasks', 'work_task_comments', 'approvals', 'approval_comments',
    'product_proposals', 'product_proposal_comments', 'voc_inquiries', 'knowledge_base',
    'knowledge_comments', 'automation_requests', 'automation_comments', 'qr_mapping_data'
  ];
BEGIN
  FOREACH target_table IN ARRAY protected_tables LOOP
    IF to_regclass('public.' || target_table) IS NOT NULL THEN
      FOR existing_policy IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = target_table LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', existing_policy.policyname, target_table);
      END LOOP;
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.has_active_app_access()) WITH CHECK (public.has_active_app_access())',
        'approved app users only', target_table
      );
    END IF;
  END LOOP;
END $$;
