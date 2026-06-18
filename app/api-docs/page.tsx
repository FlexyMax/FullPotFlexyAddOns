"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Lock, Unlock } from "lucide-react";
import "swagger-ui-react/swagger-ui.css";

const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

export default function ApiDocsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [spec, setSpec] = useState<Record<string, any> | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [key, setKey] = useState("");
  const [error, setError] = useState("");

  const loadSpec = async (password?: string) => {
    const url = password
      ? `/api/openapi.json?key=${encodeURIComponent(password)}`
      : "/api/openapi.json";
    const res = await fetch(url);
    const data = await res.json();
    setSpec(data.spec);
    setUnlocked(data.unlocked);
    if (password && !data.unlocked) {
      setError("Incorrect password.");
    } else {
      setError("");
    }
  };

  useEffect(() => {
    loadSpec();
  }, []);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    loadSpec(key);
  };

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="bg-white border-b border-zinc-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black tracking-tight text-zinc-900">
              FullPot FlexyAddOns — API Reference
            </h1>
            <p className="text-sm text-zinc-500 font-medium">
              Interactive OpenAPI documentation
            </p>
          </div>

          <form onSubmit={handleUnlock} className="flex items-center gap-2">
            {unlocked ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                <Unlock className="w-3.5 h-3.5" />
                BAMS docs unlocked
              </span>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 text-zinc-400" />
                <input
                  type="password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="BAMS docs password"
                  className="text-sm border border-zinc-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
                <button
                  type="submit"
                  className="text-sm font-semibold bg-zinc-900 text-white rounded-lg px-3 py-1.5 hover:bg-zinc-700 transition-colors"
                >
                  Unlock
                </button>
              </>
            )}
          </form>
        </div>
        {error && (
          <div className="max-w-5xl mx-auto px-6 pb-3 text-xs font-semibold text-red-600">
            {error}
          </div>
        )}
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {spec && <SwaggerUI spec={spec} />}
      </div>
    </main>
  );
}
