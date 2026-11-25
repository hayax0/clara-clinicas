"use client";

import {
  ArrowDownLeft, ArrowUpRight, CheckCircle2, Lock, Pencil, Plus, RotateCcw, Scale, Wallet, XCircle,
} from "lucide-react";
import { type FormEvent, useCallback, useState } from "react";
import { Dialog, Empty, ErrorText, LoadError, Loading, PageHeading, Status, useLoad } from "./components";
import { api, dateKey, displayDate, errorMessage, formatMoney, parseLocaleMoneyToCents, type Organization, type Role, type Row } from "./data";
import { FinanceReportsView } from "./finance-reports";
import { PackagesView } from "./packages";
import { Segments } from "./sections";

type FinanceType = "INCOME" | "EXPENSE";
type FinanceStatus = "PENDING" | "PAID" | "CANCELLED";
type PaymentMethod = "CASH" | "PIX" | "CARD" | "TRANSFER" | "OTHER";

type FinanceCategory = {
  id: string;
  name: string;
  type: FinanceType;
  active: boolean;
  createdAt: string;
};

type FinanceEntry = {
  id: string;
  type: FinanceType;
  status: FinanceStatus;
  description: string;
  amountCents: number;
  dueDate: string;
  settledDate: string | null;
  settledAt: string | null;
  paymentMethod: PaymentMethod | null;
  categoryId: string | null;
  patientId: string | null;
  professionalId: string | null;
  notes: string | null;
  reconciledAt: string | null;
  category: { id: string; name: string; type: FinanceType } | null;
  patient: { id: string; name: string } | null;
  professional: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  settledBy: { id: string; name: string } | null;
  reconciledBy: { id: string; name: string } | null;
};

type FinanceSummary = {
  from: string;
  to: string;
  today: string;
  receivedCents: number;
  paidCents: number;
  netCents: number;
  receivableOpenCents: number;
  payableOpenCents: number;
  overdueReceivableCents: number;
  overduePayableCents: number;
  unreconciledCount: number;
  closedDaysCount: number;
  byCategory: {
    categoryId: string | null;
    categoryName: string;
    type: FinanceType;
    totalCents: number;
    count: number;
  }[];
};

type CashClosing = {
  id: string;
  closingDate: string;
  status: "CLOSED" | "REOPENED";
  receivedCents: number;
  paidCents: number;
  netCents: number;
  reconciledCount: number;
  notes: string | null;
  closedAt: string;
  reopenedAt: string | null;
  reopenReason: string | null;
  closedBy: { id: string; name: string };
  reopenedBy: { id: string; name: string } | null;
};

const paymentLabels: Record<PaymentMethod, string> = {
  PIX: "Pix",
  CARD: "Cartão",
  CASH: "Dinheiro",
  TRANSFER: "Transferência",
  OTHER: "Outro",
};

function formatDay(day: string, timezone: string, locale: string) {
  return displayDate(`${day}T12:00:00Z`, timezone, { dateStyle: "short" }, locale);
}

export function Finance({
  organization,
  role,
  onNotice,
}: {
  organization: Organization;
  role: Role;
  onNotice: (message: string) => void;
}) {
  const [tab, setTab] = useState<"summary" | "entries" | "packages" | "reports" | "closings" | "categories">("summary");
  const isEn = organization.locale === "en-US";
  const canManage = role === "OWNER" || role === "MANAGER";
  const isOwner = role === "OWNER";
  const today = dateKey(new Date(), organization.timezone);
  const monthStart = `${today.slice(0, 8)}01`;

  return (
    <>
      <PageHeading
        title={isEn ? "Finance" : "Financeiro"}
        description={
          isEn
            ? "Track accounts receivable, accounts payable, session packages, reports, reconciliation, and daily cash closings."
            : "Acompanhe contas a receber, contas a pagar, pacotes de sessões, relatórios, conferência e fechamento de caixa."
        }
      />
      <Segments
        label={isEn ? "Finance sections" : "Áreas do financeiro"}
        options={[
          { id: "summary", name: isEn ? "Summary" : "Resumo" },
          { id: "entries", name: isEn ? "Entries" : "Lançamentos" },
          { id: "packages", name: isEn ? "Packages" : "Pacotes" },
          { id: "reports", name: isEn ? "Reports" : "Relatórios" },
          { id: "closings", name: isEn ? "Cash closing" : "Fechamento de caixa" },
          { id: "categories", name: isEn ? "Categories" : "Categorias" },
        ]}
        selected={tab}
        onSelect={setTab}
      />
      {tab === "summary" && (
        <FinanceSummaryView
          organization={organization}
          initialFrom={monthStart}
          initialTo={today}
          onGoToEntries={() => setTab("entries")}
        />
      )}
      {tab === "entries" && (
        <FinanceEntriesView
          organization={organization}
          today={today}
          canManage={canManage}
          onNotice={onNotice}
        />
      )}
      {tab === "packages" && (
        <PackagesView
          organization={organization}
          today={today}
          canManage={canManage}
          onNotice={onNotice}
        />
      )}
      {tab === "reports" && (
        <FinanceReportsView
          organization={organization}
          today={today}
          onNotice={onNotice}
        />
      )}
      {tab === "closings" && (
        <CashClosingsView
          organization={organization}
          today={today}
          canManage={canManage}
          isOwner={isOwner}
          onNotice={onNotice}
        />
      )}
      {tab === "categories" && (
        <FinanceCategoriesView
          organization={organization}
          canManage={canManage}
          onNotice={onNotice}
        />
      )}
    </>
  );
}

function FinanceSummaryView({
  organization,
  initialFrom,
  initialTo,
  onGoToEntries,
}: {
  organization: Organization;
  initialFrom: string;
  initialTo: string;
  onGoToEntries: () => void;
}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const isEn = organization.locale === "en-US";
  const money = (cents: number) => formatMoney(cents, organization.currency, organization.locale);
  const root = `/organizations/${organization.id}/finance`;
  const load = useCallback(
    (signal: AbortSignal) => api<FinanceSummary>(`${root}/summary?from=${from}&to=${to}`, "GET", undefined, signal),
    [root, from, to],
  );
  const { data, error, reload } = useLoad(load);

  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{isEn ? "Financial overview" : "Visão financeira do período"}</h2>
            <p>{isEn ? "Manual records managed by your clinic team, with no automatic bank clearing." : "Registros manuais da equipe da clínica, sem cobrança ou compensação bancária automática."}</p>
          </div>
          <div className="date-tools">
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
      </section>

      {error ? (
        <div style={{ marginTop: "1rem" }}>
          <LoadError message={error} retry={reload} />
        </div>
      ) : !data ? (
        <Loading label={isEn ? "Loading financial summary…" : "Carregando resumo financeiro…"} />
      ) : (
        <>
          <div className="metric-grid" style={{ marginTop: "1rem" }}>
            <article className="metric panel">
              <span className="feature-icon"><ArrowDownLeft size={20} /></span>
              <div>
                <p>{isEn ? "Received in period" : "Recebido no período"}</p>
                <strong>{money(data.receivedCents)}</strong>
              </div>
            </article>
            <article className="metric panel">
              <span className="feature-icon"><ArrowUpRight size={20} /></span>
              <div>
                <p>{isEn ? "Paid in period" : "Pago no período"}</p>
                <strong>{money(data.paidCents)}</strong>
              </div>
            </article>
            <article className="metric panel">
              <span className="feature-icon"><Scale size={20} /></span>
              <div>
                <p>{isEn ? "Net cash flow" : "Saldo realizado"}</p>
                <strong>{money(data.netCents)}</strong>
              </div>
            </article>
            <article className="metric panel">
              <span className="feature-icon"><Wallet size={20} /></span>
              <div>
                <p>{isEn ? "Open (receivable / payable)" : "Em aberto (receber / pagar)"}</p>
                <strong style={{ fontSize: "1.18rem" }}>
                  {money(data.receivableOpenCents)} / {money(data.payableOpenCents)}
                </strong>
              </div>
            </article>
          </div>

          <div className="home-grid">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>{isEn ? "Settled by category" : "Realizado por categoria"}</h2>
                  <p>{isEn ? "Income and expenses settled during the selected period." : "Entradas e saídas com baixa registrada no período."}</p>
                </div>
                <button className="button ghost" onClick={onGoToEntries}>{isEn ? "View entries" : "Ver lançamentos"}</button>
              </div>
              {data.byCategory.length === 0 ? (
                <Empty>{isEn ? "No receipts or payments recorded in this period." : "Nenhum recebimento ou pagamento registrado no período."}</Empty>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{isEn ? "Category" : "Categoria"}</th>
                        <th>{isEn ? "Type" : "Tipo"}</th>
                        <th>{isEn ? "Qty." : "Qtd."}</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byCategory.map((item) => (
                        <tr key={`${item.type}-${item.categoryId ?? "none"}`}>
                          <td>{item.categoryName}</td>
                          <td>{item.type === "INCOME" ? (isEn ? "Income" : "Receita") : (isEn ? "Expense" : "Despesa")}</td>
                          <td>{item.count}</td>
                          <td>{money(item.totalCents)}</td>
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
                  <h2>{isEn ? "Attention points" : "Pontos de atenção"}</h2>
                  <p>{isEn ? "Pending reconciliations and overdue bills." : "Pendências de conferência e vencimentos em atraso."}</p>
                </div>
              </div>
              <ul className="task-list">
                <li>
                  <span className="task-mark" />
                  <div>
                    <strong>{isEn ? "Pending reconciliation" : "Aguardando conferência"}</strong>
                    <small>{isEn ? `${data.unreconciledCount} settled entry(ies) in period` : `${data.unreconciledCount} lançamento(s) liquidado(s) no período`}</small>
                  </div>
                </li>
                <li>
                  <span className="task-mark" />
                  <div>
                    <strong>{isEn ? "Overdue receivables" : "A receber vencido"}</strong>
                    <small>{isEn ? `${money(data.overdueReceivableCents)} open before today` : `${money(data.overdueReceivableCents)} em aberto antes de hoje`}</small>
                  </div>
                </li>
                <li>
                  <span className="task-mark" />
                  <div>
                    <strong>{isEn ? "Overdue payables" : "A pagar vencido"}</strong>
                    <small>{isEn ? `${money(data.overduePayableCents)} open before today` : `${money(data.overduePayableCents)} em aberto antes de hoje`}</small>
                  </div>
                </li>
                <li>
                  <span className="task-mark" />
                  <div>
                    <strong>{isEn ? "Closed cash days" : "Caixas fechados no período"}</strong>
                    <small>{isEn ? `${data.closedDaysCount} day(s) reconciled and closed` : `${data.closedDaysCount} dia(s) conferido(s) e fechado(s)`}</small>
                  </div>
                </li>
              </ul>
            </section>
          </div>
        </>
      )}
    </>
  );
}

function FinanceEntriesView({
  organization,
  today,
  canManage,
  onNotice,
}: {
  organization: Organization;
  today: string;
  canManage: boolean;
  onNotice: (message: string) => void;
}) {
  const isEn = organization.locale === "en-US";
  const money = (cents: number) => formatMoney(cents, organization.currency, organization.locale);
  const root = `/organizations/${organization.id}`;
  const [typeFilter, setTypeFilter] = useState<"" | FinanceType>("");
  const [statusFilter, setStatusFilter] = useState<"" | FinanceStatus>("");
  const [editor, setEditor] = useState<FinanceEntry | "new" | undefined>();
  const [entryType, setEntryType] = useState<FinanceType>("INCOME");
  const [settling, setSettling] = useState<FinanceEntry | undefined>();
  const [cancelling, setCancelling] = useState<FinanceEntry | undefined>();
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async (signal: AbortSignal) => {
    const query = new URLSearchParams();
    if (typeFilter) query.set("type", typeFilter);
    if (statusFilter) query.set("status", statusFilter);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const [entries, categories, patients, professionals] = await Promise.all([
      api<FinanceEntry[]>(`${root}/finance/entries${suffix}`, "GET", undefined, signal),
      api<FinanceCategory[]>(`${root}/finance/categories`, "GET", undefined, signal),
      api<Row[]>(`${root}/patients`, "GET", undefined, signal),
      api<Row[]>(`${root}/professionals`, "GET", undefined, signal),
    ]);
    return { entries, categories, patients, professionals };
  }, [root, typeFilter, statusFilter]);

  const { data, error, reload } = useLoad(load);

  function openNew(initialType: FinanceType = "INCOME") {
    setActionError("");
    setEntryType(initialType);
    setEditor("new");
  }

  function openEdit(entry: FinanceEntry) {
    setActionError("");
    setEntryType(entry.type);
    setEditor(entry);
  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || pending) return;
    const form = new FormData(event.currentTarget);
    const amountCents = parseLocaleMoneyToCents(String(form.get("amount") ?? ""), organization.locale ?? "pt-BR");
    if (amountCents <= 0) {
      setActionError("Informe um valor maior que zero.");
      return;
    }
    setPending(true);
    setActionError("");
    try {
      const payload = {
        ...(editor === "new" && { type: entryType }),
        description: String(form.get("description") ?? "").trim(),
        amountCents,
        dueDate: String(form.get("dueDate") ?? ""),
        categoryId: String(form.get("categoryId") ?? ""),
        patientId: String(form.get("patientId") ?? ""),
        professionalId: String(form.get("professionalId") ?? ""),
        notes: String(form.get("notes") ?? "").trim(),
      };
      if (editor === "new") {
        await api(`${root}/finance/entries`, "POST", payload);
        onNotice("Lançamento registrado.");
      } else {
        await api(`${root}/finance/entries/${editor.id}`, "PATCH", payload);
        onNotice("Lançamento atualizado.");
      }
      setEditor(undefined);
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function settleEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settling || pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setActionError("");
    try {
      await api(`${root}/finance/entries/${settling.id}/settle`, "POST", {
        settledDate: String(form.get("settledDate") ?? ""),
        paymentMethod: String(form.get("paymentMethod") ?? "PIX"),
        notes: String(form.get("notes") ?? "").trim(),
      });
      setSettling(undefined);
      onNotice(settling.type === "INCOME" ? "Recebimento registrado." : "Pagamento registrado.");
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function reconcileEntry(entry: FinanceEntry) {
    if (pending) return;
    setPending(true);
    setActionError("");
    try {
      await api(`${root}/finance/entries/${entry.id}/reconcile`, "POST", {});
      onNotice("Lançamento conferido e reconciliado.");
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function cancelEntry() {
    if (!cancelling || pending) return;
    setPending(true);
    setActionError("");
    try {
      await api(`${root}/finance/entries/${cancelling.id}/cancel`, "POST", {});
      setCancelling(undefined);
      onNotice("Lançamento cancelado.");
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const activeCategories = (data?.categories ?? []).filter((cat) => cat.active && cat.type === entryType);
  const editingRow = editor === "new" ? undefined : editor;

  return (
    <>
      <section className="panel records">
        <div className="panel-heading records-heading">
          <div>
            <h2>Contas a receber e a pagar</h2>
            <p>Lance, registre baixas manuais e faça a conferência antes de fechar o caixa.</p>
          </div>
          <div className="heading-actions">
            <button className="button secondary" onClick={() => openNew("EXPENSE")}>
              <Plus size={17} /> Nova despesa
            </button>
            <button className="button primary" onClick={() => openNew("INCOME")}>
              <Plus size={17} /> Nova receita
            </button>
          </div>
        </div>

        <div className="record-tools">
          <div className="date-tools">
            <select
              aria-label="Filtrar por tipo"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as "" | FinanceType)}
              className="finance-filter"
            >
              <option value="">Todos os tipos</option>
              <option value="INCOME">Contas a receber</option>
              <option value="EXPENSE">Contas a pagar</option>
            </select>
            <select
              aria-label="Filtrar por situação"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "" | FinanceStatus)}
              className="finance-filter"
            >
              <option value="">Todas as situações</option>
              <option value="PENDING">Em aberto</option>
              <option value="PAID">Recebidos / Pagos</option>
              <option value="CANCELLED">Cancelados</option>
            </select>
          </div>
        </div>

        {actionError && !editor && !settling && !cancelling && (
          <div style={{ padding: "0 1.2rem .8rem" }}>
            <ErrorText>{actionError}</ErrorText>
          </div>
        )}

        {error ? (
          <LoadError message={error} retry={reload} />
        ) : !data ? (
          <Loading />
        ) : data.entries.length === 0 ? (
          <Empty>Nenhum lançamento encontrado para os filtros selecionados.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Tipo</th>
                  <th>Vencimento</th>
                  <th>Categoria</th>
                  <th>Valor</th>
                  <th>Situação</th>
                  <th className="table-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => {
                  const statusCode =
                    entry.status === "CANCELLED"
                      ? "CANCELLED"
                      : entry.status === "PAID"
                        ? entry.reconciledAt
                          ? "CONFIRMED"
                          : "BOOKED"
                        : "SCHEDULED";
                  const statusLabel =
                    entry.status === "CANCELLED"
                      ? "Cancelado"
                      : entry.status === "PAID"
                        ? entry.reconciledAt
                          ? "Conferido"
                          : entry.type === "INCOME"
                            ? "Recebido"
                            : "Pago"
                        : "Em aberto";

                  return (
                    <tr key={entry.id}>
                      <td>
                        <div>{entry.description}</div>
                        <small style={{ color: "var(--subtle)", fontWeight: 400 }}>
                          {[
                            entry.patient?.name,
                            entry.professional?.name,
                            entry.paymentMethod ? paymentLabels[entry.paymentMethod] : null,
                            entry.settledDate ? `Caixa ${formatDay(entry.settledDate, organization.timezone, organization.locale ?? "pt-BR")}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </td>
                      <td>{entry.type === "INCOME" ? "Receita" : "Despesa"}</td>
                      <td>{formatDay(entry.dueDate, organization.timezone, organization.locale ?? "pt-BR")}</td>
                      <td>{entry.category?.name ?? "—"}</td>
                      <td style={{ fontVariantNumeric: "tabular-nums" }}>{money(entry.amountCents)}</td>
                      <td>
                        <Status status={statusCode}>{statusLabel}</Status>
                      </td>
                      <td className="table-actions">
                        {entry.status === "PENDING" && (
                          <>
                            <button
                              className="button secondary compact"
                              disabled={pending}
                              onClick={() => {
                                setActionError("");
                                setSettling(entry);
                              }}
                            >
                              {entry.type === "INCOME" ? "Receber" : "Pagar"}
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Editar ${entry.description}`}
                              disabled={pending}
                              onClick={() => openEdit(entry)}
                            >
                              <Pencil size={16} />
                            </button>
                            {canManage && (
                              <button
                                className="icon-button danger-icon"
                                aria-label={`Cancelar ${entry.description}`}
                                disabled={pending}
                                onClick={() => {
                                  setActionError("");
                                  setCancelling(entry);
                                }}
                              >
                                <XCircle size={16} />
                              </button>
                            )}
                          </>
                        )}
                        {entry.status === "PAID" && !entry.reconciledAt && canManage && (
                          <button
                            className="button primary compact"
                            disabled={pending}
                            onClick={() => void reconcileEntry(entry)}
                          >
                            <CheckCircle2 size={15} /> Conferir
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editor && (
        <Dialog
          title={editor === "new" ? (entryType === "INCOME" ? "Nova conta a receber" : "Nova conta a pagar") : "Editar lançamento"}
          busy={pending}
          onClose={() => setEditor(undefined)}
        >
          <form className="form-stack" onSubmit={saveEntry}>
            {editor === "new" && (
              <label className="form-field">
                <span>Tipo</span>
                <select value={entryType} onChange={(event) => setEntryType(event.target.value as FinanceType)}>
                  <option value="INCOME">Conta a receber (Receita)</option>
                  <option value="EXPENSE">Conta a pagar (Despesa)</option>
                </select>
              </label>
            )}
            <label className="form-field">
              <span>Descrição</span>
              <input
                name="description"
                required
                minLength={2}
                maxLength={160}
                defaultValue={editingRow?.description ?? ""}
                placeholder={entryType === "INCOME" ? "Ex. Consulta particular" : "Ex. Aluguel da sala"}
              />
            </label>
            <label className="form-field">
              <span>{isEn ? "Amount" : "Valor"} ({organization.currency ?? "BRL"})</span>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                defaultValue={editingRow ? (editingRow.amountCents / 100).toFixed(2) : ""}
              />
            </label>
            <label className="form-field">
              <span>Vencimento</span>
              <input name="dueDate" type="date" required defaultValue={editingRow?.dueDate ?? today} />
            </label>
            <label className="form-field">
              <span>Categoria</span>
              <select name="categoryId" defaultValue={editingRow?.categoryId ?? ""}>
                <option value="">Sem categoria</option>
                {activeCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            {entryType === "INCOME" && (
              <label className="form-field">
                <span>Paciente (opcional)</span>
                <select name="patientId" defaultValue={editingRow?.patientId ?? ""}>
                  <option value="">Não vinculado</option>
                  {(data?.patients ?? []).map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {String(patient.name)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="form-field">
              <span>Profissional (opcional)</span>
              <select name="professionalId" defaultValue={editingRow?.professionalId ?? ""}>
                <option value="">Não vinculado</option>
                {(data?.professionals ?? []).map((professional) => (
                  <option key={professional.id} value={professional.id}>
                    {String(professional.name)}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Observações (opcional)</span>
              <textarea name="notes" rows={2} maxLength={300} defaultValue={editingRow?.notes ?? ""} />
            </label>
            {actionError && <ErrorText>{actionError}</ErrorText>}
            <div className="dialog-actions">
              <button type="button" className="button secondary" disabled={pending} onClick={() => setEditor(undefined)}>
                Cancelar
              </button>
              <button className="button primary" disabled={pending}>
                {pending ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {settling && (
        <Dialog
          title={settling.type === "INCOME" ? "Registrar recebimento" : "Registrar pagamento"}
          busy={pending}
          onClose={() => setSettling(undefined)}
        >
          <p className="confirm-copy">
            {settling.description} — <strong>{money(settling.amountCents)}</strong>. Registro administrativo manual.
          </p>
          <form className="form-stack" onSubmit={settleEntry}>
            <label className="form-field">
              <span>Data do caixa</span>
              <input name="settledDate" type="date" required defaultValue={today} />
            </label>
            <label className="form-field">
              <span>Forma de pagamento</span>
              <select name="paymentMethod" defaultValue="PIX">
                {Object.entries(paymentLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Observação (opcional)</span>
              <textarea name="notes" rows={2} maxLength={300} defaultValue={settling.notes ?? ""} />
            </label>
            {actionError && <ErrorText>{actionError}</ErrorText>}
            <div className="dialog-actions">
              <button type="button" className="button secondary" disabled={pending} onClick={() => setSettling(undefined)}>
                Cancelar
              </button>
              <button className="button primary" disabled={pending}>
                {pending ? "Registrando…" : "Confirmar baixa"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {cancelling && (
        <Dialog title="Cancelar lançamento" busy={pending} onClose={() => setCancelling(undefined)}>
          <p className="confirm-copy">
            Cancelar o lançamento em aberto “{cancelling.description}” ({money(cancelling.amountCents)})?
          </p>
          {actionError && <ErrorText>{actionError}</ErrorText>}
          <div className="dialog-actions">
            <button type="button" className="button secondary" disabled={pending} onClick={() => setCancelling(undefined)}>
              Voltar
            </button>
            <button className="button danger" disabled={pending} onClick={() => void cancelEntry()}>
              {pending ? "Cancelando…" : "Cancelar lançamento"}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}

function CashClosingsView({
  organization,
  today,
  canManage,
  isOwner,
  onNotice,
}: {
  organization: Organization;
  today: string;
  canManage: boolean;
  isOwner: boolean;
  onNotice: (message: string) => void;
}) {
  const money = (cents: number) => formatMoney(cents, organization.currency, organization.locale);
  const root = `/organizations/${organization.id}/finance/closings`;
  const load = useCallback((signal: AbortSignal) => api<CashClosing[]>(root, "GET", undefined, signal), [root]);
  const { data, error, reload } = useLoad(load);
  const [closingDate, setClosingDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [reopening, setReopening] = useState<CashClosing | undefined>();
  const [pending, setPending] = useState(false);
  const [issue, setIssue] = useState("");

  async function closeDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setIssue("");
    try {
      await api(root, "POST", { closingDate, ...(notes.trim() && { notes: notes.trim() }) });
      setNotes("");
      onNotice("Caixa fechado.");
      reload();
    } catch (err) {
      setIssue(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function reopenDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reopening || pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setIssue("");
    try {
      await api(`${root}/${reopening.id}/reopen`, "POST", { reason: String(form.get("reason") ?? "").trim() });
      setReopening(undefined);
      onNotice("Caixa reaberto.");
      reload();
    } catch (err) {
      setIssue(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="home-grid">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Fechamento diário</h2>
            <p>
              {canManage
                ? "Confira todos os lançamentos pagos ou recebidos do dia antes de fechar o caixa."
                : "Somente proprietário ou gestor pode fechar o caixa."}
            </p>
          </div>
        </div>
        {canManage && (
          <form className="form-stack settings-form" onSubmit={closeDay}>
            <label className="form-field">
              <span>Data do caixa</span>
              <input type="date" value={closingDate} required onChange={(event) => setClosingDate(event.target.value)} />
            </label>
            <label className="form-field">
              <span>Observações do fechamento (opcional)</span>
              <textarea rows={2} maxLength={300} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
            {issue && !reopening && <ErrorText>{issue}</ErrorText>}
            <button className="button primary" disabled={pending}>
              <Lock size={16} /> {pending ? "Fechando…" : "Fechar caixa do dia"}
            </button>
          </form>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Histórico de fechamentos</h2>
            <p>Dias conferidos e bloqueados contra novas baixas.</p>
          </div>
        </div>
        {error ? (
          <LoadError message={error} retry={reload} />
        ) : !data ? (
          <Loading />
        ) : data.length === 0 ? (
          <Empty>Nenhum fechamento de caixa registrado.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Recebido</th>
                  <th>Pago</th>
                  <th>Saldo</th>
                  <th>Situação</th>
                  <th className="table-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.map((closing) => (
                  <tr key={closing.id}>
                    <td>
                      <div>{formatDay(closing.closingDate, organization.timezone, organization.locale ?? "pt-BR")}</div>
                      <small style={{ color: "var(--subtle)", fontWeight: 400 }}>
                        {closing.reconciledCount} conferido(s) · {closing.closedBy.name}
                      </small>
                    </td>
                    <td>{money(closing.receivedCents)}</td>
                    <td>{money(closing.paidCents)}</td>
                    <td>{money(closing.netCents)}</td>
                    <td>
                      <Status status={closing.status === "CLOSED" ? "CONFIRMED" : "SCHEDULED"}>
                        {closing.status === "CLOSED" ? "Fechado" : "Reaberto"}
                      </Status>
                    </td>
                    <td className="table-actions">
                      {isOwner && closing.status === "CLOSED" && (
                        <button
                          className="button secondary compact"
                          disabled={pending}
                          onClick={() => {
                            setIssue("");
                            setReopening(closing);
                          }}
                        >
                          <RotateCcw size={15} /> Reabrir
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {reopening && (
        <Dialog title="Reabrir caixa fechado" busy={pending} onClose={() => setReopening(undefined)}>
          <p className="confirm-copy">
            Reabrir o caixa de {formatDay(reopening.closingDate, organization.timezone, organization.locale ?? "pt-BR")} permite novas baixas e
            conferências nesta data. Esta ação fica registrada na auditoria.
          </p>
          <form className="form-stack" onSubmit={reopenDay}>
            <label className="form-field">
              <span>Motivo da reabertura</span>
              <textarea name="reason" rows={2} required minLength={5} maxLength={280} />
            </label>
            {issue && <ErrorText>{issue}</ErrorText>}
            <div className="dialog-actions">
              <button type="button" className="button secondary" disabled={pending} onClick={() => setReopening(undefined)}>
                Cancelar
              </button>
              <button className="button danger" disabled={pending}>
                {pending ? "Reabrindo…" : "Reabrir caixa"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

function FinanceCategoriesView({
  organization,
  canManage,
  onNotice,
}: {
  organization: Organization;
  canManage: boolean;
  onNotice: (message: string) => void;
}) {
  const root = `/organizations/${organization.id}/finance/categories`;
  const load = useCallback((signal: AbortSignal) => api<FinanceCategory[]>(root, "GET", undefined, signal), [root]);
  const { data, error, reload } = useLoad(load);
  const [name, setName] = useState("");
  const [type, setType] = useState<FinanceType>("INCOME");
  const [pending, setPending] = useState(false);
  const [issue, setIssue] = useState("");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setIssue("");
    try {
      await api(root, "POST", { name: name.trim(), type });
      setName("");
      onNotice("Categoria criada.");
      reload();
    } catch (err) {
      setIssue(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function toggle(category: FinanceCategory) {
    if (pending) return;
    setPending(true);
    setIssue("");
    try {
      await api(`${root}/${category.id}`, "PATCH", { active: !category.active });
      onNotice(category.active ? "Categoria desativada." : "Categoria reativada.");
      reload();
    } catch (err) {
      setIssue(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="home-grid">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Categorias financeiras</h2>
            <p>Organize receitas e despesas da clínica.</p>
          </div>
        </div>
        {error ? (
          <LoadError message={error} retry={reload} />
        ) : !data ? (
          <Loading />
        ) : data.length === 0 ? (
          <Empty>Nenhuma categoria cadastrada.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Situação</th>
                  {canManage && <th className="table-actions">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {data.map((category) => (
                  <tr key={category.id}>
                    <td>{category.name}</td>
                    <td>{category.type === "INCOME" ? "Receita" : "Despesa"}</td>
                    <td>
                      <Status status={category.active ? "ACTIVE" : "SUSPENDED"}>
                        {category.active ? "Ativa" : "Inativa"}
                      </Status>
                    </td>
                    {canManage && (
                      <td className="table-actions">
                        <button
                          className="button secondary compact"
                          disabled={pending}
                          onClick={() => void toggle(category)}
                        >
                          {category.active ? "Desativar" : "Reativar"}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManage && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Nova categoria</h2>
              <p>Ex.: Consultas, Procedimentos, Aluguel, Materiais.</p>
            </div>
          </div>
          <form className="form-stack settings-form" onSubmit={create}>
            <label className="form-field">
              <span>Nome</span>
              <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={80} />
            </label>
            <label className="form-field">
              <span>Tipo</span>
              <select value={type} onChange={(event) => setType(event.target.value as FinanceType)}>
                <option value="INCOME">Receita</option>
                <option value="EXPENSE">Despesa</option>
              </select>
            </label>
            {issue && <ErrorText>{issue}</ErrorText>}
            <button className="button primary" disabled={pending}>
              <Plus size={16} /> {pending ? "Salvando…" : "Adicionar categoria"}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
