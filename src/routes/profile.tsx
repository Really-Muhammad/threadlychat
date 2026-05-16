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
import { ArrowLeft, Save, AtSign, Mail, Pencil, Upload } from "lucide-react";

export const Route = createFileRoute("/profile")({ component: ProfilePage, ssr: false });

function ProfilePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (upErr) { setUploading(false); return toast.error(upErr.message); }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    await supabase.from("profiles").upsert({ id: user.id, avatar_url: data.publicUrl });
    setUploading(false);
    toast.success("Avatar updated");
  };

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;

  const initials = (displayName || user.email || "?").trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-3">
          <Button asChild variant="ghost" size="icon"><Link to="/chat"><ArrowLeft className="size-4" /></Link></Button>
          <h1 className="font-semibold">My Account</h1>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Discord-style profile card: banner + overlapping avatar */}
        <div className="rounded-xl overflow-hidden border bg-card shadow-soft">
          <div className="h-28 sm:h-32" style={{ background: "var(--gradient-brand)" }} />
          <div className="px-5 pb-5 -mt-12 sm:-mt-14">
            <div className="flex items-end justify-between gap-3">
              <Avatar className="size-24 sm:size-28 ring-4 ring-card">
                <AvatarImage src={avatarUrl || undefined} />
                <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
              </Avatar>
              <label className="mb-1">
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }} />
                <Button asChild variant="secondary" size="sm" className="gap-2 cursor-pointer"><span><Upload className="size-3.5" /> {uploading ? "Uploading…" : "Upload"}</span></Button>
              </label>
            </div>
            <div className="mt-4 rounded-lg bg-background/60 p-4 space-y-4">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">Display name</div>
                <div className="text-base font-semibold">{displayName || "Set a display name"}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1"><AtSign className="size-3" /> Username</div>
                <div className="text-sm">{(user.email ?? "").split("@")[0]}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1"><Mail className="size-3" /> Email</div>
                <div className="text-sm">{user.email}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">About me</div>
                <div className="text-sm whitespace-pre-wrap">{bio || <span className="text-muted-foreground italic">No bio yet.</span>}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Edit form */}
        <form onSubmit={save} className="mt-6 rounded-xl border bg-card p-5 sm:p-6 space-y-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold border-b pb-3">Edit profile</div>
          <div className="space-y-2">
            <Label htmlFor="name" className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">Display name</Label>
            <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" className="bg-background border-0" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="avatar" className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">Avatar URL</Label>
            <Input id="avatar" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" className="bg-background border-0" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio" className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">About me</Label>
            <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={4} placeholder="Tell people about yourself…" className="bg-background border-0 resize-none" />
          </div>
          <div className="flex justify-end pt-2 border-t">
            <Button type="submit" disabled={saving} className="gap-2" style={{ background: "var(--gradient-brand)" }}>
              <Save className="size-4" /> {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
