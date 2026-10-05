// Joins a picture-only MP4 and a sound-only file into one MP4 in the browser,
// without re-encoding. Sites like Reddit keep the two apart, and a serverless
// function can't stream a remux, so the visitor's browser does it.

/** Fetches a file through our download route, reporting bytes received. */
async function fetchAll(url: string, onBytes: (n: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download failed (HTTP ${res.status})`);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    onBytes(value.length);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out.buffer;
}

export async function mergeAudioVideo(video: ArrayBuffer, audio: ArrayBuffer): Promise<ArrayBuffer> {
  // Loaded on demand so the page itself stays light.
  const mb = await import("mediabunny");
  const videoIn = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BufferSource(video) });
  const audioIn = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BufferSource(audio) });
  const videoTrack = await videoIn.getPrimaryVideoTrack();
  const audioTrack = await audioIn.getPrimaryAudioTrack();
  if (!videoTrack?.codec) throw new Error("no video track");
  if (!audioTrack?.codec) throw new Error("no audio track");

  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
  const videoOut = new mb.EncodedVideoPacketSource(videoTrack.codec);
  const audioOut = new mb.EncodedAudioPacketSource(audioTrack.codec);
  output.addVideoTrack(videoOut, { rotation: await videoTrack.getRotation() });
  output.addAudioTrack(audioOut);
  await output.start();

  const videoMeta = { decoderConfig: (await videoTrack.getDecoderConfig()) ?? undefined };
  const audioMeta = { decoderConfig: (await audioTrack.getDecoderConfig()) ?? undefined };
  const videoPackets = new mb.EncodedPacketSink(videoTrack).packets();
  const audioPackets = new mb.EncodedPacketSink(audioTrack).packets();

  // Feed the two tracks in time order, so the file is interleaved like a normal MP4.
  let v = await videoPackets.next();
  let a = await audioPackets.next();
  let firstVideo = true;
  let firstAudio = true;
  while (!v.done || !a.done) {
    if (!v.done && (a.done || v.value.timestamp <= a.value.timestamp)) {
      await videoOut.add(v.value, firstVideo ? videoMeta : undefined);
      firstVideo = false;
      v = await videoPackets.next();
    } else if (!a.done) {
      await audioOut.add(a.value, firstAudio ? audioMeta : undefined);
      firstAudio = false;
      a = await audioPackets.next();
    }
  }

  await output.finalize();
  return output.target.buffer!;
}

/**
 * Downloads the picture and the sound through /api/download, joins them and
 * saves the result. onProgress gets a 0–1 fraction while files arrive.
 */
export async function downloadMerged(opts: {
  videoUrl: string;
  audioUrl: string;
  filename: string;
  expectedBytes: number | null;
  onProgress: (fraction: number | null) => void;
}) {
  let received = 0;
  const tick = (n: number) => {
    received += n;
    opts.onProgress(opts.expectedBytes ? Math.min(received / opts.expectedBytes, 1) : null);
  };
  const [video, audio] = await Promise.all([fetchAll(opts.videoUrl, tick), fetchAll(opts.audioUrl, tick)]);
  const merged = await mergeAudioVideo(video, audio);

  const href = URL.createObjectURL(new Blob([merged], { type: "video/mp4" }));
  const a = document.createElement("a");
  a.href = href;
  a.download = opts.filename;
  document.body.append(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the save before freeing the memory.
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}
