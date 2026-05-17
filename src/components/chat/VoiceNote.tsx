import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

// Deterministic pseudo-waveform from url so bars feel stable per message
function bars(seed: string, n = 38) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h = (h * 1664525 + 1013904223) >>> 0;
    const v = (h % 100) / 100;
    // bell curve-ish so middle bars are taller
    const bell = 1 - Math.abs(i - n / 2) / (n / 2);
    out.push(0.25 + v * 0.75 * (0.5 + bell * 0.6));
  }
  return out;
}

export function VoiceNote({ url, mine }: { url: string; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0); // 0..1
  const [rate, setRate] = useState(1);
  const peaks = useMemo(() => bars(url), [url]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onMeta = () => setDuration(a.duration || 0);
    const onTime = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
    const onEnd = () => { setPlaying(false); setProgress(0); };
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * duration;
    setProgress(ratio);
  };

  const cycleRate = () => {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const playedIdx = Math.floor(progress * peaks.length);

  return (
    <div className={`flex items-center gap-3 min-w-[240px] py-1 ${mine ? "text-primary-foreground" : "text-foreground"}`}>
      <audio ref={audioRef} src={url} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={toggle}
        className={`size-10 rounded-full grid place-items-center shrink-0 transition-transform active:scale-95 ${
          mine ? "bg-white/20 hover:bg-white/30" : "bg-primary/15 hover:bg-primary/25 text-primary"
        }`}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0">
        <div
          onClick={seek}
          className="relative h-9 flex items-center gap-[2px] cursor-pointer select-none"
        >
          {peaks.map((p, i) => {
            const played = i <= playedIdx;
            return (
              <span
                key={i}
                className={`w-[2.5px] rounded-full transition-opacity ${
                  mine
                    ? played ? "bg-white" : "bg-white/40"
                    : played ? "bg-primary" : "bg-foreground/25"
                }`}
                style={{ height: `${Math.max(10, p * 100)}%` }}
              />
            );
          })}
        </div>
        <div className={`flex items-center justify-between mt-0.5 text-[10px] tabular-nums ${mine ? "text-white/75" : "text-muted-foreground"}`}>
          <span>{fmt(progress * duration)}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); cycleRate(); }}
            className={`px-1.5 py-px rounded-full text-[10px] font-semibold ${
              mine ? "bg-white/20 hover:bg-white/30" : "bg-foreground/10 hover:bg-foreground/20"
            }`}
          >
            {rate}×
          </button>
          <span>{fmt(duration)}</span>
        </div>
      </div>
    </div>
  );
}

export function RecordingBar({
  seconds, onStop, onCancel,
}: { seconds: number; onStop: () => void; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-3 flex-1 px-3 py-2 rounded-full bg-destructive/10 border border-destructive/30">
      <span className="relative flex size-3">
        <span className="absolute inset-0 rounded-full bg-destructive animate-ping opacity-75" />
        <span className="relative inline-flex rounded-full size-3 bg-destructive" />
      </span>
      <span className="text-xs font-medium text-destructive tabular-nums">{fmt(seconds)}</span>
      <div className="flex-1 flex items-center gap-[2px] h-6 overflow-hidden">
        {Array.from({ length: 28 }).map((_, i) => (
          <span
            key={i}
            className="w-[2.5px] rounded-full bg-destructive/70"
            style={{
              height: `${30 + ((Math.sin((Date.now() / 120) + i) + 1) * 35)}%`,
              animation: `pulse 1.2s ${i * 0.05}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>
      <button type="button" onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
      <button type="button" onClick={onStop} className="text-xs font-semibold text-primary">Send</button>
    </div>
  );
}