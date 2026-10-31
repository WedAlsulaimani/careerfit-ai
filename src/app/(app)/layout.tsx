import { requireUser } from "@/server/auth";
import { AppShell } from "@/components/app-shell";

/** Every page in this group is server-side authorised (the proxy redirect is only a UX shortcut). */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return <AppShell email={user.email}>{children}</AppShell>;
}
