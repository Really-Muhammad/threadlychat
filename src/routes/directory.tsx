import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { ArrowLeft, Search, UserPlus, Check, Clock } from "lucide-react";

export const Route = createFileRoute("/directory")({ component: DirectoryPage, ssr: false });

type Profile = { id: string; display_name: string | null; avatar_url: string | null; bio: string | null };
type Friendship = { id: string; requester_id: string; addressee_id: string; status: string };

function DirectoryPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [user, loading, navigate]);

  const load = async () => {
    if (!user) return;
    const { data: p } = await supabase.from("profiles").select("id,display_name,avatar_url,bio").neq("id", user.id).order("display_name");
    setProfiles(p ?? []);
    const { data: f } = await supabase.from("friendships").select("id,requester_id,addressee_id,status");
    setFriendships(f ?? []);
  };
  useEffect(() => { load(); }, [user]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return profiles;
    return profiles.filter((p) => (p.display_name ?? "").toLowerCase().includes(s) || (p.bio ?? "").toLowerCase().includes(s));
  }, [q, profiles]);

  const statusFor = (otherId: string) => {
    const f = friendships.find((x) => (x.requester_id === otherId && x.addressee_id === user!.id) || (x.requester_id === user!.id && x.addressee_id === otherId));
    if (!f) return { kind: "none" as const };
    if (f.status === "accepted") return { kind: "friends" as const };
    if (f.requester_id === user!.id) return { kind: "sent" as const };
    return { kind: "incoming" as const, id: f.id };
  };

  const sendRequest = async (otherId: string) => {
    if (!user) return;
    const { error } = await supabase.from("friendships").insert({ requester_id: user.id, addressee_id: otherId });
    if (error) return toast.error(error.message);
    toast.success("Friend request sent");
    load();
  };

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  const initials = (n?: string | null) => (n ?? "?").trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-3">
          <Button asChild variant="ghost" size="icon"><Link to="/chat"><ArrowLeft className="size-4" /></Link></Button>
          <h1 className="font-semibold flex-1">Directory</h1>
          <Button asChild variant="outline" size="sm"><Link to="/friends">Friends</Link></Button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-6 space-y-4">
        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people by name or bio…" className="pl-9" />
        </div>
        <div className="space-y-2">
          {filtered.length === 0 && <p className="text-sm text-muted-foreground py-12 text-center">No people found.</p>}
          {filtered.map((p) => {
            const s = statusFor(p.id);
            return (
              <div key={p.id} className="flex items-center gap-3 rounded-lg border p-3">
                <Avatar className="size-10"><AvatarImage src={p.avatar_url ?? undefined} /><AvatarFallback>{initials(p.display_name)}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{p.display_name ?? "Unnamed"}</div>
                  {p.bio && <div className="text-xs text-muted-foreground truncate">{p.bio}</div>}
                </div>
                {s.kind === "none" && <Button size="sm" onClick={() => sendRequest(p.id)} className="gap-1"><UserPlus className="size-4" /> Add</Button>}
                {s.kind === "sent" && <Button size="sm" variant="outline" disabled className="gap-1"><Clock className="size-4" /> Pending</Button>}
                {s.kind === "incoming" && <Button asChild size="sm" variant="outline"><Link to="/friends">Respond</Link></Button>}
                {s.kind === "friends" && <Button size="sm" variant="secondary" disabled className="gap-1"><Check className="size-4" /> Friends</Button>}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
