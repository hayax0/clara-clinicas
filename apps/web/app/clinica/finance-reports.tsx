"use client";

import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, Download, Scale,
} from "lucide-react";
import { useCallback, useState } from "react";
import { Empty, ErrorText, LoadError, Loading, Status, useLoad } from "./components";
import { api, dateKey, displayDate, errorMessage, formatMoney, type Organization } from "./data";

type PaymentMethod = "CASH" | "PIX" | "CARD" | "TRANSFER" | "OTHER";
type FinanceType = "INCOME" | "EXPENSE";

type FinanceBreakdown = {
  from: string;
  to: string;
  today: string;
  totals: {
    receivedCents: number;
    paidCents: number;
    netCents: number;
  };
  byPaymentMethod: {
    paymentMethod: PaymentMethod;
    amountCents: number;
    count: number;
    sharePercent: number;
  }[];
  byCategory: {
    categoryId: string | null;
    categoryName: string;
    type: FinanceType;
    totalCents: number;
    count: number;
    sharePercent: number;
  }[];
  byProfessional: {
    professionalId: string | null;
    professionalName: string;
    amountCents: number;
    count: number;
    averageTicketCents: number;
  }[];
  dailyFlow: {
    date: string;
    receivedCents: number;
    paidCents: number;
    netCents: number;
    cashClosed: boolean;
  }[];
  overdue: {
    receivableCents: number;
    receivableCount: number;
    payableCents: number;
    payableCount: number;
    totalCents: number;
    totalCount: number;
    topItems: {
      id: string;
      type: FinanceType;
      description: string;
      amountCents: number;
      dueDate: string;
      daysOverdue: number;
      patientName: string | null;
      categoryName: string | null;
    }[];
  };
};

const paymentLabels: Record<PaymentMethod, string> = {
  PIX: "Pix",
  CARD: "Cartão",
  CASH: "Dinheiro",
  TRANSFER: "Transferência",
  OTHER: "Outro",
};

function percent(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(value / 100);
}

function formatDay(day: string, timezone: string, locale: string) {
  return displayDate(`${day}T12:00:00Z`, timezone, { dateStyle: "short" }, locale);
}

function shiftDays(day: string, deltaDays: number, timezone: string) {
  const base = new Date(`${day}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return dateKey(base, timezone);
}

function previousMonthRange(today: string) {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  const mm = String(prevMonth).padStart(2, "0");
  return {
    from: `${prevYear}-${mm}-01`,
    to: `${prevYear}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function FinanceReportsView({
  organization,
  today,
  onNotice,
}: {
  organization: Organization;
  today: string;
  onNotice: (message: string) => void;
}) {
  const monthStart = `${today.slice(0, 8)}01`;
  const isEn = organization.locale === "en-US";
  const money = (cents: number) => formatMoney(cents, organization.currency, organization.locale);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const root = `/organizations/${organization.id}/finance`;
  const load = useCallback(
    (signal: AbortSignal) =>
      api<FinanceBreakdown>(`${root}/reports/breakdown?from=${from}&to=${to}`, "GET", undefined, signal),
    [root, from, to],
  );
  const { data, error, reload } = useLoad(load);

  const prevMonth = previousMonthRange(today);
  const last30From = shiftDays(today, -29, organization.timezone);

  const activePreset =
    from === monthStart && to === today
      ? "this_month"
      : from === prevMonth.from && to === prevMonth.to
        ? "last_month"
        : from === last30From && to === today
          ? "last_30"
          : "custom";

  function applyPreset(preset: "this_month" | "last_month" | "last_30") {
    if (preset === "this_month") {
      setFrom(monthStart);
      setTo(today);
    } else if (preset === "last_month") {
      setFrom(prevMonth.from);
      setTo(prevMonth.to);
    } else {
      setFrom(last30From);
      setTo(today);
    }
  }

  async function handleExportCsv() {
    setExporting(true);
    setExportError("");
    try {
      const response = await fetch(`/api${root}/reports/export.csv?from=${from}&to=${to}&type=ALL`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => undefined);
        const msg = Array.isArray(payload?.message) ? payload.message.join(" ") : payload?.message;
        throw new Error(typeof msg === "string" ? msg : "Não foi possível exportar o CSV.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? `financeiro-${from}-${to}.csv`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      onNotice("Arquivo CSV exportado com sucesso.");
    } catch (err) {
      setExportError(err instanceof Error ? err.message : errorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{isEn ? "Financial reports" : "Relatórios financeiros"}</h2>
            <p>{isEn ? "Consolidated view by payment method, category, provider, daily flow, and overdue bills." : "Visão consolidada por forma de pagamento, categoria, profissional, fluxo diário e contas vencidas."}</p>
          </div>
          <button className="button primary" onClick={handleExportCsv} disabled={exporting}>
            <Download size={16} />
            {exporting ? (isEn ? "Exporting…" : "Exportando…") : (isEn ? "Export CSV" : "Exportar CSV")}
          </button>
        </div>

        <div className="date-tools" style={{ marginTop: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className={activePreset === "this_month" ? "button primary" : "button ghost"}
              onClick={() => applyPreset("this_month")}
            >
              {isEn ? "This month" : "Este mês"}
            </button>
            <button
              type="button"
              className={activePreset === "last_month" ? "button primary" : "button ghost"}
              onClick={() => applyPreset("last_month")}
            >
              {isEn ? "Last month" : "Mês passado"}
            </button>
            <button
              type="button"
              className={activePreset === "last_30" ? "button primary" : "button ghost"}
              onClick={() => applyPreset("last_30")}
            >
              {isEn ? "Last 30 days" : "Últimos 30 dias"}
            </button>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginLeft: "auto" }}>
            <label className="form-field">
              <span>{isEn ? "From" : "De"}</span>
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label className="form-field">
              <span>{isEn ? "To" : "Até"}</span>
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
          </div>
        </div>
        {exportError && <ErrorText>{exportError}</ErrorText>}
      </section>

      {error ? (
        <div style={{ marginTop: "1rem" }}>
          <LoadError message={error} retry={reload} />
        </div>
      ) : !data ? (
        <Loading label={isEn ? "Loading financial reports…" : "Carregando relatórios financeiros…"} />
      ) : (
        <>
          <div className="metric-grid" style={{ marginTop: "1rem" }}>
            <article className="metric panel">
              <span className="feature-icon"><ArrowDownLeft size={20} /></span>
              <div>
                <p>{isEn ? "Received in period" : "Recebido no período"}</p>
                <strong>{money(data.totals.receivedCents)}</strong>
              </div>
            </article>
            <article className="metric panel">
              <span className="feature-icon"><ArrowUpRight size={20} /></span>
              <div>
                <p>{isEn ? "Paid in period" : "Pago no período"}</p>
                <strong>{money(data.totals.paidCents)}</strong>
              </div>
            </article>
            <article className="metric panel">
              <span className="feature-icon"><Scale size={20} /></span>
              <div>
                <p>{isEn ? "Net cash flow" : "Saldo realizado"}</p>
                <strong>{money(data.totals.netCents)}</strong>
              </div>
            </article>
            <article className="metric panel">
              <span className="feature-icon"><AlertTriangle size={20} /></span>
              <div>
                <p>{isEn ? `Overdue bills (${data.overdue.totalCount})` : `Vencidos em aberto (${data.overdue.totalCount})`}</p>
                <strong>{money(data.overdue.totalCents)}</strong>
              </div>
            </article>
          </div>

          <div className="home-grid">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>{isEn ? "Payment methods" : "Formas de pagamento"}</h2>
                  <p>{isEn ? "Settled receipts by payment method in the selected period." : "Recebimentos liquidados no período por meio de pagamento."}</p>
                </div>
              </div>
              {data.byPaymentMethod.length === 0 ? (
                <Empty>{isEn ? "No settled receipts in the selected period." : "Nenhum recebimento liquidado no período selecionado."}</Empty>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{isEn ? "Method" : "Forma"}</th>
                        <th>{isEn ? "Qty." : "Qtd."}</th>
                        <th>Total</th>
                        <th>{isEn ? "Share" : "Participação"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byPaymentMethod.map((item) => (
                        <tr key={item.paymentMethod}>
                          <td>{isEn ? ({ PIX: "Pix", CARD: "Card", CASH: "Cash", TRANSFER: "Transfer", OTHER: "Other" }[item.paymentMethod] ?? item.paymentMethod) : (paymentLabels[item.paymentMethod] ?? item.paymentMethod)}</td>
                          <td>{item.count}</td>
                          <td>{money(item.amountCents)}</td>
                          <td>{percent(item.sharePercent, organization.locale ?? "pt-BR")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>{isEn ? "Revenue by provider" : "Faturamento por profissional"}</h2>
                  <p>{isEn ? "Settled income linked to each provider." : "Receitas realizadas vinculadas a cada profissional."}</p>
                </div>
              </div>
              {data.byProfessional.length === 0 ? (
                <Empty>{isEn ? "No settled revenue in the selected period." : "Nenhum faturamento realizado no período selecionado."}</Empty>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{isEn ? "Provider" : "Profissional"}</th>
                        <th>{isEn ? "Visits" : "Atendimentos"}</th>
                        <th>{isEn ? "Total revenue" : "Total faturado"}</th>
                        <th>{isEn ? "Avg. ticket" : "Ticket médio"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byProfessional.map((item) => (
                        <tr key={item.professionalId ?? "none"}>
                          <td>{item.professionalName}</td>
                          <td>{item.count}</td>
                          <td>{money(item.amountCents)}</td>
                          <td>{money(item.averageTicketCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <div className="home-grid">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>{isEn ? "Income & expenses by category" : "Receitas e despesas por categoria"}</h2>
                  <p>{isEn ? "Percentage share relative to total income or expenses." : "Participação percentual relativa ao total de entradas ou saídas."}</p>
                </div>
              </div>
              {data.byCategory.length === 0 ? (
                <Empty>{isEn ? "No settled entries by category in this period." : "Nenhum lançamento liquidado por categoria neste período."}</Empty>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{isEn ? "Category" : "Categoria"}</th>
                        <th>{isEn ? "Type" : "Tipo"}</th>
                        <th>{isEn ? "Qty." : "Qtd."}</th>
                        <th>Total</th>
                        <th>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byCategory.map((item) => (
                        <tr key={`${item.type}-${item.categoryId ?? "none"}`}>
                          <td>{item.categoryName}</td>
                          <td>{item.type === "INCOME" ? (isEn ? "Income" : "Receita") : (isEn ? "Expense" : "Despesa")}</td>
                          <td>{item.count}</td>
                          <td>{money(item.totalCents)}</td>
                          <td>{percent(item.sharePercent, organization.locale ?? "pt-BR")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>{isEn ? "Overdue bills" : "Contas vencidas em aberto"}</h2>
                  <p>
                    {isEn ? "Receivable:" : "A receber:"} {money(data.overdue.receivableCents)} ({data.overdue.receivableCount}) · {isEn ? "Payable:" : "A pagar:"}{" "}
                    {money(data.overdue.payableCents)} ({data.overdue.payableCount})
                  </p>
                </div>
                {data.overdue.totalCount > 0 ? (
                  <Status status="CANCELLED">{data.overdue.totalCount} {isEn ? "overdue" : "em atraso"}</Status>
                ) : (
                  <Status status="CONFIRMED">{isEn ? "Up to date" : "Em dia"}</Status>
                )}
              </div>
              {data.overdue.topItems.length === 0 ? (
                <Empty>{isEn ? "No overdue bills up to today." : "Nenhuma conta vencida em aberto até hoje."}</Empty>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{isEn ? "Description" : "Título"}</th>
                        <th>{isEn ? "Type" : "Tipo"}</th>
                        <th>{isEn ? "Due date" : "Vencimento"}</th>
                        <th>{isEn ? "Overdue" : "Atraso"}</th>
                        <th>{isEn ? "Amount" : "Valor"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.overdue.topItems.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.description}</strong>
                            {item.patientName && (
                              <div className="subtle" style={{ fontSize: "0.82rem" }}>{item.patientName}</div>
                            )}
                          </td>
                          <td>{item.type === "INCOME" ? (isEn ? "Receivable" : "Receber") : (isEn ? "Payable" : "Pagar")}</td>
                          <td>{formatDay(item.dueDate, organization.timezone, organization.locale ?? "pt-BR")}</td>
                          <td>{item.daysOverdue} {isEn ? (item.daysOverdue === 1 ? "day" : "days") : (item.daysOverdue === 1 ? "dia" : "dias")}</td>
                          <td>{money(item.amountCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <section className="panel" style={{ marginTop: "1rem" }}>
            <div className="panel-heading">
              <div>
                <h2>{isEn ? "Daily cash flow" : "Extrato diário"}</h2>
                <p>{isEn ? "Day-by-day inflows, outflows, and net balance in the period." : "Evolução diária de entradas, saídas e saldo realizado no período."}</p>
              </div>
            </div>
            {data.dailyFlow.length === 0 ? (
              <Empty>{isEn ? "No cash movements recorded in this period." : "Nenhuma movimentação de caixa registrada neste período."}</Empty>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{isEn ? "Date" : "Data"}</th>
                      <th>{isEn ? "Inflows" : "Entradas"}</th>
                      <th>{isEn ? "Outflows" : "Saídas"}</th>
                      <th>{isEn ? "Daily net" : "Saldo do dia"}</th>
                      <th>{isEn ? "Cash status" : "Caixa"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dailyFlow.map((day) => (
                      <tr key={day.date}>
                        <td>{formatDay(day.date, organization.timezone, organization.locale ?? "pt-BR")}</td>
                        <td>{money(day.receivedCents)}</td>
                        <td>{money(day.paidCents)}</td>
                        <td><strong>{money(day.netCents)}</strong></td>
                        <td>
                          {day.cashClosed ? (
                            <Status status="CONFIRMED">{isEn ? "Closed" : "Fechado"}</Status>
                          ) : (
                            <Status status="SCHEDULED">{isEn ? "Open" : "Aberto"}</Status>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
