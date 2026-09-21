import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";

const LEGACY_DASHBOARD_PATHS = [
  "/dashboard",
  "/dashboard/admin",
  "/dashboard/settings",
  "/dashboard/activity-logs",
];

// Segments directly under /dashboard that are NOT an office slug. The coarse
// office-routing below must leave these alone (e.g. /dashboard/staff is the
// super admin's approvals screen, /dashboard/messages is the contact inbox,
// not an office).
const NON_OFFICE_DASHBOARD_SEGMENTS = new Set(["staff", "messages"]);

function isPublicPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "/login") return true;
  if (pathname === "/auth" || pathname.startsWith("/auth/")) return true;
  // legacy public routes (kept as redirect stubs to the office picker)
  if (pathname === "/reserve" || pathname === "/display") return true;
  // per-office public routes: /<office>, /<office>/reserve..., /<office>/display...
  if (/^\/[^/]+\/(reserve|display)(\/.*)?$/.test(pathname)) return true;
  if (/^\/[^/]+$/.test(pathname) && !pathname.startsWith("/dashboard")) return true;
  return false;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // If the env vars are not set, skip proxy check. You can remove this
  // once you setup the project.
  if (!hasEnvVars) {
    return supabaseResponse;
  }

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;
  const pathname = request.nextUrl.pathname;

  if (!user && !isPublicPath(pathname)) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // Coarse office routing for signed-in staff. The authoritative check lives in
  // app/dashboard/[office]/layout.tsx (reads the profiles table); this only
  // avoids an obvious wrong-office render using the JWT metadata.
  if (user && pathname.startsWith("/dashboard")) {
    const userSlug =
      (user.user_metadata as { office_slug?: string } | undefined)?.office_slug;

    if (LEGACY_DASHBOARD_PATHS.includes(pathname)) {
      if (userSlug) {
        const sub = pathname === "/dashboard" ? "admin" : pathname.split("/")[2];
        const url = request.nextUrl.clone();
        url.pathname = `/dashboard/${userSlug}/${sub}`;
        return NextResponse.redirect(url);
      }
    } else {
      const requestedOffice = pathname.split("/")[2];
      if (
        userSlug &&
        requestedOffice &&
        !NON_OFFICE_DASHBOARD_SEGMENTS.has(requestedOffice) &&
        requestedOffice !== userSlug
      ) {
        const url = request.nextUrl.clone();
        url.pathname = `/dashboard/${userSlug}/admin`;
        return NextResponse.redirect(url);
      }
    }
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
