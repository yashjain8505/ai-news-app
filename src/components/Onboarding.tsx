"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QuizArticle } from "@/lib/types";
import { completeOnboarding } from "@/app/actions";

const ROUNDS = 3;
const PER = 5;

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function host(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

type Pick = {
  chosenId: string;
  shownIds: string[];
  chosenTags: string[];
  otherTags: string[][];
};

export default function Onboarding({ articles }: { articles: QuizArticle[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0); // 0 = details, 1..ROUNDS = quiz
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [picks, setPicks] = useState<Pick[]>([]);

  const rounds = useMemo(() => {
    const pool = shuffle(articles).slice(0, ROUNDS * PER);
    const out: QuizArticle[][] = [];
    for (let i = 0; i < ROUNDS; i++) out.push(pool.slice(i * PER, i * PER + PER));
    return out;
  }, [articles]);

  const emailOk = /\S+@\S+\.\S+/.test(email);

  function choose(chosen: QuizArticle) {
    const round = rounds[step - 1];
    const others = round.filter((a) => a.id !== chosen.id);
    const pick: Pick = {
      chosenId: chosen.id,
      shownIds: round.map((a) => a.id),
      chosenTags: chosen.tags ?? [],
      otherTags: others.map((a) => a.tags ?? []),
    };
    const next = [...picks, pick];
    setPicks(next);
    if (step >= ROUNDS) {
      startTransition(async () => {
        await completeOnboarding({ name, email, rounds: next });
        router.push("/");
        router.refresh();
      });
    } else {
      setStep(step + 1);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4px)] max-w-2xl flex-col px-5 py-10 sm:py-16">
      <div className="mb-8 flex items-center gap-2.5">
        <span className="inline-block h-3.5 w-3.5 rounded-sm bg-[#cdff3a]" />
        <span className="text-xl font-extrabold tracking-tight text-white">
          Signal
        </span>
      </div>

      {step === 0 ? (
        <div className="my-auto">
          <h1 className="text-3xl font-extrabold leading-tight text-white sm:text-4xl">
            Let us learn what you love to read.
          </h1>
          <p className="serif mt-3 text-lg text-neutral-400">
            A few taps and your feed of AI news, tools, and ideas tunes itself to
            your taste.
          </p>
          <div className="mt-8 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-300">
                Your name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full rounded-xl border border-neutral-700 bg-[#141416] px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-[#cdff3a]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-300">
                Email
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="jane@email.com"
                className="w-full rounded-xl border border-neutral-700 bg-[#141416] px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-[#cdff3a]"
              />
            </div>
          </div>
          <button
            disabled={!name.trim() || !emailOk}
            onClick={() => setStep(1)}
            className="mt-7 w-full rounded-xl bg-[#cdff3a] px-5 py-3.5 font-bold text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            Start
          </button>
        </div>
      ) : (
        <div className="my-auto">
          <div className="mb-6 flex items-center gap-2">
            {Array.from({ length: ROUNDS }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  i < step ? "bg-[#cdff3a]" : "bg-neutral-800"
                }`}
              />
            ))}
          </div>
          <p className="text-sm font-medium text-[#cdff3a]">
            Question {step} of {ROUNDS}
          </p>
          <h2 className="mt-1 text-2xl font-extrabold text-white sm:text-3xl">
            Which would you read first?
          </h2>

          <ul className="mt-6 space-y-3">
            {rounds[step - 1].map((a) => (
              <li key={a.id}>
                <button
                  disabled={pending}
                  onClick={() => choose(a)}
                  className="group flex w-full items-center gap-4 rounded-2xl border border-neutral-800 bg-[#141416] p-3 text-left transition-colors hover:border-[#cdff3a] disabled:opacity-50"
                >
                  {a.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.image_url}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                      className="h-16 w-24 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <span className="min-w-0">
                    <span className="block font-semibold leading-snug text-white">
                      {a.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-neutral-500">
                      {host(a.url)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {pending && (
            <p className="mt-5 text-center text-sm text-neutral-500">
              Building your feed...
            </p>
          )}
        </div>
      )}
    </main>
  );
}
