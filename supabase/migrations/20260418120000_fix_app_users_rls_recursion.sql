-- Fix infinite recursion on app_users: policies must not SELECT app_users under RLS.
-- SECURITY DEFINER still evaluates RLS as the invoker unless row_security is disabled for the function body.

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT COALESCE(
    (SELECT (role = 'admin') FROM public.app_users WHERE id = auth.uid() LIMIT 1),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.app_user_role_in(_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT COALESCE(
    (SELECT role = ANY(_roles) FROM public.app_users WHERE id = auth.uid() LIMIT 1),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.app_user_id_text()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT id::text FROM public.app_users WHERE id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.app_user_role_in(text[]) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.app_user_id_text() TO authenticated, anon;

-- app_users
DROP POLICY IF EXISTS "admins_view_all_users" ON public.app_users;
DROP POLICY IF EXISTS "admins_update_all_users" ON public.app_users;

CREATE POLICY "admins_view_all_users" ON public.app_users FOR SELECT
  USING (public.is_app_admin());

CREATE POLICY "admins_update_all_users" ON public.app_users FOR UPDATE
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

-- auth_audit_logs (if present)
DO $do$
BEGIN
  IF to_regclass('public.auth_audit_logs') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "admins_view_all_audit" ON public.auth_audit_logs';
    EXECUTE 'CREATE POLICY "admins_view_all_audit" ON public.auth_audit_logs FOR SELECT USING (public.is_app_admin())';
  END IF;
END
$do$;

-- revenue_logs (if present)
DO $do$
BEGIN
  IF to_regclass('public.revenue_logs') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "revenue_logs_view" ON public.revenue_logs';
    EXECUTE $p$
      CREATE POLICY "revenue_logs_view" ON public.revenue_logs FOR SELECT
      USING (
        public.is_app_admin()
        OR employee_id = public.app_user_id_text()
      )
    $p$;
  END IF;
END
$do$;

-- alerts_config (if present — may not exist on minimal projects)
DO $do$
BEGIN
  IF to_regclass('public.alerts_config') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "admins_view_alerts_config" ON public.alerts_config';
    EXECUTE 'CREATE POLICY "admins_view_alerts_config" ON public.alerts_config FOR SELECT USING (public.app_user_role_in(ARRAY[''admin'',''manager'']::text[]))';
    EXECUTE 'DROP POLICY IF EXISTS "admins_update_alerts_config" ON public.alerts_config';
    EXECUTE 'CREATE POLICY "admins_update_alerts_config" ON public.alerts_config FOR UPDATE USING (public.is_app_admin()) WITH CHECK (public.is_app_admin())';
  END IF;
END
$do$;

-- notification_logs (if present)
DO $do$
BEGIN
  IF to_regclass('public.notification_logs') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "admins_view_notification_logs" ON public.notification_logs';
    EXECUTE 'CREATE POLICY "admins_view_notification_logs" ON public.notification_logs FOR SELECT USING (public.app_user_role_in(ARRAY[''admin'',''manager'']::text[]))';
  END IF;
END
$do$;

-- alert_audit_log (if present)
DO $do$
BEGIN
  IF to_regclass('public.alert_audit_log') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "admins_view_alert_audit" ON public.alert_audit_log';
    EXECUTE 'CREATE POLICY "admins_view_alert_audit" ON public.alert_audit_log FOR SELECT USING (public.app_user_role_in(ARRAY[''admin'',''manager'']::text[]))';
  END IF;
END
$do$;
