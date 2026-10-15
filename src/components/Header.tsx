import Link from "next/link";
import { site } from "@/config/site";

export function Header() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="text-lg font-extrabold tracking-tight">
          {site.name}
        </Link>
        <div className="flex items-center gap-5 text-sm">
          {/* The same switcher sits in Panframe's header, so the two tools read as one site. */}
          <nav aria-label="Tools" className="flex rounded-full border border-line p-0.5">
            <Link href="/" aria-current="true" className="rounded-full bg-surface px-3 py-1 font-medium text-ink">
              Videos
            </Link>
            {/* Panframe is its own app behind a rewrite, so the browser has to load it; <Link> would 404. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/recipe" className="rounded-full px-3 py-1 text-muted transition hover:text-ink">
              Recipes
            </a>
          </nav>
          <nav className="hidden gap-5 text-muted sm:flex">
            <Link href="/#how" className="hover:text-ink">How it works</Link>
            <Link href="/#advertise" className="hover:text-ink">Advertise</Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
