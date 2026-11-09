import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import "./ProfitLoss.css";

type LedgerType = "income" | "expense";

type LedgerEntry = {
  id: string;
  type: LedgerType;
  description: string;
  amount: number;
  date: string;
};

type LedgerState = {
  entries: LedgerEntry[];
  error: string;
  storageKey: string;
};

type MonthlyTotals = {
  month: string;
  income: number;
  expenses: number;
  profit: number;
};

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentMonthString(date = new Date()) {
  return localDateString(date).slice(0, 7);
}

function getStorageKey() {
  const user = JSON.parse(localStorage.getItem("agrigoUser") || "{}") as {
    userId?: string | number;
  };
  if (user.userId === undefined || user.userId === null || user.userId === "") {
    throw new Error("Your account ID is missing. Sign in again to open your ledger.");
  }
  return `agrigo:profit-loss:${user.userId}`;
}

function isLedgerEntry(value: unknown): value is LedgerEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<LedgerEntry>;
  return (
    typeof entry.id === "string" &&
    (entry.type === "income" || entry.type === "expense") &&
    typeof entry.description === "string" &&
    typeof entry.amount === "number" &&
    Number.isFinite(entry.amount) &&
    entry.amount > 0 &&
    typeof entry.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(entry.date)
  );
}

function loadLedger(): LedgerState {
  try {
    const storageKey = getStorageKey();
    const saved = localStorage.getItem(storageKey);
    if (!saved) return { entries: [], error: "", storageKey };

    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed) || !parsed.every(isLedgerEntry)) {
      throw new Error("Saved ledger data is invalid. Your entries were not changed.");
    }
    return { entries: parsed, error: "", storageKey };
  } catch (error) {
    return {
      entries: [],
      error:
        error instanceof Error
          ? error.message
          : "Unable to load your ledger from this browser.",
      storageKey: "",
    };
  }
}

function formatCurrency(value: number, compact = false) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
    notation: compact ? "compact" : "standard",
  }).format(value);
}

function monthLabel(month: string, options: Intl.DateTimeFormatOptions = {
  month: "short",
  year: "2-digit",
}) {
  return new Intl.DateTimeFormat("en-IN", options).format(
    new Date(`${month}-01T00:00:00`),
  );
}

function getMonthsEndingAt(endMonth: string): string[] {
  const [year, month] = endMonth.split("-").map(Number);
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(year, month - 1 - (5 - index), 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

function MonthlyPerformanceChart({ data }: { data: MonthlyTotals[] }) {
  const width = 760;
  const height = 300;
  const plot = { left: 74, right: 744, top: 24, bottom: 230 };
  const values = data.flatMap((month) => [
    month.income,
    month.expenses,
    month.profit,
  ]);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(1, ...values);
  const range = maximum - minimum || 1;
  const y = (value: number) =>
    plot.top + ((maximum - value) / range) * (plot.bottom - plot.top);
  const zeroY = y(0);
  const groupWidth = (plot.right - plot.left) / data.length;
  const barWidth = Math.min(18, groupWidth / 5);
  const series: {
    key: keyof Pick<MonthlyTotals, "income" | "expenses" | "profit">;
    label: string;
    color: string;
  }[] = [
    { key: "income", label: "Income", color: "#2f7b50" },
    { key: "expenses", label: "Expenses", color: "#e5a84b" },
    { key: "profit", label: "Net profit", color: "#5179bb" },
  ];

  return (
    <div className="profit-chart">
      <div className="profit-chart__legend" aria-label="Chart legend">
        {series.map((item) => (
          <span key={item.key}>
            <i style={{ backgroundColor: item.color }} aria-hidden="true" />
            {item.label}
          </span>
        ))}
      </div>
      <div className="profit-chart__scroll">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Bar chart comparing monthly income, expenses, and net profit for the last six months"
        >
          {[0, 1, 2, 3].map((step) => {
            const value = maximum - (range * step) / 3;
            const lineY = y(value);
            return (
              <g key={step}>
                <line
                  x1={plot.left}
                  x2={plot.right}
                  y1={lineY}
                  y2={lineY}
                  className={Math.abs(value) < range / 1000 ? "profit-chart__zero" : ""}
                />
                <text x={plot.left - 10} y={lineY + 4} textAnchor="end">
                  {formatCurrency(value, true)}
                </text>
              </g>
            );
          })}
          {data.map((month, index) => {
            const center = plot.left + groupWidth * (index + 0.5);
            return (
              <g key={month.month}>
                {series.map((item, seriesIndex) => {
                  const value = month[item.key];
                  const valueY = y(value);
                  const barX = center + (seriesIndex - 1) * (barWidth + 5) - barWidth / 2;
                  return (
                    <rect
                      key={item.key}
                      x={barX}
                      y={Math.min(valueY, zeroY)}
                      width={barWidth}
                      height={Math.max(1, Math.abs(zeroY - valueY))}
                      rx="3"
                      fill={item.color}
                    >
                      <title>
                        {monthLabel(month.month, { month: "long", year: "numeric" })} · {item.label}: {formatCurrency(value)}
                      </title>
                    </rect>
                  );
                })}
                <text
                  className="profit-chart__month"
                  x={center}
                  y={plot.bottom + 25}
                  textAnchor="middle"
                >
                  {monthLabel(month.month)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="profit-chart__note">
        Net profit is recorded income minus recorded expenses. Negative values indicate a loss.
      </p>
    </div>
  );
}

function ProfitLoss() {
  const [ledger, setLedger] = useState<LedgerState>(loadLedger);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthString);
  const [type, setType] = useState<LedgerType>("expense");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localDateString);

  const monthlyData = useMemo(() => {
    const months = getMonthsEndingAt(selectedMonth);
    return months.map((month) => {
      const monthEntries = ledger.entries.filter((entry) => entry.date.startsWith(month));
      const income = monthEntries
        .filter((entry) => entry.type === "income")
        .reduce((total, entry) => total + entry.amount, 0);
      const expenses = monthEntries
        .filter((entry) => entry.type === "expense")
        .reduce((total, entry) => total + entry.amount, 0);
      return { month, income, expenses, profit: income - expenses };
    });
  }, [ledger.entries, selectedMonth]);

  const selectedTotals = monthlyData[monthlyData.length - 1];
  const selectedEntries = useMemo(
    () =>
      ledger.entries
        .filter((entry) => entry.date.startsWith(selectedMonth))
        .sort((left, right) => right.date.localeCompare(left.date)),
    [ledger.entries, selectedMonth],
  );

  function persistEntries(entries: LedgerEntry[]) {
    try {
      if (!ledger.storageKey) {
        throw new Error("Your ledger is unavailable. Sign in again to continue.");
      }
      localStorage.setItem(ledger.storageKey, JSON.stringify(entries));
      setLedger({ ...ledger, entries, error: "" });
      return true;
    } catch (error) {
      setLedger({
        ...ledger,
        error: error instanceof Error ? error.message : "Unable to save your ledger entry.",
      });
      return false;
    }
  }

  function addEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!description.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setLedger({ ...ledger, error: "Enter a description and an amount greater than zero." });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setLedger({ ...ledger, error: "Choose a valid transaction date." });
      return;
    }

    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (
      persistEntries([
        ...ledger.entries,
        { id, type, description: description.trim(), amount: parsedAmount, date },
      ])
    ) {
      setDescription("");
      setAmount("");
    }
  }

  function removeEntry(id: string) {
    persistEntries(ledger.entries.filter((entry) => entry.id !== id));
  }

  return (
    <main className="profit-loss-page">
      <div className="profit-loss-container">
        <header className="profit-loss-header">
          <div>
            <Link to="/farmer-dashboard" className="profit-loss-back">
              ← Farmer workspace
            </Link>
            <p className="profit-loss-eyebrow">FARM FINANCIALS</p>
            <h1>Profit &amp; loss</h1>
            <p>Track farm income and expenses to understand your monthly performance.</p>
          </div>
          <label className="profit-month-picker">
            <span>Report month</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) =>
                setSelectedMonth(event.target.value || currentMonthString())
              }
            />
          </label>
        </header>

        {ledger.error && (
          <p className="profit-alert" role="alert">
            {ledger.error}
          </p>
        )}

        <section className="profit-summary" aria-label={`${monthLabel(selectedMonth, { month: "long", year: "numeric" })} summary`}>
          <article className="profit-summary-card profit-summary-card--net">
            <span>Net {selectedTotals.profit >= 0 ? "profit" : "loss"}</span>
            <strong>{formatCurrency(Math.abs(selectedTotals.profit))}</strong>
            <small>{monthLabel(selectedMonth, { month: "long", year: "numeric" })}</small>
          </article>
          <article className="profit-summary-card">
            <span>Income recorded</span>
            <strong>{formatCurrency(selectedTotals.income)}</strong>
            <small>Sales and other farm income</small>
          </article>
          <article className="profit-summary-card">
            <span>Expenses recorded</span>
            <strong>{formatCurrency(selectedTotals.expenses)}</strong>
            <small>Inputs, labor, transport and more</small>
          </article>
        </section>

        <section className="profit-panel" aria-labelledby="profit-chart-title">
          <div className="profit-panel__heading">
            <div>
              <p>PERFORMANCE OVER TIME</p>
              <h2 id="profit-chart-title">Monthly income, expenses &amp; profit</h2>
            </div>
            <span>6-month view</span>
          </div>
          <MonthlyPerformanceChart data={monthlyData} />
        </section>

        <div className="profit-content-grid">
          <section className="profit-panel profit-entry-panel" aria-labelledby="profit-entry-title">
            <div className="profit-panel__heading">
              <div>
                <p>KEEP YOUR RECORDS CURRENT</p>
                <h2 id="profit-entry-title">Add a transaction</h2>
              </div>
            </div>
            <form className="profit-entry-form" onSubmit={addEntry}>
              <label>
                Transaction type
                <select value={type} onChange={(event) => setType(event.target.value as LedgerType)}>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </label>
              <label>
                Description
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={type === "expense" ? "e.g. Seeds and fertilizer" : "e.g. Tomato sale"}
                  maxLength={100}
                  required
                />
              </label>
              <div className="profit-entry-form__row">
                <label>
                  Amount (₹)
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0.00"
                    required
                  />
                </label>
                <label>
                  Date
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    required
                  />
                </label>
              </div>
              <button type="submit" disabled={!ledger.storageKey}>
                Add {type}
              </button>
              <p>Entries are saved privately in this browser for your account.</p>
            </form>
          </section>

          <section className="profit-panel profit-transactions" aria-labelledby="profit-transactions-title">
            <div className="profit-panel__heading">
              <div>
                <p>{monthLabel(selectedMonth, { month: "long", year: "numeric" }).toUpperCase()}</p>
                <h2 id="profit-transactions-title">Transactions</h2>
              </div>
              <span>{selectedEntries.length} entries</span>
            </div>
            {selectedEntries.length ? (
              <ul>
                {selectedEntries.map((entry) => (
                  <li key={entry.id}>
                    <div className={`profit-transaction-icon profit-transaction-icon--${entry.type}`} aria-hidden="true">
                      {entry.type === "income" ? "+" : "−"}
                    </div>
                    <div className="profit-transaction-info">
                      <strong>{entry.description}</strong>
                      <span>{new Date(`${entry.date}T00:00:00`).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}</span>
                    </div>
                    <strong className={`profit-transaction-amount profit-transaction-amount--${entry.type}`}>
                      {entry.type === "income" ? "+" : "−"}{formatCurrency(entry.amount)}
                    </strong>
                    <button
                      type="button"
                      onClick={() => removeEntry(entry.id)}
                      aria-label={`Delete ${entry.description}`}
                      title="Delete transaction"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="profit-empty-state">
                <span aria-hidden="true">₹</span>
                <strong>No transactions for this month</strong>
                <p>Add your first income or expense to see your farm’s financial picture.</p>
              </div>
            )}
          </section>
        </div>

        <p className="profit-disclaimer">
          This is a record-keeping estimate based on entries you provide, not audited accounting or tax advice.
        </p>
      </div>
    </main>
  );
}

export default ProfitLoss;
