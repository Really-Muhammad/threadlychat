import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";

export const Route = createFileRoute("/profile")({ component: ProfilePage, ssr: false });

function ProfilePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (data) {
        setDisplayName(data.display_name ?? "");
        setAvatarUrl(data.avatar_url ?? "");
        setBio(data.bio ?? "");
      }
    })();
  }, [user]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      display_name: displayName.trim() || null,
      avatar_url: avatarUrl.trim() || null,
      bio: bio.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
  };

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;

  const initials = (displayName || user.email || "?").trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center gap-3">
          <Button asChild variant="ghost" size="icon"><Link to="/chat"><ArrowLeft className="size-4" /></Link></Button>
          <h1 className="font-semibold">Your profile</h1>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-8">
        <form onSubmit={save} className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="size-20">
              <AvatarImage src={avatarUrl || undefined} />
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="text-sm text-muted-foreground">{user.email}</div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Display name</Label>
            <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="avatar">Avatar URL</Label>
            <Input id="avatar" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={4} placeholder="Tell people about yourself…" />
          </div>
          <Button type="submit" disabled={saving} className="gap-2"><Save className="size-4" /> {saving ? "Saving…" : "Save changes"}</Button>
        </form>
      </main>
    </div>
  );
}
