
-- Reactions table
CREATE TABLE public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reactions viewable by authenticated"
  ON public.message_reactions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users add own reactions"
  ON public.message_reactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users remove own reactions"
  ON public.message_reactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_message_reactions_message ON public.message_reactions(message_id);

-- Online status
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

-- Realtime
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
