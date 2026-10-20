-- Backend support: credit-line id sequence and directory helpers for non-counterparty reads (ARCHITECTURE §2).
CREATE SEQUENCE IF NOT EXISTS tcl_seq START 1 MAXVALUE 9999999;--> statement-breakpoint

-- Directory fields of one company by id (score card of a buyer found through exact lookup). Same fields as
-- lookup_company; ids are only learned through that exact lookup, a line, or a project.
CREATE OR REPLACE FUNCTION company_directory(cid uuid)
  RETURNS TABLE (id uuid, tmc_id text, legal_name text, legal_name_ar text, city text, sector text, status company_status)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT c.id, c.tmc_id, c.legal_name, c.legal_name_ar, c.city, c.sector, c.status FROM companies c WHERE c.id = cid
  $$;--> statement-breakpoint

-- Whether a company has an ACTIVE CFO (can be tagged as a buyer). Boolean only.
CREATE OR REPLACE FUNCTION company_has_active_cfo(cid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM cfo_designations d WHERE d.company_id = cid AND d.status = 'ACTIVE') $$;--> statement-breakpoint

REVOKE ALL ON FUNCTION company_directory(uuid), company_has_active_cfo(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION company_directory(uuid), company_has_active_cfo(uuid) TO tmc_app;
