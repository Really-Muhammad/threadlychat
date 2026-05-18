import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, Video } from "lucide-react";

type Invite = {
  from: string;
  fromName: string;
  fromAvatar: string | null;
  threadId: string;
  threadTitle: string;
  video: boolean;
};

export function IncomingCallProvider() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [ringtone, setRingtone] = useState<{ ctx: AudioContext; iv: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`user-${user.id}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "ring" }, ({ payload }: { payload: Invite }) => {
      if (payload.from === user.id) return;
      setInvite(payload);
    });
    ch.on("broadcast", { event: "cancel" }, () => setInvite(null));
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  // Simple ringtone using WebAudio (no asset needed)
  useEffect(() => {
    if (!invite) { ringtone && (ringtone.ctx.close(), clearInterval(ringtone.iv)); setRingtone(null); return; }
    try {
      const ctx = new AudioContext();
      const play = () => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "sine"; o.frequency.value = 520;
        g.gain.value = 0.06;
        o.connect(g).connect(ctx.destination);
        o.start();
        setTimeout(() => { o.frequency.value = 660; }, 180);
        setTimeout(() => { o.stop(); }, 360);
      };
      play();
      const iv = window.setInterval(play, 1400);
      setRingtone({ ctx, iv });
      return () => { clearInterval(iv); ctx.close(); };
    } catch { /* ignore */ }
  }, [invite]);

  if (!invite || !user) return null;

  const accept = () => {
    const id = invite.threadId;
    const v = invite.video;
    setInvite(null);
    navigate({ to: "/call/$threadId", params: { threadId: id }, search: v ? { video: 1 } : {} });
  };

  const decline = async () => {
    const ch = supabase.channel(`user-${invite.from}`);
    await new Promise<void>((res) => ch.subscribe((s) => s === "SUBSCRIBED" && res()));
    ch.send({ type: "broadcast", event: "decline", payload: { from: user.id, threadId: invite.threadId } });
    supabase.removeChannel(ch);
    setInvite(null);
  };

  const initials = (invite.fromName || "?").trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md grid place-items-center p-4 animate-in fade-in">
      <div className="w-full max-w-sm rounded-3xl border bg-card p-6 shadow-2xl text-center">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center justify-center gap-1.5">
          <span className="size-2 rounded-full bg-primary animate-pulse" />
          Incoming {invite.video ? "video" : "voice"} call
        </div>
        <div className="relative inline-block mb-3">
          <Avatar className="size-24 ring-4 ring-primary/40">
            <AvatarImage src={invite.fromAvatar ?? undefined} />
            <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
          </Avatar>
          <span className="absolute inset-0 rounded-full ring-4 ring-primary/30 animate-ping" />
        </div>
        <div className="font-semibold text-lg">{invite.fromName}</div>
        <div className="text-sm text-muted-foreground">is calling in #{invite.threadTitle}</div>
        <div className="mt-6 flex items-center justify-center gap-6">
          <Button onClick={decline} size="icon" className="size-14 rounded-full bg-destructive hover:bg-destructive/90 text-destructive-foreground">
            <PhoneOff className="size-5" />
          </Button>
          <Button onClick={accept} size="icon" className="size-14 rounded-full bg-green-500 hover:bg-green-600 text-white">
            {invite.video ? <Video className="size-5" /> : <Phone className="size-5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
