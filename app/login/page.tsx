import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowRight, Bot, ShieldCheck, UserRound } from "lucide-react";
import { getUser } from "@/lib/session";

async function signIn(formData: FormData) {
  "use server";
  const role = String(formData.get("role") ?? "sales");
  if (role !== "sales" && role !== "admin") redirect("/login");
  const jar = await cookies();
  jar.set("lw_user", role, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8 });
  redirect("/today");
}

export default async function LoginPage() {
  const user = await getUser();
  if (user) redirect("/today");

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="relative flex flex-1 flex-col justify-between overflow-hidden border-b border-ink-700 bg-ink-900 p-8 lg:border-b-0 lg:border-r lg:p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-lime-400/10 blur-3xl" />
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-lime-400 text-sm font-bold text-ink-950">
              L
            </div>
            <div>
              <div className="text-sm font-semibold text-ink-100">Ledgerwise</div>
              <div className="text-[10px] uppercase tracking-wide text-ink-400">Outbound agent</div>
            </div>
          </div>
          <h1 className="mt-12 max-w-lg text-3xl font-semibold leading-tight tracking-tight text-ink-100 lg:text-4xl">
            Five agents. One human gate. No invented facts.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-300">
            Research finds the company, qualification scores it against a code-owned rubric, comms writes
            and replies. Every outbound message passes a guard layer before a person can send it.
          </p>
        </div>

        <div className="mt-12 grid max-w-lg gap-3 sm:grid-cols-3">
          {[
            { icon: Bot, title: "Agent does the work", body: "Research, score, write, reply, book." },
            { icon: ShieldCheck, title: "Rules in code", body: "No price. No unsourced claim. Opt-outs stick." },
            { icon: UserRound, title: "Human in control", body: "Approve, edit, take over any thread." },
          ].map((f) => (
            <div key={f.title} className="rounded-lg border border-ink-700 bg-ink-850/60 p-3">
              <f.icon size={15} className="text-lime-400" />
              <div className="mt-2 text-[12px] font-medium text-ink-200">{f.title}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-ink-400">{f.body}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex w-full flex-col justify-center p-8 lg:w-[440px] lg:p-10">
        <div className="text-[11px] uppercase tracking-wider text-ink-400">Demo sign in</div>
        <h2 className="mt-1 text-lg font-medium text-ink-100">Choose a seat</h2>
        <p className="mt-1 text-xs text-ink-400">
          Two roles, one workspace. Admin unlocks the prompt studio.
        </p>

        <div className="mt-6 space-y-3">
          <form action={signIn}>
            <input type="hidden" name="role" value="sales" />
            <button className="group flex w-full items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 p-4 text-left transition hover:border-lime-400/40 hover:bg-ink-800">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-800 text-ink-200">
                <UserRound size={16} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-ink-100">Maya · Sales</div>
                <div className="text-[11px] text-ink-400">Review emails, answer threads, book calls</div>
              </div>
              <ArrowRight size={15} className="text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-lime-400" />
            </button>
          </form>

          <form action={signIn}>
            <input type="hidden" name="role" value="admin" />
            <button className="group flex w-full items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 p-4 text-left transition hover:border-lime-400/40 hover:bg-ink-800">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-800 text-ink-200">
                <ShieldCheck size={16} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-ink-100">Sam · Admin</div>
                <div className="text-[11px] text-ink-400">Tune prompts, rules, tools, kill switch</div>
              </div>
              <ArrowRight size={15} className="text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-lime-400" />
            </button>
          </form>
        </div>

        <p className="mt-6 text-[11px] leading-relaxed text-ink-400">
          No credentials required. Data is seeded on first boot. Outbound email is simulated unless a Resend
          key is configured.
        </p>
      </div>
    </div>
  );
}
