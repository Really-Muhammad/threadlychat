import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { applyTheme } from "@/lib/themes";

export function ThemeProvider() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      applyTheme("default");
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("theme")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      applyTheme(data?.theme ?? "default");
    })();

    const ch = supabase
      .channel(`profile-theme-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        (payload) => {
          const next = (payload.new as { theme?: string })?.theme;
          if (next) applyTheme(next);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [user]);

  return null;
}