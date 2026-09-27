export type Frequency = "monthly" | "yearly" | "once" | "dates";

export type CostItem = {
  id: string;
  name: string;
  amount: number;
  share: number;
  frequency: Frequency;
  monthsPerYear: number;
  firstDue: string;
  lastDue: string;
  paidThrough: string;
  annualRate: number;
  firstIncrease: string;
  maxIncreases: number;
  dueDates?: string[];
};

export type Payment = { itemId: string; name: string; date: string; amount: number };

function dateOf(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addMonths(iso: string, months: number): string {
  const date = dateOf(iso);
  if (!date) return "";
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

function increasesAt(due: string, first: string, maximum: number): number {
  if (!first || due < first || maximum <= 0) return 0;
  let count = 0;
  for (let n = 0; n < Math.min(100, maximum); n++) {
    if (addMonths(first, n * 12) <= due) count++;
    else break;
  }
  return count;
}

export function calculate(items: CostItem[], start: string, end: string): Payment[] {
  if (!dateOf(start) || !dateOf(end) || start > end) return [];
  const payments: Payment[] = [];
  for (const item of items) {
    if (!dateOf(item.firstDue) || !Number.isFinite(item.amount) || item.amount < 0) continue;
    const effectiveEnd = item.lastDue && item.lastDue < end ? item.lastDue : end;
    const addPayment = (date: string) => {
      if (date < start || date > effectiveEnd || (item.paidThrough && date <= item.paidThrough)) return;
      const factor = Math.pow(1 + Math.max(-100, item.annualRate) / 100, increasesAt(date, item.firstIncrease, item.maxIncreases));
      const amount = item.amount * Math.max(0, Math.min(100, item.share)) / 100 * factor;
      if (Number.isFinite(amount) && amount > 0) payments.push({ itemId: item.id, name: item.name || "İsimsiz kalem", date, amount });
    };

    if (item.frequency === "dates") {
      for (const date of item.dueDates ?? []) if (dateOf(date)) addPayment(date);
    } else if (item.frequency === "once") {
      addPayment(item.firstDue);
    } else if (item.frequency === "yearly") {
      for (let n = 0; n < 100; n++) {
        const date = addMonths(item.firstDue, n * 12);
        if (!date || date > effectiveEnd) break;
        addPayment(date);
      }
    } else {
      const active = Math.max(1, Math.min(12, Math.floor(item.monthsPerYear || 12)));
      for (let year = 0; year < 100; year++) {
        const season = addMonths(item.firstDue, year * 12);
        if (!season || season > effectiveEnd) break;
        for (let month = 0; month < active; month++) addPayment(addMonths(season, month));
      }
    }
  }
  return payments.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

export function money(value: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(Math.round((value + Number.EPSILON) * 100) / 100);
}

export const initialItems: CostItem[] = [
  { id: "nafaka", name: "İştirak nafakası", amount: 15000, share: 100, frequency: "monthly", monthsPerYear: 12, firstDue: "2026-10-01", lastDue: "2029-02-28", paidThrough: "", annualRate: 35, firstIncrease: "2027-02-01", maxIncreases: 2 },
  { id: "adult-support", name: "18 sonrası destek (varsayım)", amount: 27337.5, share: 100, frequency: "monthly", monthsPerYear: 12, firstDue: "2029-03-01", lastDue: "2029-06-30", paidThrough: "", annualRate: 0, firstIncrease: "", maxIncreases: 0 },
  { id: "school-transport", name: "Okul + servis", amount: 196460.4, share: 50, frequency: "yearly", monthsPerYear: 12, firstDue: "2026-02-01", lastDue: "2028-02-28", paidThrough: "2026-02-01", annualRate: 35, firstIncrease: "2027-02-01", maxIncreases: 2 },
  { id: "books", name: "Okul kitapları", amount: 11881.66, share: 50, frequency: "dates", monthsPerYear: 12, firstDue: "2026-11-01", lastDue: "2028-09-30", paidThrough: "", annualRate: 35, firstIncrease: "2027-02-01", maxIncreases: 2, dueDates: ["2026-11-01", "2027-09-01", "2028-09-01"] },
  { id: "uniform", name: "Okul kıyafeti", amount: 13000, share: 50, frequency: "dates", monthsPerYear: 12, firstDue: "2026-11-01", lastDue: "2028-09-30", paidThrough: "", annualRate: 35, firstIncrease: "2027-02-01", maxIncreases: 2, dueDates: ["2026-11-01", "2027-09-01", "2028-09-01"] },
  { id: "health", name: "Sağlık sigortası", amount: 12000, share: 50, frequency: "yearly", monthsPerYear: 12, firstDue: "2026-11-01", lastDue: "2028-11-30", paidThrough: "", annualRate: 35, firstIncrease: "2027-02-01", maxIncreases: 2 },
  { id: "course", name: "Kurs / dershane", amount: 20000, share: 100, frequency: "monthly", monthsPerYear: 8, firstDue: "2026-10-01", lastDue: "2029-05-31", paidThrough: "", annualRate: 35, firstIncrease: "2027-10-01", maxIncreases: 2 },
];
