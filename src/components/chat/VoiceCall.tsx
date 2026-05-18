import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, PhoneOff, Volume2, Video, VideoOff, Link2, Users } from "lucide-react";
import { toast } from "sonner";

type Profile = { id: string; display_name: string | null; avatar_url: string | null };

const ICE = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] };

function initials(name?: string | null) {
  return (name ?? "?").trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
}

export function VoiceCall({
  threadId, threadTitle, userId, profiles, onLeave, initialVideo = false,
}: {
  threadId: string;
  threadTitle: string;
  userId: string;
  profiles: Record<string, Profile>;
  onLeave: () => void;
  initialVideo?: boolean;
}) {
  const [peers, setPeers] = useState<string[]>([]);
  const [muted, setMuted] = useState(false);
  const [videoOn, setVideoOn] = useState(initialVideo);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"connecting" | "waiting" | "in-call">("connecting");
  const [, force] = useState(0);

  const localStreamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const audiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const selfVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerVideoRefs = useRef<Map<string, HTMLVideoElement | null>>(new Map());

  // Status transitions
  useEffect(() => {
    if (peers.length > 0) setStatus("in-call");
    else if (status === "in-call") setStatus("waiting");
  }, [peers.length, status]);

  useEffect(() => {
    const t = setTimeout(() => setStatus((s) => (s === "connecting" ? "waiting" : s)), 1800);
    return () => clearTimeout(t);
  }, []);

  // Attach self video stream when video toggled on
  useEffect(() => {
    if (selfVideoRef.current && localStreamRef.current) {
      selfVideoRef.current.srcObject = localStreamRef.current;
    }
  });

  useEffect(() => {
    let cancelled = false;

    const send = (event: string, payload: Record<string, unknown>) => {
      chRef.current?.send({ type: "broadcast", event, payload: { from: userId, ...payload } });
    };

    const attachVideoEl = (remoteId: string, stream: MediaStream) => {
      const el = peerVideoRefs.current.get(remoteId);
      if (el) el.srcObject = stream;
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
        let stream = remoteStreamsRef.current.get(remoteId);
        if (!stream) {
          stream = new MediaStream();
          remoteStreamsRef.current.set(remoteId, stream);
        }
        // Avoid duplicate tracks
        if (!stream.getTracks().find((t) => t.id === e.track.id)) stream.addTrack(e.track);

        // Audio out
        let audio = audiosRef.current.get(remoteId);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audiosRef.current.set(remoteId, audio);
        }
        audio.srcObject = stream;
        attachVideoEl(remoteId, stream);
        force((x) => x + 1);

        // Speaking detection (audio only)
        if (e.track.kind === "audio") {
          try {
            const ctx = new AudioContext();
            const src = ctx.createMediaStreamSource(new MediaStream([e.track]));
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
        }
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
      remoteStreamsRef.current.delete(remoteId);
      const a = audiosRef.current.get(remoteId);
      if (a) { a.pause(); a.srcObject = null; audiosRef.current.delete(remoteId); }
      setPeers((cur) => cur.filter((x) => x !== remoteId));
      setSpeaking((cur) => { const n = new Set(cur); n.delete(remoteId); return n; });
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: initialVideo });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        localStreamRef.current = stream;
        if (!initialVideo) {
          stream.getVideoTracks().forEach((t) => (t.enabled = false));
        }
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
          await ch.track({ joined_at: new Date().toISOString(), video: initialVideo });
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
      remoteStreamsRef.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      if (chRef.current) supabase.removeChannel(chRef.current);
      chRef.current = null;
    };
  }, [threadId, userId, onLeave, initialVideo]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
  };

  const toggleVideo = async () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    if (videoOn) {
      stream.getVideoTracks().forEach((t) => { t.enabled = false; t.stop(); stream.removeTrack(t); });
      // remove sender
      pcsRef.current.forEach((pc) => {
        pc.getSenders().filter((s) => s.track?.kind === "video").forEach((s) => pc.removeTrack(s));
      });
      setVideoOn(false);
    } else {
      try {
        const vs = await navigator.mediaDevices.getUserMedia({ video: true });
        const track = vs.getVideoTracks()[0];
        stream.addTrack(track);
        pcsRef.current.forEach(async (pc) => {
          pc.addTrack(track, stream);
          // renegotiate
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          const remoteId = [...pcsRef.current.entries()].find(([, p]) => p === pc)?.[0];
          if (remoteId) chRef.current?.send({ type: "broadcast", event: "offer", payload: { from: userId, to: remoteId, sdp: offer } });
        });
        if (selfVideoRef.current) selfVideoRef.current.srcObject = stream;
        setVideoOn(true);
      } catch {
        toast.error("Camera access denied");
      }
    }
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/call/${threadId}${videoOn ? "?video=1" : ""}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  const allIds = [userId, ...peers];
  const headerStatus =
    status === "connecting" ? "Connecting…" :
    status === "waiting" ? "Waiting for others to join" :
    `${allIds.length} in call`;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex flex-col">
      <div className="px-6 py-4 border-b flex items-center gap-3">
        <div className="size-9 rounded-full grid place-items-center text-primary-foreground" style={{ background: "var(--gradient-brand)" }}>
          {videoOn ? <Video className="size-4" /> : <Volume2 className="size-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{videoOn ? "Video" : "Voice"} call · #{threadTitle}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            {status !== "in-call" && <span className="size-1.5 rounded-full bg-primary animate-pulse" />}
            {headerStatus}
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={copyLink} className="gap-2">
          <Link2 className="size-3.5" /> Invite
        </Button>
      </div>

      <div className="flex-1 grid place-items-center p-6 overflow-auto">
        <div className={`grid gap-4 max-w-4xl w-full ${videoOn || peers.some((id) => remoteStreamsRef.current.get(id)?.getVideoTracks().length)
          ? "grid-cols-1 sm:grid-cols-2"
          : "grid-cols-2 sm:grid-cols-3"}`}>
          {allIds.map((id) => {
            const p = profiles[id];
            const isSelf = id === userId;
            const isSpeaking = isSelf ? false : speaking.has(id);
            const remoteStream = remoteStreamsRef.current.get(id);
            const hasVideo = isSelf ? videoOn : !!remoteStream?.getVideoTracks().length;
            return (
              <div key={id} className="relative rounded-2xl overflow-hidden bg-card border aspect-video flex items-center justify-center">
                {hasVideo ? (
                  <video
                    autoPlay
                    playsInline
                    muted={isSelf}
                    ref={(el) => {
                      if (isSelf) selfVideoRef.current = el;
                      else {
                        peerVideoRefs.current.set(id, el);
                        if (el && remoteStream) el.srcObject = remoteStream;
                      }
                    }}
                    className="w-full h-full object-cover bg-black"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className={`relative rounded-full p-1 transition-all ${isSpeaking ? "ring-4 ring-primary/70 scale-105" : "ring-2 ring-border"}`}>
                      <Avatar className="size-20">
                        <AvatarImage src={p?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xl">{initials(p?.display_name)}</AvatarFallback>
                      </Avatar>
                      {isSpeaking && <span className="absolute inset-0 rounded-full animate-ping bg-primary/20" />}
                    </div>
                  </div>
                )}
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-xs">
                  <span className="px-2 py-0.5 rounded bg-black/60 text-white truncate max-w-[70%]">
                    {isSelf ? "You" : (p?.display_name ?? "Guest")}
                  </span>
                  {isSelf && muted && <span className="px-2 py-0.5 rounded bg-destructive text-destructive-foreground">Muted</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-6 flex items-center justify-center gap-4 border-t">
        <Button type="button" onClick={toggleMute} variant={muted ? "destructive" : "secondary"} size="icon" className="size-14 rounded-full" title={muted ? "Unmute" : "Mute"}>
          {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
        </Button>
        <Button type="button" onClick={toggleVideo} variant={videoOn ? "secondary" : "outline"} size="icon" className="size-14 rounded-full" title={videoOn ? "Stop camera" : "Start camera"}>
          {videoOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
        </Button>
        <Button type="button" onClick={copyLink} variant="secondary" size="icon" className="size-14 rounded-full" title="Copy invite link">
          <Users className="size-5" />
        </Button>
        <Button type="button" onClick={onLeave} size="icon" className="size-14 rounded-full bg-destructive hover:bg-destructive/90 text-destructive-foreground" title="Leave call">
          <PhoneOff className="size-5" />
        </Button>
      </div>
    </div>
  );
}
