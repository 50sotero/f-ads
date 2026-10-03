import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, adminConfigured, cookieIsValid } from "@/lib/adminAuth";
import { readReport, type FailureEvent, type Report } from "@/lib/telemetry";
import { signIn, signOut } from "./actions";

export const metadata: Metadata = {
  title: "Failure log",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const PERIODS = [1, 7, 30];

const CODE_LABELS: Record<string, string> = {
  ok: "Worked",
  not_found: "yt-dlp found no video",
  login_required: "Private or needs login",
  no_direct_formats: "Only stream formats (HLS/DASH)",
  share_link_failed: "Share link didn't resolve",
  internal_error: "Server crash",
  fetch_failed: "Video host didn't answer",
  upstream_error: "Video host refused the file",
  stream_failed: "Download stopped halfway",
  timeout: "Lookup timed out",
  network: "Browser lost connection",
  bad_response: "Server sent a broken answer",
  user_report: "User pressed \"Didn't work?\"",
  unsupported_site: "Site not supported",
  coming_soon: "Coming soon",
  bot_check: "YouTube bot check",
  expired: "Download link expired",
  bad_url: "Bad download link",
  invalid_url: "Not a link",
  empty: "Empty box",
  too_long: "Link too long",
  bad_request: "Malformed request",
};

function pct(part: number, total: number) {
  return total ? `${((part / total) * 100).toFixed(1)}%` : "–";
}

export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  if (!adminConfigured()) {
    return (
      <Shell>
        <p className="text-muted">
          Add an <code>ADMIN_TOKEN</code> environment variable in Vercel (any long random string) and redeploy to turn
          this page on.
        </p>
      </Shell>
    );
  }

  if (!cookieIsValid((await cookies()).get(ADMIN_COOKIE)?.value)) {
    return (
      <Shell>
        <form action={signIn} className="flex max-w-sm flex-col gap-3">
          <label htmlFor="token" className="text-sm text-muted">
            Admin token
          </label>
          <input
            id="token"
            name="token"
            type="password"
            autoComplete="current-password"
            required
            className="rounded-lg border border-line bg-surface px-3 py-2"
          />
          {params.error === "1" && <p className="text-sm text-danger">That token is not right.</p>}
          <button type="submit" className="rounded-lg bg-ink px-4 py-2 font-semibold text-bg">
            Sign in
          </button>
        </form>
      </Shell>
    );
  }

  const days = PERIODS.includes(Number(params.days)) ? Number(params.days) : 7;
  let report: Report;
  try {
    report = await readReport(days);
  } catch (err) {
    return (
      <Shell days={days}>
        <p className="text-danger">Could not read the failure store: {String(err)}</p>
      </Shell>
    );
  }

  if (!report.configured) {
    return (
      <Shell days={days}>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="font-semibold">No failure store connected yet</p>
          <p className="mt-1 text-muted">
            In Vercel, open the project, go to Storage, create an <strong>Upstash for Redis</strong> database (the free
            plan is enough), connect it to this project, then redeploy. Until then, failures only show up in the
            function logs.
          </p>
        </div>
      </Shell>
    );
  }

  const totals = report.platforms.reduce(
    (t, p) => ({
      lookups: t.lookups + p.lookups,
      lookupFailures: t.lookupFailures + p.lookupFailures,
      downloads: t.downloads + p.downloads,
      downloadFailures: t.downloadFailures + p.downloadFailures,
      browserFailures: t.browserFailures + p.browserFailures,
      userReports: t.userReports + p.userReports,
    }),
    { lookups: 0, lookupFailures: 0, downloads: 0, downloadFailures: 0, browserFailures: 0, userReports: 0 },
  );

  return (
    <Shell days={days}>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Lookups" value={totals.lookups.toLocaleString("en-US")} />
        <Tile label="Lookups failed" value={pct(totals.lookupFailures, totals.lookups)} />
        <Tile label="Downloads" value={totals.downloads.toLocaleString("en-US")} />
        <Tile label="Downloads failed" value={pct(totals.downloadFailures, totals.downloads)} />
        <Tile label="Browser-side failures" value={totals.browserFailures.toLocaleString("en-US")} />
        <Tile label={'"Didn\'t work?" reports'} value={totals.userReports.toLocaleString("en-US")} />
      </dl>

      <Section title="By site">
        <Table
          head={["Site", "Lookups", "Failed", "Downloads", "Failed", "Browser", "Reports", "Other"]}
          rows={report.platforms.map((p) => [
            p.platform,
            p.lookups,
            `${p.lookupFailures} (${pct(p.lookupFailures, p.lookups)})`,
            p.downloads,
            `${p.downloadFailures} (${pct(p.downloadFailures, p.downloads)})`,
            p.browserFailures,
            p.userReports,
            p.other,
          ])}
          empty="Nothing recorded in this period."
        />
      </Section>

      <Section title="Why things fail">
        <Table
          head={["Stage", "Reason", "Count"]}
          rows={report.reasons.map((r) => [
            r.stage,
            <span key="r" className={r.failure ? "" : "text-muted"}>
              {CODE_LABELS[r.code] ?? r.code} <code className="text-xs text-muted">{r.code}</code>
            </span>,
            r.count,
          ])}
          empty="No failures in this period."
        />
      </Section>

      <Section title="Sites people asked for that we don't support">
        {report.demand.length ? (
          <ul className="flex flex-wrap gap-2">
            {report.demand.slice(0, 30).map((d) => (
              <li key={d.host} className="rounded-full border border-line px-3 py-1 text-sm">
                {d.host} <span className="text-muted">×{d.count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">None yet.</p>
        )}
      </Section>

      <Section title={`Recent failures (${report.failures.length})`}>
        {report.failures.length ? (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {report.failures.slice(0, 100).map((f, i) => (
              <FailureRow key={`${f.t}-${i}`} failure={f} />
            ))}
          </ul>
        ) : (
          <p className="text-muted">No failures stored in this period.</p>
        )}
      </Section>

      <p className="mt-10 text-sm text-muted">
        To fix things, download the{" "}
        <a href={`/api/admin/failures?days=${days}`} className="underline">
          JSON export
        </a>{" "}
        and hand it to Claude with the repo. Each failure has the cleaned link, the error, the site and the build it
        happened on.
      </p>
    </Shell>
  );
}

function Shell({ days, children }: { days?: number; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Failure log</h1>
        {days && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {PERIODS.map((d) => (
              <Link
                key={d}
                href={`/admin?days=${d}`}
                className={`rounded-full border px-3 py-1 ${d === days ? "border-ink bg-ink text-bg" : "border-line"}`}
              >
                {d === 1 ? "Today" : `${d} days`}
              </Link>
            ))}
            <a href={`/api/admin/failures?days=${days}`} className="rounded-full border border-line px-3 py-1">
              Export JSON
            </a>
            <form action={signOut}>
              <button type="submit" className="px-2 py-1 text-muted hover:text-ink">
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-semibold">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-4 py-2 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2 whitespace-nowrap tabular-nums">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FailureRow({ failure: f }: { failure: FailureEvent }) {
  return (
    <li className="p-4 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold">{CODE_LABELS[f.code] ?? f.code}</span>
        <span className="text-muted">
          {f.platform} · {f.stage} · {f.t.replace("T", " ").replace("Z", " UTC")}
        </span>
        <span className="text-xs text-muted">
          build {f.build}
          {f.version ? ` · yt-dlp ${f.version}` : ""}
          {f.region ? ` · ${f.region}` : ""}
        </span>
      </div>
      {f.url && (
        <a href={f.url} target="_blank" rel="noreferrer noopener" className="mt-1 block truncate text-accent underline">
          {f.url}
        </a>
      )}
      {f.detail && (
        <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-bg p-2 text-xs whitespace-pre-wrap text-muted">
          {f.detail}
        </pre>
      )}
    </li>
  );
}
