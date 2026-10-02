import Link from "next/link";
import { site } from "@/config/site";

export function Header() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-lg font-extrabold tracking-tight">
          {site.name}
        </Link>
        <nav className="flex gap-5 text-sm text-muted">
          <Link href="/#how" className="hover:text-ink">How it works</Link>
          <Link href="/#advertise" className="hover:text-ink">Advertise</Link>
        </nav>
      </div>
    </header>
  );
}
