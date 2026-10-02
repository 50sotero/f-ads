"use client";

import { useState } from "react";

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
  | { status: "ready"; info: VideoInfo };

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

export function Downloader() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });

  async function lookup(link: string) {
    if (!link.trim()) return;
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: link }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setState({ status: "error", message: data?.error ?? "Something went wrong. Please try again." });
        return;
      }
      setState({ status: "ready", info: data });
    } catch {
      setState({ status: "error", message: "Could not reach the server. Check your connection and try again." });
    }
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      lookup(text);
    } catch {
      // Clipboard permission denied; the user can paste manually.
    }
  }

  const loading = state.status === "loading";

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          lookup(url);
        }}
        className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-2 shadow-sm sm:flex-row"
      >
        <label htmlFor="video-url" className="sr-only">
          Video link
        </label>
        <input
          id="video-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="Paste a video link, e.g. https://x.com/…/status/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="min-w-0 flex-1 rounded-xl bg-transparent px-4 py-3 text-base outline-none placeholder:text-muted"
        />
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
            disabled={loading || !url.trim()}
            className="flex-1 rounded-xl bg-accent px-6 py-3 font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-50 sm:flex-none"
          >
            {loading ? "Looking…" : "Download"}
          </button>
        </div>
      </form>

      <div aria-live="polite" className="mt-4">
        {state.status === "error" && (
          <p className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-danger">{state.message}</p>
        )}
        {state.status === "ready" && <Result info={state.info} />}
      </div>
    </div>
  );
}

function Result({ info }: { info: VideoInfo }) {
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
        <p className="mt-1 text-sm text-muted">
          {[info.uploader, info.site, duration].filter(Boolean).join(" · ")}
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
