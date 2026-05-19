import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { VoiceCall } from "@/components/chat/VoiceCall";

type Profile = { id: string; display_name: string | null; avatar_url: string | null };
type Thread = { id: string; title: string };

const searchSchema = z.object({ video: z.coerce.number().optional() });

export const Route = createFileRoute("/call/$threadId")({
  component: CallPage,
  ssr: false,
  validateSearch: searchSchema,
});

function CallPage() {
  const { threadId } = Route.useParams();
  const { video } = Route.useSearch();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [thread, setThread] = useState<Thread | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: t }, { data: p }] = await Promise.all([
        supabase.from("threads").select("id,title").eq("id", threadId).maybeSingle(),
        supabase.from("profiles").select("id,display_name,avatar_url"),
      ]);
      setThread(t as Thread | null);
      setProfiles(Object.fromEntries((p ?? []).map((x) => [x.id, x as Profile])));
      setReady(true);
    })();
  }, [threadId, user]);

  if (loading || !user || !ready) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Joining call…</div>;
  }
  if (!thread) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">
        <div className="text-center">
          <p className="mb-3">Call room not found.</p>
          <button onClick={() => navigate({ to: "/chat" })} className="text-primary underline">Back to chat</button>
        </div>
      </div>
    );
  }

  return (
    <VoiceCall
      threadId={thread.id}
      threadTitle={thread.title}
      userId={user.id}
      profiles={profiles}
      initialVideo={!!video}
      onLeave={() => navigate({ to: "/chat" })}
    />
  );
}
