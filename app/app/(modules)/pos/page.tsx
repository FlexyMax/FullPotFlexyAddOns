"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PaxTerminal, createTestResult } from "@/lib/pax/protocol";
import { notifyAppsmith, notifyReady } from "@/lib/appsmith-bridge";
import { toast } from "sonner";
import {
  Loader2,
  CreditCard,
  CheckCircle2,
  XCircle,
  Radio,
  AlertTriangle,
  Hash,
  DollarSign,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PosFlowStatus, PaxSaleResult } from "@/types/pos";

function PosTerminal() {
  const searchParams = useSearchParams();
  const invoiceNo = searchParams.get("invoice_no") || "";
  const amount = parseFloat(searchParams.get("amount") || "0");
  const sellerIp = searchParams.get("seller_ip") || "";
  const port = parseInt(searchParams.get("port") || "10009", 10);
  const isTestMode = searchParams.get("test") === "true";
  const autoStart = searchParams.get("auto") !== "false"; // auto-start by default

  const [status, setStatus] = useState<PosFlowStatus>("idle");
  const [result, setResult] = useState<PaxSaleResult | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [elapsedTime, setElapsedTime] = useState(0);

  // Timer for elapsed time
  useEffect(() => {
    if (status === "initializing" || status === "processing" || status === "waiting_card") {
      const interval = setInterval(() => setElapsedTime((t) => t + 1), 1000);
      return () => clearInterval(interval);
    }
  }, [status]);

  // Notify Appsmith ready
  useEffect(() => {
    notifyReady("pos");
  }, []);

  const processSale = useCallback(async () => {
    if (!invoiceNo || !amount) return;

    setStatus("initializing");
    setStatusMessage("Connecting to PAX terminal...");
    setElapsedTime(0);
    setResult(null);

    try {
      if (isTestMode) {
        // Simulate delay
        await new Promise((r) => setTimeout(r, 2000));
        setStatus("processing");
        setStatusMessage("Processing payment...");
        await new Promise((r) => setTimeout(r, 1500));
        setStatus("waiting_card");
        setStatusMessage("Waiting for card...");
        await new Promise((r) => setTimeout(r, 2000));

        const testResult = createTestResult(amount, invoiceNo, true);
        setResult(testResult);
        setStatus("approved");
        setStatusMessage("Transaction approved!");
        toast.success("TEST: Transaction approved");
        notifyAppsmith("POS_SALE_SUCCESS", testResult);
        return;
      }

      // Real PAX flow
      const pax = new PaxTerminal({ ip: sellerIp, port });

      // Step 1: Initialize
      setStatusMessage("Initializing PAX terminal...");
      const initResult = await pax.initialize();

      if (initResult.responseCode !== '000000' && initResult.responseCode !== '') {
        throw new Error(`PAX Init failed: ${initResult.responseMessage}`);
      }

      // Step 2: Process sale
      setStatus("processing");
      setStatusMessage("Processing payment — present card on terminal...");

      setStatus("waiting_card");
      setStatusMessage("Waiting for card tap/swipe/insert...");

      const saleResult = await pax.doSale(amount, invoiceNo);

      setResult(saleResult);

      if (saleResult.success) {
        setStatus("approved");
        setStatusMessage("Transaction approved!");
        toast.success("Payment approved");
        notifyAppsmith("POS_SALE_SUCCESS", saleResult);
      } else {
        setStatus("declined");
        setStatusMessage(saleResult.message);
        toast.error(saleResult.message);
        notifyAppsmith("POS_SALE_ERROR", saleResult);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus("error");
      setStatusMessage(message);
      setResult({ success: false, message });
      toast.error(message);
      notifyAppsmith("POS_SALE_ERROR", { error: message });
    }
  }, [invoiceNo, amount, sellerIp, port, isTestMode]);

  // Auto-start if all params present
  useEffect(() => {
    if (autoStart && invoiceNo && amount && (sellerIp || isTestMode) && status === "idle") {
      processSale();
    }
  }, [autoStart, invoiceNo, amount, sellerIp, isTestMode, status, processSale]);

  // Missing params
  if (!invoiceNo || !amount) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-100 p-4">
        <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-amber-500" />
          <h1 className="text-2xl font-bold mb-2">Missing Parameters</h1>
          <p className="text-zinc-500 text-sm">
            Required: <code className="text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">invoice_no</code>,{" "}
            <code className="text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">amount</code>,{" "}
            <code className="text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">seller_ip</code>
          </p>
        </div>
      </div>
    );
  }

  const statusConfig: Record<PosFlowStatus, { color: string; icon: React.ReactNode; pulse: boolean }> = {
    idle: { color: "text-zinc-500", icon: <CreditCard className="w-20 h-20" />, pulse: false },
    initializing: { color: "text-blue-400", icon: <Wifi className="w-20 h-20" />, pulse: true },
    processing: { color: "text-blue-400", icon: <CreditCard className="w-20 h-20" />, pulse: true },
    waiting_card: { color: "text-amber-400", icon: <Radio className="w-20 h-20" />, pulse: true },
    approved: { color: "text-emerald-400", icon: <CheckCircle2 className="w-20 h-20" />, pulse: false },
    declined: { color: "text-red-400", icon: <XCircle className="w-20 h-20" />, pulse: false },
    error: { color: "text-red-400", icon: <AlertTriangle className="w-20 h-20" />, pulse: false },
    timeout: { color: "text-amber-400", icon: <AlertTriangle className="w-20 h-20" />, pulse: false },
  };

  const cfg = statusConfig[status];

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4 font-sans">
      {/* Test mode banner */}
      {isTestMode && (
        <div className="fixed top-0 left-0 right-0 bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 text-center">
          <span className="text-amber-400 text-xs font-black uppercase tracking-widest">
            ⚠ Test Mode — No real charges
          </span>
        </div>
      )}

      {/* Main Card */}
      <div className="w-full max-w-md">
        {/* Invoice info */}
        <div className="flex items-center justify-between mb-8 px-2">
          <div className="flex items-center gap-2">
            <Hash size={14} className="text-zinc-500" />
            <span className="text-sm font-bold text-zinc-400">INV {invoiceNo}</span>
          </div>
          <div className="flex items-center gap-2">
            <DollarSign size={14} className="text-emerald-500" />
            <span className="text-2xl font-black text-emerald-400">
              {amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Status Display */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-10 text-center relative overflow-hidden">
          {/* Animated background */}
          {cfg.pulse && (
            <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent animate-pulse" />
          )}

          <div className={cn("relative z-10 flex flex-col items-center gap-6", cfg.color)}>
            {/* Icon */}
            <div className={cn(cfg.pulse && "animate-pulse")}>
              {cfg.icon}
            </div>

            {/* Status text */}
            <div>
              <p className="text-lg font-black uppercase tracking-wider">{statusMessage}</p>
              {(status === "initializing" || status === "processing" || status === "waiting_card") && (
                <div className="flex items-center justify-center gap-2 mt-3">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs text-zinc-500 font-mono">{elapsedTime}s</span>
                </div>
              )}
            </div>

            {/* Result details */}
            {result && status === "approved" && (
              <div className="w-full mt-4 space-y-3 text-left bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5">
                {result.authCode && (
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Auth Code</span>
                    <span className="font-mono font-bold text-emerald-400">{result.authCode}</span>
                  </div>
                )}
                {result.transactionId && (
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Transaction ID</span>
                    <span className="font-mono font-bold text-emerald-400">{result.transactionId}</span>
                  </div>
                )}
                {result.cardType && result.lastFour && (
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Card</span>
                    <span className="font-mono font-bold text-zinc-300">
                      {result.cardType} •••• {result.lastFour}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Retry button */}
        {(status === "error" || status === "declined" || status === "timeout") && (
          <button
            onClick={processSale}
            className="w-full mt-6 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-bold py-4 rounded-2xl transition-colors"
          >
            Retry Transaction
          </button>
        )}

        {/* Connection info */}
        <div className="mt-8 text-center">
          <p className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">
            {isTestMode ? "TEST MODE" : `PAX Terminal • ${sellerIp}:${port}`}
          </p>
        </div>
      </div>
    </main>
  );
}

export default function PosPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-zinc-950">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      }
    >
      <PosTerminal />
    </Suspense>
  );
}
