"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface Bank {
  id: number;
  name: string;
  code: string;
  shortName: string;
  logo?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function BankCombobox({ value, onChange, className }: Props) {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch("/api/banks", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Không thể tải danh sách ngân hàng.");
        const body = await response.json() as { data?: Bank[] };
        setBanks(body.data ?? []);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError("Không thể tải danh sách ngân hàng.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const matches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi");
    if (!normalized) return banks;
    return banks.filter((bank) =>
      [bank.shortName, bank.name, bank.code]
        .some((item) => item.toLocaleLowerCase("vi").includes(normalized))
    );
  }, [banks, query]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        value={query}
        onChange={(event) => {
          const nextValue = event.target.value;
          setQuery(nextValue);
          onChange(nextValue);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder="Tìm theo tên hoặc mã ngân hàng"
        className={cn("h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-9 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100", className)}
      />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

      {open && (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
          {loading && <p className="px-3 py-2 text-sm text-gray-400">Đang tải ngân hàng...</p>}
          {!loading && error && <p className="px-3 py-2 text-sm text-rose-600">{error}</p>}
          {!loading && !error && matches.length === 0 && (
            <p className="px-3 py-2 text-sm text-gray-400">Không tìm thấy ngân hàng phù hợp.</p>
          )}
          {!loading && !error && matches.map((bank) => (
            <button
              key={bank.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(bank.shortName);
                setQuery(bank.shortName);
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-blue-50"
            >
              {bank.logo ? (
                // Logo từ VietQR là URL động bên ngoài, không áp dụng next/image hostname.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bank.logo} alt="" className="h-6 w-6 rounded object-contain" />
              ) : <span className="h-6 w-6 rounded bg-gray-100" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-800">{bank.shortName}</span>
                <span className="block truncate text-xs text-gray-500">{bank.name} · {bank.code}</span>
              </span>
              {value === bank.shortName && <Check className="h-4 w-4 text-blue-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
