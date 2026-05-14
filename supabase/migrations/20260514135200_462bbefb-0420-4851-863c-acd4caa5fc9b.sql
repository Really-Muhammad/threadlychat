
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles viewable by all authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Auto create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Threads
CREATE TABLE public.threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Threads viewable by authenticated" ON public.threads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create threads" ON public.threads FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creator can delete thread" ON public.threads FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_thread ON public.messages(thread_id, created_at);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Messages viewable by authenticated" ON public.messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can post messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own messages" ON public.messages FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Update last_message_at
CREATE OR REPLACE FUNCTION public.bump_thread_last_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.threads SET last_message_at = NEW.created_at WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER bump_thread_last_message AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.bump_thread_last_message();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.threads;
