"use client";

import { useState } from "react";
import { detect, normalizeUrl, type Platform } from "@/lib/platforms";
import { PlatformIcon } from "./PlatformIcon";
import { PlatformStrip } from "./PlatformStrip";

type Format = {
  kind: "video" | "audio";
  label: string;
  ext: string;
  height: number | null;
  filesize: number | null;
  token: string;
};

type VideoInfo = {
  title: string | null;
  thumbnail: string | null;
  duration: number | null;
  uploader: string | null;
  site: string | null;
  formats: Format[];
};

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; info: VideoInfo; platform: Platform | null };

function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function formatSize(bytes: number | null) {
  if (!bytes) return null;
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function comingSoon(platform: Platform) {
  return `${platform.name} support is coming soon.`;
}

export function Downloader() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });

  const link = normalizeUrl(url);
  const platform = detect(link);
  const loading = state.status === "loading";
  const blocked = platform?.status === "soon";

  async function lookup(target: string) {
    const found = detect(target);
    if (found?.status === "soon") {
      setState({ status: "error", message: comingSoon(found) });
      return;
    }
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setState({ status: "error", message: data?.error ?? "Something went wrong. Please try again." });
        return;
      }
      setState({ status: "ready", info: data, platform: found });
    } catch {
      setState({ status: "error", message: "Could not reach the server. Check your connection and try again." });
    }
  }

  // A pasted link from a known site starts right away; anything else waits for the button.
  function takePastedText(text: string) {
    const pasted = normalizeUrl(text);
    if (!pasted) return false;
    setUrl(pasted);
    if (detect(pasted)?.status === "supported") lookup(pasted);
    else setState({ status: "idle" });
    return true;
  }

  async function pasteFromClipboard() {
    try {
      takePastedText(await navigator.clipboard.readText());
    } catch {
      // Clipboard permission denied; the user can paste manually.
    }
  }

  let hint: string | null = null;
  if (state.status === "idle" && url.trim()) {
    if (platform?.status === "soon") hint = comingSoon(platform);
    else if (platform) hint = `${platform.name} link detected`;
    else if (link) hint = "We don't recognize this site, but we'll try it.";
    else if (url.trim().length > 3) hint = "Paste the full link to the post.";
  }

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (link) lookup(link);
        }}
        className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-2 shadow-sm sm:flex-row"
      >
        <div className="flex min-w-0 flex-1 items-center">
          <span
            key={platform?.id ?? "none"}
            className={`ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${
              platform ? "motion-safe:animate-[pop_200ms_ease-out]" : "text-muted"
            }`}
          >
            <PlatformIcon id={platform?.id ?? null} className="h-5 w-5" />
          </span>
          <label htmlFor="video-url" className="sr-only">
            Video link
          </label>
          <input
            id="video-url"
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Paste a link from X, TikTok, Instagram…"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (state.status === "ready" || state.status === "error") setState({ status: "idle" });
            }}
            onPaste={(e) => {
              if (takePastedText(e.clipboardData.getData("text"))) e.preventDefault();
            }}
            className="min-w-0 flex-1 rounded-xl bg-transparent px-2 py-3 text-base outline-none placeholder:text-muted"
          />
        </div>
        <div className="flex gap-2">
          {!url && (
            <button
              type="button"
              onClick={pasteFromClipboard}
              className="rounded-xl border border-line px-4 py-3 font-medium text-muted transition hover:text-ink"
            >
              Paste
            </button>
          )}
          <button
            type="submit"
            disabled={loading || !link || blocked}
            className="flex-1 rounded-xl bg-accent px-6 py-3 font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-50 sm:flex-none"
          >
            {loading ? "Looking…" : "Download"}
          </button>
        </div>
      </form>

      <div className="mt-4">
        <PlatformStrip active={platform} />
      </div>

      <div aria-live="polite" className="mt-4">
        {hint && (
          <p className={`text-center text-sm ${blocked ? "font-medium text-danger" : "text-muted"}`}>{hint}</p>
        )}
        {state.status === "error" && (
          <p className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-danger">{state.message}</p>
        )}
        {state.status === "ready" && <Result info={state.info} platform={state.platform} />}
      </div>
    </div>
  );
}

function Result({ info, platform }: { info: VideoInfo; platform: Platform | null }) {
  const duration = formatDuration(info.duration);
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:flex-row">
      {info.thumbnail && (
        // Thumbnails come from many CDNs; a plain img avoids proxying them.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={info.thumbnail}
          alt=""
          referrerPolicy="no-referrer"
          className="aspect-video w-full rounded-xl bg-line object-cover sm:w-56"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-semibold">{info.title || "Video"}</p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          {platform && <PlatformIcon id={platform.id} className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">
            {[platform?.name ?? info.site, info.uploader, duration].filter(Boolean).join(" · ")}
          </span>
        </p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {info.formats.map((f) => {
            const size = formatSize(f.filesize);
            return (
              <li key={f.token}>
                <a
                  href={`/api/download?t=${encodeURIComponent(f.token)}`}
                  download
                  className={
                    f.kind === "video"
                      ? "inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-90"
                      : "inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-semibold transition hover:border-muted"
                  }
                >
                  {f.label} {f.ext.toUpperCase()}
                  {size && <span className="font-normal opacity-70">{size}</span>}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
