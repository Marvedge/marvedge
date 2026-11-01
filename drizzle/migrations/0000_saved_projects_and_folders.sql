CREATE TABLE public.projects (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  draft jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads projects" ON public.projects FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY "Owner adds projects" ON public.projects FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = owner_id);
CREATE POLICY "Owner updates projects" ON public.projects FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = owner_id) WITH CHECK ((SELECT auth.uid()) = owner_id);
CREATE POLICY "Owner deletes projects" ON public.projects FOR DELETE TO authenticated USING ((SELECT auth.uid()) = owner_id);
CREATE INDEX projects_owner_idx ON public.projects (owner_id, updated_at DESC);

CREATE TABLE public.project_folders (
  owner_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_folders TO authenticated;
GRANT ALL ON public.project_folders TO service_role;
ALTER TABLE public.project_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads folders" ON public.project_folders FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY "Owner adds folders" ON public.project_folders FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = owner_id);
CREATE POLICY "Owner deletes folders" ON public.project_folders FOR DELETE TO authenticated USING ((SELECT auth.uid()) = owner_id);