import { createFileRoute } from "@tanstack/react-router";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { MessageCircle, Sparkles, Users } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/chat" });
  }, [user, loading, navigate]);

  return (
    <main className="min-h-screen bg-background relative overflow-hidden">
      <div
        className="absolute inset-0 -z-10 opacity-40"
        style={{ background: "var(--gradient-brand)", filter: "blur(120px)" }}
        aria-hidden
      />
      <header className="container mx-auto flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 font-semibold text-lg">
          <div className="size-8 rounded-lg grid place-items-center text-primary-foreground" style={{ background: "var(--gradient-brand)" }}>
            <MessageCircle className="size-4" />
          </div>
          Connect
        </div>
        <Button asChild variant="ghost">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <section className="container mx-auto px-6 pt-16 pb-24 text-center max-w-3xl">
        <span className="inline-flex items-center gap-2 rounded-full bg-accent/60 text-accent-foreground px-3 py-1 text-xs font-medium mb-6">
          <Sparkles className="size-3" /> Real-time conversations
        </span>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-foreground">
          Start a thread.<br />
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-brand)" }}>
            Connect instantly.
          </span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground">
          A clean, thread-based chat experience. Create topics, invite the room, and keep every conversation in its place.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Button asChild size="lg" className="shadow-lg" style={{ boxShadow: "var(--shadow-soft)" }}>
            <Link to="/auth">Get started — it's free</Link>
          </Button>
        </div>

        <div className="mt-20 grid sm:grid-cols-3 gap-4 text-left">
          {[
            { icon: MessageCircle, title: "Threaded chats", body: "Each topic gets its own focused space." },
            { icon: Users, title: "Built for groups", body: "Anyone signed in can join the conversation." },
            { icon: Sparkles, title: "Real-time", body: "Messages appear the moment they're sent." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border bg-card/70 backdrop-blur p-5">
              <f.icon className="size-5 text-primary mb-3" />
              <div className="font-semibold">{f.title}</div>
              <p className="text-sm text-muted-foreground mt-1">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
