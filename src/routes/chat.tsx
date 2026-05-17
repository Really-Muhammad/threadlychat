import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { LogOut, Plus, Send, MessageCircle, Hash, Users, Search, UserCircle, Paperclip, Mic, SmilePlus, Phone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { VoiceNote, RecordingBar } from "@/components/chat/VoiceNote";
import { VoiceCall } from "@/components/chat/VoiceCall";

export const Route = createFileRoute("/chat")({ component: ChatPage, ssr: false });

type Thread = { id: string; title: string; created_by: string; last_message_at: string };
type Message = { id: string; thread_id: string; user_id: string; content: string; created_at: string; attachment_url?: string | null };
type Profile = { id: string; display_name: string | null; avatar_url: string | null; last_seen_at?: string | null };
type Reaction = { id: string; message_id: string; user_id: string; emoji: string };

const EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🔥"];
const ONLINE_WINDOW_MS = 60_000;

function isOnline(p?: Profile, presence?: Set<string>) {
  if (!p) return false;
  if (presence?.has(p.id)) return true;
  if (!p.last_seen_at) return false;
  return Date.now() - new Date(p.last_seen_at).getTime() < ONLINE_WINDOW_MS;
}

function ChatPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [draft, setDraft] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [inCall, setInCall] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [presence, setPresence] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelRecRef = useRef(false);
  const typingChRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSent = useRef(0);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  // Heartbeat last_seen_at + global presence channel
  useEffect(() => {
    if (!user) return;
    const beat = async () => {
      await supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id);
    };
    beat();
    const iv = setInterval(beat, 30_000);

    const ch = supabase.channel("presence:global", { config: { presence: { key: user.id } } });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      setPresence(new Set(Object.keys(state)));
    });
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") ch.track({ online_at: new Date().toISOString() });
    });
    return () => { clearInterval(iv); supabase.removeChannel(ch); };
  }, [user]);

  // Load threads + profiles
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: t } = await supabase.from("threads").select("*").order("last_message_at", { ascending: false });
      setThreads(t ?? []);
      if (t && t.length && !activeId) setActiveId(t[0].id);
      const { data: p } = await supabase.from("profiles").select("*");
      setProfiles(Object.fromEntries((p ?? []).map((x) => [x.id, x as Profile])));
    })();

    const ch = supabase
      .channel("threads-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "threads" }, async () => {
        const { data: t } = await supabase.from("threads").select("*").order("last_message_at", { ascending: false });
        setThreads(t ?? []);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (payload) => {
        const np = payload.new as Profile;
        setProfiles((cur) => ({ ...cur, [np.id]: { ...cur[np.id], ...np } }));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  // Load messages + reactions for active thread + realtime
  useEffect(() => {
    if (!activeId || !user) { setMessages([]); setReactions([]); return; }
    (async () => {
      const { data: m } = await supabase.from("messages").select("*").eq("thread_id", activeId).order("created_at");
      setMessages(m ?? []);
      const ids = (m ?? []).map((x) => x.id);
      if (ids.length) {
        const { data: r } = await supabase.from("message_reactions").select("*").in("message_id", ids);
        setReactions(r ?? []);
      } else setReactions([]);
    })();

    const msgCh = supabase
      .channel(`messages-${activeId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `thread_id=eq.${activeId}` },
        async (payload) => {
          const m = payload.new as Message;
          setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
          if (!profiles[m.user_id]) {
            const { data } = await supabase.from("profiles").select("*").eq("id", m.user_id).single();
            if (data) setProfiles((p) => ({ ...p, [data.id]: data as Profile }));
          }
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `thread_id=eq.${activeId}` },
        (payload) => setMessages((cur) => cur.filter((x) => x.id !== (payload.old as Message).id)))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reactions" }, (payload) => {
        const r = payload.new as Reaction;
        setReactions((cur) => (cur.some((x) => x.id === r.id) ? cur : [...cur, r]));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "message_reactions" }, (payload) => {
        const r = payload.old as Reaction;
        setReactions((cur) => cur.filter((x) => x.id !== r.id));
      })
      .subscribe();

    // Typing broadcast channel per thread
    const tch = supabase.channel(`typing-${activeId}`, { config: { broadcast: { self: false } } });
    tch.on("broadcast", { event: "typing" }, ({ payload }: { payload: { userId: string } }) => {
      setTypingUsers((cur) => ({ ...cur, [payload.userId]: Date.now() }));
    });
    tch.subscribe();
    typingChRef.current = tch;

    const sweep = setInterval(() => {
      setTypingUsers((cur) => {
        const cutoff = Date.now() - 4000;
        const next: Record<string, number> = {};
        for (const k in cur) if (cur[k] > cutoff) next[k] = cur[k];
        return next;
      });
    }, 1500);

    return () => {
      supabase.removeChannel(msgCh);
      supabase.removeChannel(tch);
      typingChRef.current = null;
      clearInterval(sweep);
      setTypingUsers({});
    };
  }, [activeId, user]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, reactions]);

  const activeThread = useMemo(() => threads.find((t) => t.id === activeId), [threads, activeId]);

  const createThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTitle.trim()) return;
    const { data, error } = await supabase.from("threads").insert({ title: newTitle.trim(), created_by: user.id }).select().single();
    if (error) return toast.error(error.message);
    setNewTitle(""); setOpenNew(false); setActiveId(data.id);
  };

  const broadcastTyping = () => {
    if (!user || !typingChRef.current) return;
    const now = Date.now();
    if (now - lastTypingSent.current < 1500) return;
    lastTypingSent.current = now;
    typingChRef.current.send({ type: "broadcast", event: "typing", payload: { userId: user.id } });
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeId || !draft.trim()) return;
    const content = draft.trim();
    setDraft("");
    const { error } = await supabase.from("messages").insert({ thread_id: activeId, user_id: user.id, content });
    if (error) toast.error(error.message);
  };

  const uploadAttachment = async (file: File, label?: string) => {
    if (!user || !activeId) return;
    setUploading(true);
    const ext = file.name.split(".").pop() || "bin";
    const path = `${user.id}/${activeId}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("attachments").upload(path, file);
    if (upErr) { setUploading(false); return toast.error(upErr.message); }
    const { data } = supabase.storage.from("attachments").getPublicUrl(path);
    const { error } = await supabase.from("messages").insert({
      thread_id: activeId, user_id: user.id, content: label ?? file.name, attachment_url: data.publicUrl,
    });
    setUploading(false);
    if (error) toast.error(error.message);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      cancelRecRef.current = false;
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
        setRecSeconds(0);
        if (cancelRecRef.current) { chunksRef.current = []; return; }
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
        await uploadAttachment(file, "🎤 Voice message");
      };
      mr.start();
      recRef.current = mr;
      setRecording(true);
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch (err) {
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    cancelRecRef.current = false;
    recRef.current?.stop();
    recRef.current = null;
    setRecording(false);
  };

  const cancelRecording = () => {
    cancelRecRef.current = true;
    recRef.current?.stop();
    recRef.current = null;
    setRecording(false);
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;
    const existing = reactions.find((r) => r.message_id === messageId && r.user_id === user.id && r.emoji === emoji);
    if (existing) {
      await supabase.from("message_reactions").delete().eq("id", existing.id);
    } else {
      await supabase.from("message_reactions").insert({ message_id: messageId, user_id: user.id, emoji });
    }
  };

  const me = user ? profiles[user.id] : undefined;
  const initials = (name?: string | null) => (name ?? "?").trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  const typingNames = Object.keys(typingUsers)
    .filter((id) => id !== user?.id)
    .map((id) => profiles[id]?.display_name ?? "Someone")
    .slice(0, 3);

  if (loading || !user) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="h-screen flex bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-72 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="p-4 border-b flex items-center gap-2">
          <div className="size-8 rounded-lg grid place-items-center text-primary-foreground" style={{ background: "var(--gradient-brand)" }}>
            <MessageCircle className="size-4" />
          </div>
          <div className="font-semibold">Connect</div>
        </div>

        <div className="p-3">
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild>
              <Button className="w-full justify-start gap-2"><Plus className="size-4" /> New thread</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create a new thread</DialogTitle></DialogHeader>
              <form onSubmit={createThread} className="space-y-3">
                <Input placeholder="e.g. General, Design ideas, Random…" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} autoFocus />
                <DialogFooter><Button type="submit">Create</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <nav className="px-3 pb-2 grid grid-cols-3 gap-1">
          <Button asChild variant="ghost" size="sm" className="flex-col h-auto py-2 gap-1"><Link to="/directory"><Search className="size-4" /><span className="text-xs">Find</span></Link></Button>
          <Button asChild variant="ghost" size="sm" className="flex-col h-auto py-2 gap-1"><Link to="/friends"><Users className="size-4" /><span className="text-xs">Friends</span></Link></Button>
          <Button asChild variant="ghost" size="sm" className="flex-col h-auto py-2 gap-1"><Link to="/profile"><UserCircle className="size-4" /><span className="text-xs">Profile</span></Link></Button>
        </nav>

        <ScrollArea className="flex-1 px-2">
          <div className="space-y-1 pb-4">
            {threads.length === 0 && (
              <p className="text-sm text-muted-foreground px-3 py-6 text-center">No threads yet. Create the first one!</p>
            )}
            {threads.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={`w-full text-left rounded-lg px-3 py-2 transition-colors flex items-start gap-2 ${
                  activeId === t.id ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60"
                }`}
              >
                <Hash className="size-4 mt-0.5 opacity-70" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{t.title}</div>
                  <div className="text-xs opacity-60">
                    {formatDistanceToNow(new Date(t.last_message_at), { addSuffix: true })}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>

        <div className="p-3 border-t flex items-center gap-2">
          <div className="relative">
            <Avatar className="size-8">
              <AvatarImage src={me?.avatar_url ?? undefined} />
              <AvatarFallback>{initials(me?.display_name ?? user.email)}</AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-green-500 ring-2 ring-sidebar" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{me?.display_name ?? user.email}</div>
            <div className="text-xs text-green-500">Online</div>
          </div>
          <Button size="icon" variant="ghost" onClick={signOut} title="Sign out"><LogOut className="size-4" /></Button>
        </div>
      </aside>

      {/* Main */}
      <section className="flex-1 flex flex-col min-w-0 bg-background">
        {activeThread ? (
          <>
            <header className="h-14 border-b px-6 flex items-center gap-2 bg-card/50 backdrop-blur">
              <Hash className="size-4 text-muted-foreground" />
              <h1 className="font-semibold">{activeThread.title}</h1>
              <span className="ml-auto text-xs text-muted-foreground mr-2">
                {presence.size} online
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="rounded-full text-primary hover:bg-primary/10"
                title="Start voice call"
                onClick={() => setInCall(true)}
              >
                <Phone className="size-4" />
              </Button>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground py-12 text-sm">No messages yet — say hi 👋</div>
              )}
              {messages.map((m, i) => {
                const p = profiles[m.user_id];
                const prev = messages[i - 1];
                const grouped = prev && prev.user_id === m.user_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;
                const mine = m.user_id === user.id;
                const online = isOnline(p, presence);
                const msgReactions = reactions.filter((r) => r.message_id === m.id);
                const grouped_reactions = msgReactions.reduce<Record<string, Reaction[]>>((acc, r) => {
                  (acc[r.emoji] ||= []).push(r); return acc;
                }, {});
                const isAudio = m.attachment_url && /\.(webm|mp3|ogg|wav|m4a)$/i.test(m.attachment_url);
                const isImage = m.attachment_url && /\.(png|jpe?g|gif|webp|avif)$/i.test(m.attachment_url);
                return (
                  <div key={m.id} className={`group flex gap-3 ${grouped ? "mt-0.5" : "mt-4"} ${mine ? "flex-row-reverse" : ""}`}>
                    <div className="w-9 shrink-0 relative">
                      {!grouped && (
                        <>
                          <Avatar className="size-9 ring-2 ring-background">
                            <AvatarImage src={p?.avatar_url ?? undefined} />
                            <AvatarFallback>{initials(p?.display_name)}</AvatarFallback>
                          </Avatar>
                          <span className={`absolute bottom-0 right-0 size-2.5 rounded-full ring-2 ring-background ${online ? "bg-green-500" : "bg-muted-foreground/40"}`} />
                        </>
                      )}
                    </div>
                    <div className={`min-w-0 max-w-[75%] flex flex-col ${mine ? "items-end" : "items-start"}`}>
                      {!grouped && (
                        <div className={`flex items-baseline gap-2 mb-1 ${mine ? "flex-row-reverse" : ""}`}>
                          <span className="font-semibold text-sm">{mine ? "You" : (p?.display_name ?? "User")}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            {" · "}
                            {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      )}
                      <div className="relative">
                        <div
                          className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words leading-relaxed shadow-sm ${
                            mine ? "text-primary-foreground rounded-tr-sm" : "bg-card border rounded-tl-sm"
                          }`}
                          style={mine ? { background: "var(--gradient-brand)" } : undefined}
                        >
                          {isAudio ? (
                            <VoiceNote url={m.attachment_url!} mine={mine} />
                          ) : isImage ? (
                            <a href={m.attachment_url!} target="_blank" rel="noreferrer" className="block">
                              <img src={m.attachment_url!} alt={m.content} className="rounded-lg max-h-72 max-w-full" />
                            </a>
                          ) : m.attachment_url ? (
                            <a href={m.attachment_url} target="_blank" rel="noreferrer" className="underline">📎 {m.content}</a>
                          ) : (
                            m.content
                          )}
                        </div>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              className={`absolute -top-3 ${mine ? "-left-3" : "-right-3"} opacity-0 group-hover:opacity-100 transition-opacity bg-card border rounded-full p-1 shadow-sm hover:bg-accent`}
                              title="React"
                            >
                              <SmilePlus className="size-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-1 flex gap-1" align={mine ? "start" : "end"}>
                            {EMOJIS.map((e) => (
                              <button key={e} onClick={() => toggleReaction(m.id, e)} className="size-8 rounded hover:bg-accent text-lg leading-none">
                                {e}
                              </button>
                            ))}
                          </PopoverContent>
                        </Popover>
                      </div>
                      {Object.keys(grouped_reactions).length > 0 && (
                        <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : ""}`}>
                          {Object.entries(grouped_reactions).map(([emoji, rs]) => {
                            const mineR = rs.some((r) => r.user_id === user.id);
                            return (
                              <button
                                key={emoji}
                                onClick={() => toggleReaction(m.id, emoji)}
                                className={`text-xs rounded-full border px-2 py-0.5 flex items-center gap-1 transition-colors ${
                                  mineR ? "bg-primary/20 border-primary/50" : "bg-card hover:bg-accent"
                                }`}
                              >
                                <span>{emoji}</span>
                                <span className="text-muted-foreground">{rs.length}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-6 h-5 text-xs text-muted-foreground italic">
              {typingNames.length > 0 && (
                <span>
                  {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing
                  <span className="animate-pulse">…</span>
                </span>
              )}
            </div>

            <form onSubmit={sendMessage} className="border-t p-4 flex gap-2 items-center bg-card/50 backdrop-blur">
              {recording ? (
                <RecordingBar seconds={recSeconds} onStop={stopRecording} onCancel={cancelRecording} />
              ) : (
                <>
                  <label>
                    <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { uploadAttachment(f); e.target.value = ""; } }} />
                    <Button asChild type="button" size="icon" variant="ghost" className="rounded-full cursor-pointer" title="Attach file">
                      <span><Paperclip className="size-4" /></span>
                    </Button>
                  </label>
                  <Input
                    placeholder={uploading ? "Uploading…" : `Message #${activeThread.title}`}
                    value={draft}
                    onChange={(e) => { setDraft(e.target.value); broadcastTyping(); }}
                    className="flex-1 rounded-full bg-background"
                  />
                  {draft.trim() ? (
                    <Button type="submit" size="icon" className="rounded-full" style={{ background: "var(--gradient-brand)" }}>
                      <Send className="size-4" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="icon"
                      className="rounded-full text-primary-foreground"
                      style={{ background: "var(--gradient-brand)" }}
                      onClick={startRecording}
                      title="Record voice message"
                    >
                      <Mic className="size-4" />
                    </Button>
                  )}
                </>
              )}
            </form>
          </>
        ) : (
          <div className="flex-1 grid place-items-center text-muted-foreground">
            <div className="text-center">
              <MessageCircle className="size-10 mx-auto mb-3 text-primary" />
              <p>Select or create a thread to start chatting.</p>
            </div>
          </div>
        )}
      </section>
      {inCall && activeThread && (
        <VoiceCall
          threadId={activeThread.id}
          threadTitle={activeThread.title}
          userId={user.id}
          profiles={profiles}
          onLeave={() => setInCall(false)}
        />
      )}
    </div>
  );
}