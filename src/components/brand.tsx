import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-semibold tracking-tight" dir="ltr">
      <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-accent text-[13px] font-bold text-accent-foreground">
        CF
      </span>
      <span>
        CareerFit <span className="text-accent">AI</span>
      </span>
    </Link>
  );
}
