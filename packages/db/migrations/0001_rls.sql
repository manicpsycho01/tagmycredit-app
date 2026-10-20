-- Tenant read isolation (DECISIONS A4).
-- Company users' reads run inside `withTenant()`, which does `SET LOCAL ROLE tmc_app` and sets
-- app.company_id. tmc_app can only SELECT, and row-level security limits rows to the viewer's company.
-- Writes, ops and background jobs use the owner connection after service-level authorisation.

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tmc_app') THEN
    CREATE ROLE tmc_app NOLOGIN;
  END IF;
END $$;--> statement-breakpoint
GRANT tmc_app TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO tmc_app;--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_company() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.company_id', true), '')::uuid $$;--> statement-breakpoint

-- Is `other` a counterparty of the viewer on any credit line? SECURITY DEFINER so the check itself
-- is not filtered by RLS (avoids policy recursion); it only ever returns a boolean.
CREATE OR REPLACE FUNCTION app_is_counterparty(other uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM credit_lines l
      WHERE (l.supplier_company_id = app_company() AND l.buyer_company_id = other)
         OR (l.buyer_company_id = app_company() AND l.supplier_company_id = other)
    )
  $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_in_own_project(other uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM project_members m JOIN projects p ON p.id = m.project_id
      WHERE p.owner_company_id = app_company() AND m.company_id = other
    )
  $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_line_visible(line uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM credit_lines l
      WHERE l.id = line AND app_company() IN (l.supplier_company_id, l.buyer_company_id)
    )
  $$;--> statement-breakpoint

-- Exact lookup by TMC-ID or CR number (DECISIONS A2). Returns only directory fields.
CREATE OR REPLACE FUNCTION lookup_company(q text)
  RETURNS TABLE (id uuid, tmc_id text, legal_name text, legal_name_ar text, city text, sector text, status company_status)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT c.id, c.tmc_id, c.legal_name, c.legal_name_ar, c.city, c.sector, c.status
    FROM companies c
    WHERE c.tmc_id = upper(trim(q)) OR c.cr_number = trim(q)
    LIMIT 1
  $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION lookup_company(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION lookup_company(text), app_company(), app_is_counterparty(uuid), app_in_own_project(uuid), app_line_visible(uuid) TO tmc_app;--> statement-breakpoint

GRANT SELECT ON companies, memberships, cfo_designations, credit_lines, credit_line_versions, snapshots,
  disputes, closure_requests, default_reports, score_releases, buyer_scores, projects, project_members,
  project_links, notifications TO tmc_app;--> statement-breakpoint
-- tmc_app sees user names/emails only for its own company's members (policy below).
GRANT SELECT (id, name, email) ON "user" TO tmc_app;--> statement-breakpoint
-- Attachment metadata only; file bytes are served through an authorised route on the owner connection.
GRANT SELECT (id, company_id, owner_type, owner_id, file_name, mime_type, size_bytes, created_at) ON attachments TO tmc_app;--> statement-breakpoint

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_read ON companies FOR SELECT TO tmc_app
  USING (id = app_company() OR app_is_counterparty(id) OR app_in_own_project(id));--> statement-breakpoint

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_read ON memberships FOR SELECT TO tmc_app USING (company_id = app_company());--> statement-breakpoint

ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_read ON "user" FOR SELECT TO tmc_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = "user".id AND m.company_id = app_company()));--> statement-breakpoint

ALTER TABLE cfo_designations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_read ON cfo_designations FOR SELECT TO tmc_app USING (company_id = app_company());--> statement-breakpoint

ALTER TABLE credit_lines ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_read ON credit_lines FOR SELECT TO tmc_app
  USING (app_company() IN (supplier_company_id, buyer_company_id));--> statement-breakpoint

ALTER TABLE credit_line_versions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_read ON credit_line_versions FOR SELECT TO tmc_app USING (app_line_visible(line_id));--> statement-breakpoint

ALTER TABLE snapshots ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_read ON snapshots FOR SELECT TO tmc_app USING (app_line_visible(line_id));--> statement-breakpoint

ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_read ON disputes FOR SELECT TO tmc_app USING (app_line_visible(line_id));--> statement-breakpoint

ALTER TABLE closure_requests ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_read ON closure_requests FOR SELECT TO tmc_app USING (app_line_visible(line_id));--> statement-breakpoint

ALTER TABLE default_reports ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_read ON default_reports FOR SELECT TO tmc_app USING (app_line_visible(line_id));--> statement-breakpoint

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_read ON attachments FOR SELECT TO tmc_app
  USING (company_id = app_company()
    OR (owner_type IN ('dispute', 'default') AND owner_id IS NOT NULL AND (
      EXISTS (SELECT 1 FROM disputes d WHERE d.id = attachments.owner_id AND app_line_visible(d.line_id))
      OR EXISTS (SELECT 1 FROM default_reports r WHERE r.id = attachments.owner_id AND app_line_visible(r.line_id)))));--> statement-breakpoint

-- Published network scores are readable by any company (the app additionally requires VERIFIED status).
-- Suppressed rows carry no values, so they reveal nothing beyond "not enough data".
ALTER TABLE buyer_scores ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_read ON buyer_scores FOR SELECT TO tmc_app USING (true);--> statement-breakpoint
-- The cohort hash is internal.
REVOKE SELECT ON buyer_scores FROM tmc_app;--> statement-breakpoint
GRANT SELECT (id, release_id, company_id, published, suppressed_reason, frozen, score, band, light, behaviour,
  confidence, exposure_band, supplier_band, explanation, created_at) ON buyer_scores TO tmc_app;--> statement-breakpoint

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_read ON projects FOR SELECT TO tmc_app USING (owner_company_id = app_company());--> statement-breakpoint
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_read ON project_members FOR SELECT TO tmc_app
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_company_id = app_company()));--> statement-breakpoint
ALTER TABLE project_links ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_read ON project_links FOR SELECT TO tmc_app
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_company_id = app_company()));--> statement-breakpoint

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_read ON notifications FOR SELECT TO tmc_app USING (company_id = app_company());--> statement-breakpoint

-- Audit log is append-only for everyone except the table owner's explicit maintenance.
CREATE OR REPLACE FUNCTION audit_events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END $$;--> statement-breakpoint
CREATE TRIGGER audit_events_no_update BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_immutable();
