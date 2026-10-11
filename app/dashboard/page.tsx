import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { readSession, SESSION_COOKIE } from "@/lib/auth";
import { LOGIN_HREF } from "@/lib/site";

export const metadata: Metadata = { title: "Dashboard — Flightpath", robots: { index: false } };

export default async function DashboardPage() {
  const email = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!email) redirect(LOGIN_HREF);

  return (
    <>
      <Navbar />
      <main id="main" className="py-16 md:py-24">
        <div className="container-page">
          <div className="card mx-auto max-w-xl px-5 py-8 text-center sm:px-8 sm:py-10">
            <p className="eyebrow">Signed in</p>
            <h1 className="mt-4 font-serif text-[2.2rem] leading-tight text-ink">You&rsquo;re in.</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2/85">
              Signed in as <span className="font-medium text-ink">{email}</span>. The workspace isn&rsquo;t built yet, so
              this page is a placeholder.
            </p>
            <div className="mt-8">
              <SignOutButton />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
