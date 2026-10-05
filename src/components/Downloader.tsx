"use client";

import { useState } from "react";
import { downloadMerged } from "@/lib/mergeAv";
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
  /** Set when picture and sound are separate files that the browser joins (Reddit). */
  audio_token?: string;
  filename?: string;
};

type VideoInfo = {
  title: string | null;
  thumbnail: string | null;
  duration: number | null;
  uploader: string | null;
  site: string | null;
  platform: string | null;
  formats: Format[];
};

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; info: VideoInfo; platform: Platform | null; source: string };

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

/** Tells the failure log about something only the browser saw (see /api/report). */
function reportFailure(body: { code: string; platform?: string | null; url?: string; status?: number; detail?: string }) {
  const payload = JSON.stringify(body);
  try {
    if (navigator.sendBeacon?.("/api/report", new Blob([payload], { type: "application/json" }))) return;
  } catch {
    // Fall through to fetch.
  }
  fetch("/api/report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

export function Downloader({ placeholder = "Paste a link from X, TikTok, Instagram…" }: { placeholder?: string }) {
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
        body: JSON.stringify({ url: target, platform: found?.id ?? null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        // The server logs its own failures; no JSON means it never got to (e.g. a timeout).
        if (!data) {
          reportFailure({
            code: res.status === 504 ? "timeout" : "bad_response",
            platform: found?.id,
            url: target,
            status: res.status,
          });
        }
        setState({ status: "error", message: data?.error ?? "Something went wrong. Please try again." });
        return;
      }
      setState({ status: "ready", info: data, platform: found, source: target });
    } catch (err) {
      reportFailure({ code: "network", platform: found?.id, url: target, detail: String(err) });
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
            placeholder={placeholder}
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
        {state.status === "ready" && (
          <Result key={state.source} info={state.info} platform={state.platform} source={state.source} />
        )}
      </div>
    </div>
  );
}

function Result({ info, platform, source }: { info: VideoInfo; platform: Platform | null; source: string }) {
  const duration = formatDuration(info.duration);
  const [picked, setPicked] = useState<string | null>(null);
  const [reported, setReported] = useState(false);
  // Progress of a picture + sound download being joined in the browser.
  const [merging, setMerging] = useState<{ token: string; fraction: number | null } | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);

  async function saveMerged(f: Format) {
    if (merging) return;
    setMergeError(null);
    setMerging({ token: f.token, fraction: 0 });
    try {
      await downloadMerged({
        videoUrl: `/api/download?t=${encodeURIComponent(f.token)}`,
        audioUrl: `/api/download?t=${encodeURIComponent(f.audio_token!)}`,
        filename: f.filename ?? "video.mp4",
        expectedBytes: f.filesize,
        onProgress: (fraction) => setMerging({ token: f.token, fraction }),
      });
    } catch (err) {
      reportFailure({ code: "merge_failed", platform: platform?.id ?? info.platform, url: source, detail: String(err) });
      setMergeError("Couldn't put the video and its sound together. Try another quality, or paste the link again.");
    } finally {
      setMerging(null);
    }
  }

  const buttonClass = (f: Format) =>
    f.kind === "video"
      ? "inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-60"
      : "inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-semibold transition hover:border-muted";

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
                {f.audio_token ? (
                  <button
                    type="button"
                    disabled={merging !== null}
                    onClick={() => {
                      setPicked(`${f.label} ${f.ext.toUpperCase()} (joined)`);
                      saveMerged(f);
                    }}
                    className={buttonClass(f)}
                  >
                    {f.label} {f.ext.toUpperCase()}
                    {merging?.token === f.token ? (
                      <span className="font-normal opacity-70">
                        {merging.fraction !== null && merging.fraction < 1
                          ? `${Math.round(merging.fraction * 100)}%`
                          : "Preparing…"}
                      </span>
                    ) : (
                      size && <span className="font-normal opacity-70">{size}</span>
                    )}
                  </button>
                ) : (
                  <a
                    href={`/api/download?t=${encodeURIComponent(f.token)}`}
                    download
                    onClick={() => setPicked(`${f.label} ${f.ext.toUpperCase()}`)}
                    className={buttonClass(f)}
                  >
                    {f.label} {f.ext.toUpperCase()}
                    {size && <span className="font-normal opacity-70">{size}</span>}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
        {mergeError && <p className="mt-3 text-sm text-danger">{mergeError}</p>}
        <p className="mt-3 text-xs text-muted">
          {reported ? (
            "Thanks, we'll look into it."
          ) : (
            <button
              type="button"
              className="underline underline-offset-2 hover:text-ink"
              onClick={() => {
                reportFailure({
                  code: "user_report",
                  platform: platform?.id ?? info.platform,
                  url: source,
                  detail: picked ? `picked ${picked}` : "before picking a format",
                });
                setReported(true);
              }}
            >
              Didn&apos;t work? Let us know
            </button>
          )}
        </p>
      </div>
    </div>
  );
}
