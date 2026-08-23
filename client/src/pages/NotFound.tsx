/**
 * Clinical Cascade Field fallback page: a compact, dark route escape without template UI dependencies.
 */
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <main className="min-h-screen grid place-items-center bg-[#050506] px-5 text-[#f0f0f2]">
      <section className="w-full max-w-md border border-[#34343a] bg-[#111113] p-8 text-center shadow-2xl shadow-black/50">
        <AlertCircle className="mx-auto mb-5 h-12 w-12 text-[#f87171]" />
        <p className="mb-2 font-mono text-[10px] tracking-[.14em] text-[#8e8e96]">ROUTE NOT FOUND</p>
        <h1 className="text-3xl font-semibold tracking-[-.05em]">Page unavailable</h1>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-[#a1a1aa]">This route is not part of the active infrastructure simulation.</p>
        <button type="button" onClick={() => setLocation("/")} className="mt-7 inline-flex items-center gap-2 border border-[#52525b] bg-[#1b1b1e] px-4 py-2.5 font-mono text-xs text-[#e4e4e7] transition-colors hover:bg-[#29292d] active:scale-[.98]"><Home size={15} /> Return to field</button>
      </section>
    </main>
  );
}
