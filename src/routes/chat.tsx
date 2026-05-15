import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { LogOut, Plus, Send, MessageCircle, Hash, Users, Search, UserCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/chat")({ component: ChatPage, ssr: false });

type Thread = { id: string; title: string; created_by: string; last_message_at: string };
type Message = { id: string; thread_id: string; user_id: string; content: string; created_at: string };
type Profile = { id: string; display_name: string | null; avatar_url: string | null };

function ChatPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [draft, setDraft] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  // Load threads + profiles
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: t } = await supabase.from("threads").select("*").order("last_message_at", { ascending: false });
      setThreads(t ?? []);
      if (t && t.length && !activeId) setActiveId(t[0].id);
      const { data: p } = await supabase.from("profiles").select("*");
      setProfiles(Object.fromEntries((p ?? []).map((x) => [x.id, x])));
    })();

    const ch = supabase
      .channel("threads-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "threads" }, async () => {
        const { data: t } = await supabase.from("threads").select("*").order("last_message_at", { ascending: false });
        setThreads(t ?? []);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  // Load messages for active thread + subscribe
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    (async () => {
      const { data } = await supabase.from("messages").select("*").eq("thread_id", activeId).order("created_at");
      setMessages(data ?? []);
    })();
    const ch = supabase
      .channel(`messages-${activeId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `thread_id=eq.${activeId}` },
        async (payload) => {
          const m = payload.new as Message;
          setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
          if (!profiles[m.user_id]) {
            const { data } = await supabase.from("profiles").select("*").eq("id", m.user_id).single();
            if (data) setProfiles((p) => ({ ...p, [data.id]: data }));
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const activeThread = useMemo(() => threads.find((t) => t.id === activeId), [threads, activeId]);

  const createThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTitle.trim()) return;
    const { data, error } = await supabase.from("threads").insert({ title: newTitle.trim(), created_by: user.id }).select().single();
    if (error) return toast.error(error.message);
    setNewTitle("");
    setOpenNew(false);
    setActiveId(data.id);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeId || !draft.trim()) return;
    const content = draft.trim();
    setDraft("");
    const { error } = await supabase.from("messages").insert({ thread_id: activeId, user_id: user.id, content });
    if (error) toast.error(error.message);
  };

  const me = user ? profiles[user.id] : undefined;
  const initials = (name?: string | null) => (name ?? "?").trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();

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
                <DialogFooter>
                  <Button type="submit">Create</Button>
                </DialogFooter>
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
          <Avatar className="size-8">
            <AvatarImage src={me?.avatar_url ?? undefined} />
            <AvatarFallback>{initials(me?.display_name ?? user.email)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{me?.display_name ?? user.email}</div>
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
                return (
                  <div key={m.id} className={`flex gap-3 ${grouped ? "mt-0.5" : "mt-4"} ${mine ? "flex-row-reverse" : ""}`}>
                    <div className="w-9 shrink-0">
                      {!grouped && (
                        <Avatar className="size-9 ring-2 ring-background" style={mine ? { boxShadow: "var(--shadow-soft)" } : undefined}>
                          <AvatarImage src={p?.avatar_url ?? undefined} />
                          <AvatarFallback>{initials(p?.display_name)}</AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                    <div className={`min-w-0 max-w-[75%] flex flex-col ${mine ? "items-end" : "items-start"}`}>
                      {!grouped && (
                        <div className={`flex items-baseline gap-2 mb-1 ${mine ? "flex-row-reverse" : ""}`}>
                          <span className="font-semibold text-sm">
                            {mine ? "You" : (p?.display_name ?? "User")}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      )}
                      <div
                        className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words leading-relaxed shadow-sm ${
                          mine
                            ? "text-primary-foreground rounded-tr-sm"
                            : "bg-card border rounded-tl-sm"
                        }`}
                        style={mine ? { background: "var(--gradient-brand)" } : undefined}
                      >
                        {m.content}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={sendMessage} className="border-t p-4 flex gap-2 bg-card/50 backdrop-blur">
              <Input
                placeholder={`Message #${activeThread.title}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="flex-1 rounded-full bg-background"
              />
              <Button type="submit" disabled={!draft.trim()} size="icon" className="rounded-full" style={{ background: "var(--gradient-brand)" }}><Send className="size-4" /></Button>
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
    </div>
  );
}