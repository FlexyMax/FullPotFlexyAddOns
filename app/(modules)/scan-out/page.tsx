"use client";

import { useEffect, useRef, useState, useTransition, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { validateOrderScanOut, validateScanOutMatch } from "./actions";
import { toast } from "sonner";
import {
  Loader2,
  PackageSearch,
  Package,
  Hash,
  User,
  ScanLine,
  CheckCircle2,
  XCircle,
  ArrowRight,
  List,
  Truck,
  Play,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { notifyAppsmith, notifyReady } from "@/lib/appsmith-bridge";

type ScanStep = "invoice" | "vendor";

interface ScanOutItem {
  id: string;
  invoiceBarcode: string;
  vendorBarcode: string;
  status: "pending" | "success" | "error";
  message: string;
  timestamp: Date;
}

interface OrderInfo {
  orderNo: string;
  scanned: number;
  toScan: number;
  total: number;
  customer?: string;
  destination?: string;
  items?: Record<string, unknown>[];
}

function ScanOut() {
  const searchParams = useSearchParams();
  const userUq = searchParams.get("lcUser_uq") || "";

  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Order state (Phase 1)
  const [orderInput, setOrderInput] = useState("");
  const [activeOrder, setActiveOrder] = useState<OrderInfo | null>(null);

  // Dual scan state (Phase 2)
  const [currentStep, setCurrentStep] = useState<ScanStep>("invoice");
  const [invoiceBarcode, setInvoiceBarcode] = useState("");
  const [vendorBarcode, setVendorBarcode] = useState("");
  const [scanInput, setScanInput] = useState("");
  const [scanHistory, setScanHistory] = useState<ScanOutItem[]>([]);
  const [activeTab, setActiveTab] = useState<"history" | "details">("history");
  const [isStateLoaded, setIsStateLoaded] = useState(false);

  const orderInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    notifyReady("scan-out");
  }, []);

  // Persist State: Load on Mount
  useEffect(() => {
    if (!userUq) return;
    try {
      const saved = localStorage.getItem(`SCAN_OUT_STATE_${userUq}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.activeOrder) {
          setActiveOrder(parsed.activeOrder);
          setCurrentStep(parsed.currentStep || "invoice");
          setInvoiceBarcode(parsed.invoiceBarcode || "");
          
          if (parsed.scanHistory && Array.isArray(parsed.scanHistory)) {
            setScanHistory(parsed.scanHistory.map((item: any) => ({
              ...item,
              timestamp: new Date(item.timestamp)
            })));
          }
        }
      }
    } catch (e) {
      console.error("Error loading saved scan state:", e);
    } finally {
      setIsStateLoaded(true);
    }
  }, [userUq]);

  // Persist State: Save on Changes
  useEffect(() => {
    if (!userUq || !isStateLoaded) return;
    
    if (activeOrder) {
      localStorage.setItem(`SCAN_OUT_STATE_${userUq}`, JSON.stringify({
        activeOrder,
        currentStep,
        invoiceBarcode,
        scanHistory
      }));
    } else {
      localStorage.removeItem(`SCAN_OUT_STATE_${userUq}`);
    }
  }, [activeOrder, currentStep, invoiceBarcode, scanHistory, userUq, isStateLoaded]);

  // Focus management based on active phase
  useEffect(() => {
    const focusTimer = setTimeout(() => {
      if (activeOrder) {
        scanInputRef.current?.focus();
      } else {
        orderInputRef.current?.focus();
      }
    }, 100);
    return () => clearTimeout(focusTimer);
  }, [activeOrder, currentStep]);

  // Keep focus locked when in scan phase
  useEffect(() => {
    if (!activeOrder) return;
    const focusInput = () => scanInputRef.current?.focus();
    const handleClick = () => setTimeout(focusInput, 10);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [activeOrder]);

  const handleStartScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const orderNo = orderInput.trim();
    if (!orderNo) return;

    setLoading(true);
    const result = await validateOrderScanOut(orderNo);
    setLoading(false);

    if (result.success && result.data) {
      toast.success(result.message);
      setActiveOrder(result.data as OrderInfo);
      setScanHistory([]);
      setCurrentStep("invoice");
      setInvoiceBarcode("");
      setVendorBarcode("");
      setScanInput("");
    } else {
      toast.error(result.message || "Failed to load order");
      orderInputRef.current?.select();
    }
  };

  const handleEndScan = () => {
    setActiveOrder(null);
    setOrderInput("");
    setTimeout(() => orderInputRef.current?.focus(), 100);
  };

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const barcode = scanInput.trim();
    if (!barcode || !userUq || !activeOrder || activeOrder.toScan === 0) return;

    setScanInput("");

    if (currentStep === "invoice") {
      // Store invoice barcode, move to vendor step
      setInvoiceBarcode(barcode);
      setCurrentStep("vendor");
      toast.info(`Invoice label scanned: ${barcode}. Now scan Vendor label.`);
      return;
    }

    // Step 2: Vendor barcode — validate match
    setVendorBarcode(barcode);

    const newItem: ScanOutItem = {
      id: Math.random().toString(36).substring(7),
      invoiceBarcode,
      vendorBarcode: barcode,
      status: "pending",
      message: "Validating match...",
      timestamp: new Date(),
    };

    setScanHistory((prev) => [newItem, ...prev.slice(0, 19)]);

    startTransition(async () => {
      const result = await validateScanOutMatch(
        activeOrder.orderNo,
        invoiceBarcode,
        barcode,
        userUq
      );

      setScanHistory((prev) =>
        prev.map((s) =>
          s.id === newItem.id
            ? {
                ...s,
                status: result.success ? "success" : "error",
                message: result.message,
              }
            : s
        )
      );

      if (result.success) {
        toast.success(result.message);
        notifyAppsmith("SCANOUT_MATCH", {
          invoiceBarcode,
          vendorBarcode: barcode,
          orderNo: activeOrder.orderNo,
        });

        // Silently refresh the full order state to get updated grid items and totals
        // Passing Date.now() bypasses any aggressive caching in Next.js Server Actions
        const refreshResult = await validateOrderScanOut(activeOrder.orderNo, Date.now());
        if (refreshResult.success && refreshResult.data) {
          setActiveOrder(refreshResult.data as OrderInfo);
        } else if (result.totals) {
          // Fallback to updating just the totals if the full refresh fails
          setActiveOrder((prev) => 
            prev ? {
              ...prev,
              scanned: result.totals!.scanned,
              toScan: result.totals!.toScan,
              total: result.totals!.total,
            } : null
          );
        }
      } else {
        toast.error(result.message);
        notifyAppsmith("SCANOUT_ERROR", {
          invoiceBarcode,
          vendorBarcode: barcode,
          message: result.message,
        });
      }

      // Reset for next scan pair
      setInvoiceBarcode("");
      setVendorBarcode("");
      setCurrentStep("invoice");
    });
  };

  const handleCancelScanPair = () => {
    setInvoiceBarcode("");
    setCurrentStep("invoice");
    setScanInput("");
    toast.info("Scan cancelled. Start again with Invoice label.");
  };

  // Missing params
  if (!userUq) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50 text-zinc-900 p-4">
        <div className="bg-white border border-zinc-200 p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <Hash className="w-16 h-16 mx-auto mb-4 text-zinc-700" />
          <h1 className="text-2xl font-bold mb-2">Missing Parameters</h1>
          <p className="text-zinc-400">
            Required: <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-xs text-zinc-600">lcUser_uq</code>
          </p>
        </div>
      </div>
    );
  }

  if (!isStateLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-50">
        <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 p-4 sticky top-0 z-50 shadow-sm">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-violet-600 p-2 rounded-lg shadow-lg shadow-violet-500/20">
              <Truck className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight uppercase text-zinc-900">
                Scan Out
              </h1>
              <div className="flex items-center gap-2 text-xs text-zinc-500 font-bold">
                <User size={12} />{" "}
                <span className="text-zinc-600 uppercase tracking-widest">{userUq}</span>
              </div>
            </div>
          </div>

          {activeOrder && (
            <div className="flex gap-4">
              <div className="bg-zinc-100 border border-zinc-200 px-6 py-2 rounded-xl text-center">
                <span className="text-[10px] uppercase font-black text-zinc-500 block leading-tight">
                  Scanned
                </span>
                <span className="text-xl font-bold text-zinc-900 leading-tight">
                  {activeOrder.scanned}
                </span>
              </div>
              <div className="bg-zinc-100 border border-zinc-200 px-6 py-2 rounded-xl text-center shadow-inner">
                <span className="text-[10px] uppercase font-black text-violet-500 block leading-tight">
                  To Scan
                </span>
                <span className="text-xl font-black text-violet-700 leading-tight">
                  {activeOrder.toScan}
                </span>
              </div>
              <div className="bg-zinc-100 border border-zinc-200 px-6 py-2 rounded-xl text-center">
                <span className="text-[10px] uppercase font-black text-zinc-500 block leading-tight">
                  Total
                </span>
                <span className="text-xl font-bold text-zinc-900 leading-tight">
                  {activeOrder.total}
                </span>
              </div>
              
              <div className="ml-4 border-l border-zinc-200 pl-4 flex items-center">
                <button
                  onClick={handleEndScan}
                  className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-4 py-2 rounded-lg text-xs font-bold uppercase transition-colors flex items-center gap-2 shadow-sm"
                >
                  <RotateCcw size={14} />
                  End Scan
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-8 flex flex-col gap-6">
        
        {/* PHASE 1: Setup - Enter Order No */}
        {!activeOrder ? (
          <div className="flex-1 flex flex-col items-center justify-center -mt-20">
            <div className="bg-white border border-zinc-200 p-8 rounded-3xl shadow-xl w-full max-w-lg">
              <div className="text-center mb-8">
                <PackageSearch className="w-16 h-16 mx-auto text-violet-500 mb-4" />
                <h2 className="text-2xl font-black uppercase tracking-tight text-zinc-900">
                  Select Order To Scan
                </h2>
                <p className="text-zinc-500 mt-2 text-sm font-medium">
                  Enter or scan the Invoice / Order No to begin the scan out process.
                </p>
              </div>

              <form onSubmit={handleStartScan} className="flex flex-col gap-4">
                <input
                  ref={orderInputRef}
                  type="text"
                  value={orderInput}
                  onChange={(e) => setOrderInput(e.target.value)}
                  placeholder="Enter Order No..."
                  className="w-full bg-zinc-50 border-2 border-zinc-200 rounded-2xl px-6 py-5 text-2xl font-black text-center placeholder:text-zinc-300 focus:outline-none focus:border-violet-500 focus:bg-white transition-all uppercase"
                  autoFocus
                />
                
                <button
                  type="submit"
                  disabled={loading || !orderInput.trim()}
                  className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:hover:bg-violet-600 text-white font-black uppercase tracking-widest py-5 rounded-2xl transition-all shadow-lg shadow-violet-500/25 flex items-center justify-center gap-2 text-lg"
                >
                  {loading ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <>
                      <Play size={20} />
                      Start Scan
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* PHASE 2: Execution - Scan Labels */
          <>
            {/* Active Order Summary Banner */}
            <div className="bg-violet-50 border border-violet-200 rounded-2xl px-6 py-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <Hash className="text-violet-500 w-6 h-6" />
                <div>
                  <div className="text-[10px] font-black uppercase text-violet-500 tracking-widest">Active Order</div>
                  <div className="text-xl font-black text-violet-900">{activeOrder.orderNo}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-violet-800">{activeOrder.customer}</div>
                <div className="text-xs font-semibold text-violet-600">{activeOrder.destination}</div>
              </div>
            </div>

            {/* Step Indicator */}
            <div className="flex items-center justify-center gap-4">
              <div
                className={cn(
                  "flex items-center gap-2 px-5 py-3 rounded-xl border-2 font-bold text-sm transition-all",
                  currentStep === "invoice"
                    ? "border-blue-500 bg-blue-50 text-blue-700 shadow-lg shadow-blue-500/10"
                    : invoiceBarcode
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-zinc-200 bg-white text-zinc-400"
                )}
              >
                <ScanLine size={18} />
                <span>1. Invoice Label</span>
                {invoiceBarcode && <CheckCircle2 size={16} className="text-emerald-500" />}
              </div>

              <ArrowRight size={20} className="text-zinc-300" />

              <div
                className={cn(
                  "flex items-center gap-2 px-5 py-3 rounded-xl border-2 font-bold text-sm transition-all",
                  currentStep === "vendor"
                    ? "border-violet-500 bg-violet-50 text-violet-700 shadow-lg shadow-violet-500/10"
                    : "border-zinc-200 bg-white text-zinc-400"
                )}
              >
                <PackageSearch size={18} />
                <span>2. Vendor Label</span>
              </div>
            </div>

            {/* Active invoice barcode badge */}
            {invoiceBarcode && currentStep === "vendor" && (
              <div className="flex items-center justify-center gap-3">
                <div className="bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-full flex items-center gap-2 shadow-sm">
                  <ScanLine size={14} className="text-emerald-600" />
                  <span className="text-sm font-bold text-emerald-700">Invoice: {invoiceBarcode}</span>
                </div>
                <button
                  onClick={handleCancelScanPair}
                  className="text-xs text-zinc-400 hover:text-red-500 font-bold transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Dual Scan Input */}
            <div className="relative group">
              <div
                className={cn(
                  "absolute -inset-1 rounded-2xl blur opacity-10 transition duration-1000",
                  activeOrder.toScan === 0
                    ? "bg-emerald-500 opacity-30"
                    : "group-focus-within:opacity-20",
                  activeOrder.toScan > 0 && currentStep === "invoice" && "bg-gradient-to-r from-blue-600 to-cyan-600",
                  activeOrder.toScan > 0 && currentStep === "vendor" && "bg-gradient-to-r from-violet-600 to-purple-600"
                )}
              />
              <form onSubmit={handleScan} className="relative">
                <input
                  ref={scanInputRef}
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  disabled={activeOrder.toScan === 0 || isPending}
                  placeholder={
                    activeOrder.toScan === 0
                      ? "ORDER SCANNED COMPLETELY"
                      : currentStep === "invoice"
                      ? "Scan INVOICE Label..."
                      : "Scan VENDOR Label..."
                  }
                  className={cn(
                    "w-full bg-white border-2 rounded-2xl px-8 py-6 text-3xl md:text-5xl font-black text-center transition-all uppercase shadow-sm",
                    activeOrder.toScan === 0
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 placeholder:text-emerald-400 cursor-not-allowed"
                      : "text-zinc-900 placeholder:text-zinc-200 focus:outline-none focus:ring-4",
                    activeOrder.toScan > 0 && currentStep === "invoice" && "border-blue-200 focus:border-blue-500 focus:ring-blue-500/5",
                    activeOrder.toScan > 0 && currentStep === "vendor" && "border-violet-200 focus:border-violet-500 focus:ring-violet-500/5"
                  )}
                  autoFocus
                />
                {isPending && (
                  <div className="absolute right-6 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                  </div>
                )}
              </form>
            </div>

            {/* Tabs & Content */}
            <div className="flex-1 flex flex-col min-h-[300px]">
              <div className="flex items-center gap-6 mb-4 border-b border-zinc-200">
                <button
                  type="button"
                  onClick={() => setActiveTab("history")}
                  className={cn(
                    "flex items-center gap-2 pb-3 text-sm font-black uppercase tracking-widest transition-colors relative",
                    activeTab === "history" ? "text-violet-600" : "text-zinc-400 hover:text-zinc-600"
                  )}
                >
                  <List size={18} />
                  Scan History
                  {activeTab === "history" && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-600 rounded-t-full" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("details")}
                  className={cn(
                    "flex items-center gap-2 pb-3 text-sm font-black uppercase tracking-widest transition-colors relative",
                    activeTab === "details" ? "text-violet-600" : "text-zinc-400 hover:text-zinc-600"
                  )}
                >
                  <Package size={18} />
                  Order Detail
                  {activeTab === "details" && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-600 rounded-t-full" />
                  )}
                </button>
              </div>

              <div className="flex-1 overflow-auto bg-white border border-zinc-200 rounded-2xl shadow-sm">
                {activeTab === "history" ? (
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-white shadow-sm z-10">
                      <tr className="bg-zinc-50 text-[10px] uppercase font-black tracking-widest text-zinc-500 border-b border-zinc-200">
                        <th className="px-5 py-4">Invoice Label</th>
                        <th className="px-5 py-4">Vendor Label</th>
                        <th className="px-5 py-4">Status</th>
                        <th className="px-5 py-4">Message</th>
                        <th className="px-5 py-4 text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {scanHistory.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-zinc-300">
                            <List className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p className="text-sm font-bold">No scans yet for this order</p>
                          </td>
                        </tr>
                      ) : (
                        scanHistory.map((item) => (
                          <tr key={item.id} className="hover:bg-zinc-50 transition-colors">
                            <td className="px-5 py-4 font-mono font-bold text-sm text-zinc-900">
                              {item.invoiceBarcode}
                            </td>
                            <td className="px-5 py-4 font-mono font-bold text-sm text-zinc-900">
                              {item.vendorBarcode}
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border",
                                  item.status === "pending" &&
                                    "bg-blue-50 text-blue-600 border-blue-200",
                                  item.status === "success" &&
                                    "bg-emerald-50 text-emerald-700 border-emerald-200",
                                  item.status === "error" &&
                                    "bg-red-50 text-red-700 border-red-200"
                                )}
                              >
                                {item.status === "success" && <CheckCircle2 size={10} />}
                                {item.status === "error" && <XCircle size={10} />}
                                {item.status}
                              </span>
                            </td>
                            <td
                              className={cn(
                                "px-5 py-4 text-sm font-extrabold max-w-[250px] truncate",
                                item.status === "error" ? "text-red-600" : "text-zinc-700"
                              )}
                              title={item.message}
                            >
                              {item.message}
                            </td>
                            <td className="px-5 py-4 text-right text-xs text-zinc-400 font-mono">
                              {item.timestamp.toLocaleTimeString([], { hour12: false })}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-white shadow-sm z-10">
                      <tr className="bg-zinc-50 text-[10px] uppercase font-black tracking-widest text-zinc-500 border-b border-zinc-200">
                        <th className="px-5 py-4">Farm</th>
                        <th className="px-5 py-4">Lot</th>
                        <th className="px-5 py-4">Description</th>
                        <th className="px-5 py-4 text-right">Box Qty</th>
                        <th className="px-5 py-4 text-right">Scanned</th>
                        <th className="px-5 py-4">AWBcode</th>
                        <th className="px-5 py-4">Grower</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {(!activeOrder.items || activeOrder.items.length === 0) ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center text-zinc-300">
                            <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p className="text-sm font-bold">No details available</p>
                          </td>
                        </tr>
                      ) : (
                        activeOrder.items.map((row, idx) => {
                          const boxQty = Number(row.box_qty || 0);
                          const qtyOut = Number(row.qty_out || 0);
                          const isComplete = qtyOut >= boxQty && boxQty > 0;
                          
                          return (
                            <tr key={idx} className={cn("hover:bg-zinc-50 transition-colors", isComplete && "bg-emerald-50/50 hover:bg-emerald-50")}>
                              <td className="px-5 py-4 font-bold text-sm text-zinc-900">
                                {row.farm as string}
                              </td>
                              <td className="px-5 py-4 font-mono font-medium text-sm text-zinc-600">
                                {row.lote as string}
                              </td>
                              <td className="px-5 py-4 font-medium text-xs text-zinc-600 max-w-[200px] truncate" title={row.description as string}>
                                {row.description as string}
                              </td>
                              <td className="px-5 py-4 text-right font-black text-sm text-zinc-900">
                                {boxQty}
                              </td>
                              <td className={cn(
                                "px-5 py-4 text-right font-black text-sm",
                                isComplete ? "text-emerald-600" : "text-violet-600"
                              )}>
                                {qtyOut}
                              </td>
                              <td className="px-5 py-4 font-mono text-xs text-zinc-500">
                                {row.awbcode as string}
                              </td>
                              <td className="px-5 py-4 text-xs font-bold text-zinc-600">
                                {row.grower as string}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}

      </div>

      <footer className="p-4 text-center text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] border-t border-zinc-100 bg-white">
        Scan Out Engine • FlexyAddOns v1.0.0
      </footer>
    </main>
  );
}

export default function ScanOutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-zinc-50">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <ScanOut />
    </Suspense>
  );
}
