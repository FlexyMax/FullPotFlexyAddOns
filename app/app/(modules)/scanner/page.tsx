"use client";

import { useEffect, useRef, useState, useTransition, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getInvoiceHeader, insertBarcode } from "./actions";
import { toast } from "sonner";
import {
  Loader2,
  Package,
  User,
  Hash,
  DollarSign,
  List,
  Barcode,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { notifyAppsmith, notifyReady } from "@/lib/appsmith-bridge";
import type { ScanItem, InvoiceHeader } from "@/types/scanner";

function Scanner() {
  const searchParams = useSearchParams();
  const invoiceUq =
    searchParams.get("invoice_uq") || searchParams.get("lcInvoice_uq");
  const userUq = searchParams.get("lcUser_uq");

  const [header, setHeader] = useState<InvoiceHeader | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [scanInput, setScanInput] = useState("");
  const [scanQueue, setScanQueue] = useState<ScanItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Notify Appsmith that the module is ready
  useEffect(() => {
    notifyReady("scanner");
  }, []);

  // Initial Load
  useEffect(() => {
    if (!invoiceUq) {
      setLoading(false);
      return;
    }

    const loadHeader = async () => {
      const result = await getInvoiceHeader(invoiceUq);
      if (result.error) {
        toast.error("Error loading invoice: " + result.error);
      } else {
        setHeader(result.data as InvoiceHeader);
      }
      setLoading(false);
    };

    loadHeader();
  }, [invoiceUq]);

  // Handle Input Focus
  useEffect(() => {
    const focusInput = () => inputRef.current?.focus();
    focusInput();
    const handleDocumentClick = () => setTimeout(focusInput, 10);
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, []);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const barcode = scanInput.trim();
    if (!barcode || !header || !userUq) return;

    setScanInput("");

    const newScan: ScanItem = {
      id: Math.random().toString(36).substring(7),
      barcode,
      status: "pending",
      message: "Processing...",
      timestamp: new Date(),
    };

    setScanQueue((prev) => [newScan, ...prev.slice(0, 9)]);

    startTransition(async () => {
      const result = await insertBarcode(invoiceUq!, barcode, userUq);

      setScanQueue((prev) =>
        prev.map((s) =>
          s.id === newScan.id
            ? {
                ...s,
                status: result.success ? "success" : "error",
                message: result.message,
              }
            : s
        )
      );

      if (result.success) {
        toast.success(result.message || "Scanned: " + barcode);

        // Notify Appsmith
        notifyAppsmith("SCAN_COMPLETE", {
          barcode,
          invoiceUq,
          message: result.message,
        });

        // Refresh header
        const headResult = await getInvoiceHeader(invoiceUq!);
        if (!headResult.error) {
          setHeader(headResult.data as InvoiceHeader);
        }
      } else {
        toast.error(result.message || "Failed to scan: " + barcode);
        notifyAppsmith("SCAN_ERROR", {
          barcode,
          invoiceUq,
          message: result.message,
        });
      }
    });
  };

  if (!invoiceUq || !userUq) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50 text-zinc-900 p-4">
        <div className="bg-white border border-zinc-200 p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <Hash className="w-16 h-16 mx-auto mb-4 text-zinc-700" />
          <h1 className="text-2xl font-bold mb-2">Missing Parameters</h1>
          <p className="text-zinc-400">
            Please provide <code className="text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded text-xs">invoice_uq</code> and{" "}
            <code className="text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded text-xs">lcUser_uq</code> in the URL.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-50 text-zinc-900">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col font-sans">
      {/* Header Bar */}
      <header className="bg-white border-b border-zinc-200 p-4 sticky top-0 z-50 shadow-sm">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-2 rounded-lg shadow-lg shadow-blue-500/20">
              <Barcode className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight uppercase text-zinc-900">
                Store Scanner
              </h1>
              <div className="flex items-center gap-2 text-xs text-zinc-500 font-bold">
                <Hash size={12} />{" "}
                <span className="text-zinc-600">
                  {header?.invoice_no || invoiceUq}
                </span>
                <span className="mx-1">•</span>
                <User size={12} />{" "}
                <span className="text-zinc-600">{userUq}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="bg-zinc-100 border border-zinc-200 px-6 py-2 rounded-xl text-center">
              <span className="text-[10px] uppercase font-black text-zinc-500 block leading-tight">
                Total Boxes
              </span>
              <span className="text-xl font-bold text-zinc-900 leading-tight">
                {header?.total_cases || 0}
              </span>
            </div>
            <div className="bg-zinc-100 border border-zinc-200 px-6 py-2 rounded-xl text-center">
              <span className="text-[10px] uppercase font-black text-zinc-500 block leading-tight">
                Total Invoice
              </span>
              <div className="flex items-center justify-center gap-1">
                <DollarSign size={16} className="text-emerald-600" />
                <span className="text-xl font-bold text-emerald-700 leading-tight">
                  {Number(header?.total_invoice || 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-8 flex flex-col gap-8">
        {/* Scan Input Section */}
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl blur opacity-10 group-focus-within:opacity-20 transition duration-1000" />
          <form onSubmit={handleScan} className="relative">
            <input
              ref={inputRef}
              type="text"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              placeholder="Scan Barcode Here..."
              className="w-full bg-white border-2 border-zinc-200 rounded-2xl px-8 py-6 text-3xl md:text-5xl font-black text-center placeholder:text-zinc-200 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all uppercase text-zinc-900 shadow-sm"
              autoFocus
            />
            {isPending && (
              <div className="absolute right-6 top-1/2 -translate-y-1/2">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              </div>
            )}
          </form>
        </div>

        {/* Scan History / Queue */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-4 text-zinc-400">
            <List size={18} />
            <h2 className="text-sm font-black uppercase tracking-widest">
              Recent Scans
            </h2>
          </div>

          <div className="flex-1 overflow-auto bg-white border border-zinc-200 rounded-2xl shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50/50 text-[10px] uppercase font-black tracking-widest text-zinc-500 border-b border-zinc-100">
                  <th className="px-6 py-4">Barcode</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Message</th>
                  <th className="px-6 py-4 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {scanQueue.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-zinc-300">
                      <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p className="text-sm font-bold">
                        No active scans in this session
                      </p>
                    </td>
                  </tr>
                ) : (
                  scanQueue.map((scan) => (
                    <tr
                      key={scan.id}
                      className="group hover:bg-zinc-50 transition-colors"
                    >
                      <td className="px-6 py-4 font-mono font-bold text-lg text-zinc-900">
                        {scan.barcode}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border",
                            scan.status === "pending" &&
                              "bg-blue-50 text-blue-600 border-blue-200",
                            scan.status === "success" &&
                              "bg-emerald-50 text-emerald-700 border-emerald-200",
                            scan.status === "error" &&
                              "bg-red-50 text-red-700 border-red-200"
                          )}
                        >
                          {scan.status}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "px-6 py-4 text-sm font-extrabold",
                          scan.status === "error"
                            ? "text-red-600"
                            : "text-zinc-700"
                        )}
                      >
                        {scan.message}
                      </td>
                      <td className="px-6 py-4 text-right text-xs text-zinc-400 font-mono">
                        {scan.timestamp.toLocaleTimeString([], {
                          hour12: false,
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <footer className="p-4 text-center text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] border-t border-zinc-100">
        Store Scanner Engine • FlexyAddOns v1.0.0
      </footer>
    </main>
  );
}

export default function ScannerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-zinc-50 text-zinc-900">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <Scanner />
    </Suspense>
  );
}
