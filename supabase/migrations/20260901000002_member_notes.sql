-- Üye (müşteri) hakkında admin notları — üye detay sayfasında gösterilir.
CREATE TABLE IF NOT EXISTS public.member_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS member_notes_user_idx ON public.member_notes (user_id, created_at DESC);

ALTER TABLE public.member_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manages member notes" ON public.member_notes;
CREATE POLICY "Admin manages member notes"
  ON public.member_notes FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT ALL ON public.member_notes TO authenticated, service_role;
