import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { ArrowLeft, Check, X, Users } from "lucide-react";

export const Route = createFileRoute("/friends")({ component: FriendsPage, ssr: false });

type Profile = { id: string; display_name: string | null; avatar_url: string | null; bio: string | null };
type Friendship = { id: string; requester_id: string; addressee_id: string; status: string; created_at: string };

function FriendsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [user, loading, navigate]);

  const load = async () => {
    if (!user) return;
    const { data: f } = await supabase.from("friendships").select("*").order("created_at", { ascending: false });
    const fs = (f ?? []) as Friendship[];
    setFriendships(fs);
    const ids = Array.from(new Set(fs.flatMap((x) => [x.requester_id, x.addressee_id])));
    if (ids.length) {
      const { data: p } = await supabase.from("profiles").select("id,display_name,avatar_url,bio").in("id", ids);
      setProfiles(Object.fromEntries((p ?? []).map((x) => [x.id, x as Profile])));
    }
  };
  useEffect(() => { load(); }, [user]);

  const accept = async (id: string) => {
    const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Friend added");
    load();
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("friendships").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  const initials = (n?: string | null) => (n ?? "?").trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  const incoming = friendships.filter((f) => f.status === "pending" && f.addressee_id === user.id);
  const outgoing = friendships.filter((f) => f.status === "pending" && f.requester_id === user.id);
  const accepted = friendships.filter((f) => f.status === "accepted");

  const Row = ({ otherId, action }: { otherId: string; action: React.ReactNode }) => {
    const p = profiles[otherId];
    return (
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <Avatar className="size-10"><AvatarImage src={p?.avatar_url ?? undefined} /><AvatarFallback>{initials(p?.display_name)}</AvatarFallback></Avatar>
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{p?.display_name ?? "Unnamed"}</div>
          {p?.bio && <div className="text-xs text-muted-foreground truncate">{p.bio}</div>}
        </div>
        <div className="flex gap-2">{action}</div>
      </div>
    );
  };

  const Section = ({ title, children, empty }: { title: string; children: React.ReactNode; empty: string }) => (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h2>
      <div className="space-y-2">{children}</div>
      {!children || (Array.isArray(children) && children.length === 0) ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : null}
    </section>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-3">
          <Button asChild variant="ghost" size="icon"><Link to="/chat"><ArrowLeft className="size-4" /></Link></Button>
          <h1 className="font-semibold flex-1 flex items-center gap-2"><Users className="size-4" /> Friends</h1>
          <Button asChild variant="outline" size="sm"><Link to="/directory">Find people</Link></Button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-6 space-y-8">
        <Section title={`Incoming requests (${incoming.length})`} empty="No pending requests.">
          {incoming.map((f) => (
            <Row key={f.id} otherId={f.requester_id} action={
              <>
                <Button size="sm" onClick={() => accept(f.id)} className="gap-1"><Check className="size-4" /> Accept</Button>
                <Button size="sm" variant="outline" onClick={() => remove(f.id)}><X className="size-4" /></Button>
              </>
            } />
          ))}
        </Section>
        <Section title={`Sent requests (${outgoing.length})`} empty="No outgoing requests.">
          {outgoing.map((f) => (
            <Row key={f.id} otherId={f.addressee_id} action={<Button size="sm" variant="outline" onClick={() => remove(f.id)}>Cancel</Button>} />
          ))}
        </Section>
        <Section title={`Friends (${accepted.length})`} empty="No friends yet — find people in the directory.">
          {accepted.map((f) => (
            <Row key={f.id} otherId={f.requester_id === user.id ? f.addressee_id : f.requester_id} action={<Button size="sm" variant="outline" onClick={() => remove(f.id)}>Remove</Button>} />
          ))}
        </Section>
      </main>
    </div>
  );
}
