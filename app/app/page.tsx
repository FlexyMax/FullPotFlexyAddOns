import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Barcode, CreditCard, Monitor, PackageSearch, Database } from "lucide-react";

const modules = [
  {
    name: "Store Scanner",
    description: "Barcode scanning for store invoices",
    path: "/scanner",
    icon: Barcode,
    status: "active" as const,
    params: "?invoice_uq=X&lcUser_uq=Y",
  },
  {
    name: "PAX POS Terminal",
    description: "Credit card processing via PAX devices",
    path: "/pos",
    icon: CreditCard,
    status: "active" as const,
    params: "?invoice_no=X&amount=Y&seller_ip=Z",
  },
  {
    name: "Scan Out",
    description: "Dual barcode scan — invoice + vendor match",
    path: "/scan-out",
    icon: PackageSearch,
    status: "active" as const,
    params: "?dispatch_uq=X&lcUser_uq=Y",
  },
  {
    name: "Stock",
    description: "Inventory with infinite scroll",
    path: "/stock",
    icon: Database,
    status: "planned" as const,
    params: "TBD",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-center gap-4">
            <div className="bg-zinc-900 p-3 rounded-2xl shadow-lg">
              <Monitor className="text-white w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-zinc-900">
                FullPot FlexyAddOns
              </h1>
              <p className="text-sm text-zinc-500 font-medium">
                Unified micro-services for Appsmith iFrame integration
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Module Cards */}
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <Card
                key={mod.path}
                className="group hover:shadow-lg transition-all duration-300 border-zinc-200"
              >
                <CardHeader className="flex flex-row items-start gap-4 space-y-0">
                  <div className="bg-zinc-100 p-2.5 rounded-xl group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{mod.name}</CardTitle>
                      <Badge
                        variant={mod.status === "active" ? "default" : "secondary"}
                        className="text-[10px] uppercase font-black tracking-wider"
                      >
                        {mod.status}
                      </Badge>
                    </div>
                    <CardDescription className="mt-1">
                      {mod.description}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-zinc-50 border border-zinc-100 rounded-lg px-4 py-2.5">
                    <p className="text-[10px] uppercase font-black text-zinc-400 tracking-widest mb-1">
                      iFrame URL
                    </p>
                    <code className="text-xs font-mono text-zinc-700 break-all">
                      {mod.path}{mod.params}
                    </code>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* API Info */}
        <div className="mt-10 bg-white border border-zinc-200 rounded-2xl p-6">
          <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4">
            API Endpoints
          </h2>
          <div className="space-y-2 font-mono text-sm">
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="text-[10px] w-12 justify-center">GET</Badge>
              <code className="text-zinc-700">/api/health</code>
              <span className="text-zinc-400 text-xs">— System health check</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-10 text-center text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">
          FullPot FlexyAddOns Engine • v1.0.0
        </footer>
      </div>
    </main>
  );
}
