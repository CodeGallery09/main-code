import type { ReactNode } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export function AuthPage({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <>
      <Navbar />
      <main id="main">
        <section id="top" aria-labelledby="auth-title" className="relative overflow-hidden py-16 md:py-24">
          <div className="dot-grid pointer-events-none absolute inset-x-0 top-0 h-[420px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
          <div className="container-page relative">
            <div className="card mx-auto max-w-md px-5 py-8 sm:px-8 sm:py-10">
              <h1 id="auth-title" className="font-serif text-[2.2rem] leading-tight text-ink">
                {title}
              </h1>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2/85">{subtitle}</p>
              <div className="mt-7 border-t border-line pt-7">{children}</div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
