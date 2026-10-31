import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { buttonVariants } from "@/components/ui/button";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <p className="text-5xl font-semibold text-muted-foreground">404</p>
      <p className="text-lg">{t.errors.not_found}</p>
      <Link href="/" className={buttonVariants({ variant: "secondary" })}>
        {t.common.appName}
      </Link>
    </main>
  );
}
