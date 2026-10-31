import { NextResponse } from "next/server";
import { z } from "zod";
import { LOCALE_COOKIE } from "@/lib/i18n/config";
import { assertSameOrigin } from "@/server/http";

/** Sets the interface-language cookie (manual override of the browser language). */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const { locale } = z.object({ locale: z.enum(["en", "ar"]) }).parse(await req.json());
    const res = NextResponse.json({ ok: true });
    res.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    return res;
  } catch {
    return NextResponse.json({ error: { code: "validation" } }, { status: 400 });
  }
}
