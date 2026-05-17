import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import { toast } from "sonner";

type Profile = { id: string; display_name: string | null; avatar_url: string | null };

const ICE = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] };

function initials(name?: string | null) {
  return (name ?? "?").trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
}

export function VoiceCall({
  threadId, threadTitle, userId, profiles, onLeave,
}: {
  threadId: string;
  threadTitle: string;
  userId: string;
  profiles: Record<string, Profile>;
  onLeave: () => void;
}) {
  const [peers, setPeers] = useState<string[]>([]);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const send = (event: string, payload: Record<string, unknown>) => {
      chRef.current?.send({ type: "broadcast", event, payload: { from: userId, ...payload } });
    };

    const createPC = (remoteId: string, initiator: boolean) => {
      if (pcsRef.current.has(remoteId)) return pcsRef.current.get(remoteId)!;
      const pc = new RTCPeerConnection(ICE);
      pcsRef.current.set(remoteId, pc);

      localStreamRef.current?.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current!));

      pc.onicecandidate = (e) => {
        if (e.candidate) send("ice", { to: remoteId, candidate: e.candidate });
      };
      pc.ontrack = (e) => {
        let audio = audiosRef.current.get(remoteId);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audiosRef.current.set(remoteId, audio);
        }
        audio.srcObject = e.streams[0];

        // Speaking detection
        try {
          const ctx = new AudioContext();
          const src = ctx.createMediaStreamSource(e.streams[0]);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          src.connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            if (!pcsRef.current.has(remoteId)) return;
            analyser.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            setSpeaking((cur) => {
              const n = new Set(cur);
              if (avg > 18) n.add(remoteId); else n.delete(remoteId);
              return n;
            });
            requestAnimationFrame(tick);
          };
          tick();
        } catch {}
      };
      pc.onconnectionstatechange = () => {
        if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
          cleanupPeer(remoteId);
        }
      };

      if (initiator) {
        (async () => {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          send("offer", { to: remoteId, sdp: offer });
        })();
      }
      return pc;
    };

    const cleanupPeer = (remoteId: string) => {
      const pc = pcsRef.current.get(remoteId);
      pc?.close();
      pcsRef.current.delete(remoteId);
      const a = audiosRef.current.get(remoteId);
      if (a) { a.pause(); a.srcObject = null; audiosRef.current.delete(remoteId); }
      setPeers((cur) => cur.filter((x) => x !== remoteId));
      setSpeaking((cur) => { const n = new Set(cur); n.delete(remoteId); return n; });
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        localStreamRef.current = stream;
      } catch {
        toast.error("Microphone access denied");
        onLeave();
        return;
      }

      const ch = supabase.channel(`call-${threadId}`, { config: { presence: { key: userId } } });
      chRef.current = ch;

      ch.on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        const ids = Object.keys(state).filter((id) => id !== userId);
        setPeers(ids);
      });
      ch.on("presence", { event: "leave" }, ({ key }) => {
        if (key !== userId) cleanupPeer(key);
      });

      ch.on("broadcast", { event: "hello" }, ({ payload }: { payload: { from: string } }) => {
        if (payload.from === userId) return;
        // Deterministic initiator: smaller id initiates to avoid double-offer
        const initiator = userId < payload.from;
        createPC(payload.from, initiator);
      });
      ch.on("broadcast", { event: "offer" }, async ({ payload }: { payload: { from: string; to: string; sdp: RTCSessionDescriptionInit } }) => {
        if (payload.to !== userId) return;
        const pc = createPC(payload.from, false);
        await pc.setRemoteDescription(payload.sdp);
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        send("answer", { to: payload.from, sdp: ans });
      });
      ch.on("broadcast", { event: "answer" }, async ({ payload }: { payload: { from: string; to: string; sdp: RTCSessionDescriptionInit } }) => {
        if (payload.to !== userId) return;
        const pc = pcsRef.current.get(payload.from);
        if (pc && !pc.currentRemoteDescription) await pc.setRemoteDescription(payload.sdp);
      });
      ch.on("broadcast", { event: "ice" }, async ({ payload }: { payload: { from: string; to: string; candidate: RTCIceCandidateInit } }) => {
        if (payload.to !== userId) return;
        const pc = pcsRef.current.get(payload.from);
        try { await pc?.addIceCandidate(payload.candidate); } catch {}
      });

      ch.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await ch.track({ joined_at: new Date().toISOString() });
          send("hello", {});
        }
      });
    })();

    return () => {
      cancelled = true;
      pcsRef.current.forEach((pc) => pc.close());
      pcsRef.current.clear();
      audiosRef.current.forEach((a) => { a.pause(); a.srcObject = null; });
      audiosRef.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      if (chRef.current) supabase.removeChannel(chRef.current);
      chRef.current = null;
    };
  }, [threadId, userId, onLeave]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
  };

  const allIds = [userId, ...peers];

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex flex-col">
      <div className="px-6 py-4 border-b flex items-center gap-3">
        <div className="size-9 rounded-full grid place-items-center text-primary-foreground" style={{ background: "var(--gradient-brand)" }}>
          <Volume2 className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold truncate">Voice call · #{threadTitle}</div>
          <div className="text-xs text-muted-foreground">{allIds.length} participant{allIds.length === 1 ? "" : "s"}</div>
        </div>
      </div>

      <div className="flex-1 grid place-items-center p-6 overflow-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 max-w-2xl w-full">
          {allIds.map((id) => {
            const p = profiles[id];
            const isSelf = id === userId;
            const isSpeaking = isSelf ? false : speaking.has(id);
            return (
              <div key={id} className="flex flex-col items-center gap-2">
                <div className={`relative rounded-full p-1 transition-all ${isSpeaking ? "ring-4 ring-primary/70 scale-105" : "ring-2 ring-border"}`}>
                  <Avatar className="size-24">
                    <AvatarImage src={p?.avatar_url ?? undefined} />
                    <AvatarFallback className="text-2xl">{initials(p?.display_name)}</AvatarFallback>
                  </Avatar>
                  {isSpeaking && (
                    <span className="absolute inset-0 rounded-full animate-ping bg-primary/20" />
                  )}
                </div>
                <div className="text-sm font-medium truncate max-w-[10rem] text-center">
                  {isSelf ? "You" : (p?.display_name ?? "Guest")}
                </div>
                {isSelf && muted && <span className="text-[10px] text-destructive font-semibold">Muted</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-6 flex items-center justify-center gap-4 border-t">
        <Button
          type="button"
          onClick={toggleMute}
          variant={muted ? "destructive" : "secondary"}
          size="icon"
          className="size-14 rounded-full"
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
        </Button>
        <Button
          type="button"
          onClick={onLeave}
          size="icon"
          className="size-14 rounded-full bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          title="Leave call"
        >
          <PhoneOff className="size-5" />
        </Button>
      </div>
    </div>
  );
}