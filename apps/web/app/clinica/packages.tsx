"use client";

import { CheckCircle2, History, PackagePlus, Plus, RotateCcw, XCircle } from "lucide-react";
import { type FormEvent, useCallback, useState } from "react";
import { Dialog, Empty, ErrorText, LoadError, Loading, Status, useLoad } from "./components";
import { api, displayDate, errorMessage, formatMoney, parseLocaleMoneyToCents, type Organization, type Row } from "./data";

type CatalogPackage = {
  id: string;
  name: string;
  serviceId: string | null;
  totalSessions: number;
  priceCents: number;
  validityDays: number | null;
  active: boolean;
  service: { id: string; name: string } | null;
};

type SessionUsage = {
  id: string;
  appointmentId: string | null;
  usedAt: string;
  notes: string | null;
  revertedAt: string | null;
  recordedBy: { id: string; name: string };
  revertedBy: { id: string; name: string } | null;
};

type PatientPackage = {
  id: string;
  patientId: string;
  packageId: string;
  professionalId: string | null;
  financeEntryId: string | null;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  priceCents: number;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  purchasedAt: string;
  expiresAt: string | null;
  expired: boolean;
  notes: string | null;
  patient: { id: string; name: string };
  servicePackage: { id: string; name: string; service: { id: string; name: string } | null };
  professional: { id: string; name: string } | null;
  financeEntry: { id: string; status: string; dueDate: string; amountCents: number } | null;
  usages: SessionUsage[];
};

type FinanceCategory = { id: string; name: string; type: "INCOME" | "EXPENSE"; active: boolean };

function formatDay(day: string, timezone: string, locale: string) {
  return displayDate(`${day}T12:00:00Z`, timezone, { dateStyle: "short" }, locale);
}
export function PackagesView({
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
  const money = (cents: number) => formatMoney(cents, organization.currency, organization.locale);
  const root = `/organizations/${organization.id}`;
  const [statusFilter, setStatusFilter] = useState<"" | "ACTIVE" | "COMPLETED" | "CANCELLED">("");
  const [assigning, setAssigning] = useState(false);
  const [selectedPkgId, setSelectedPkgId] = useState("");
  const [createFinance, setCreateFinance] = useState(true);
  const [consuming, setConsuming] = useState<PatientPackage | undefined>();
  const [historyOf, setHistoryOf] = useState<PatientPackage | undefined>();
  const [cancelling, setCancelling] = useState<PatientPackage | undefined>();
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [catalogError, setCatalogError] = useState("");

  const load = useCallback(async (signal: AbortSignal) => {
    const query = statusFilter ? `?status=${statusFilter}` : "";
    const [assignments, catalog, patients, professionals, services, categories] = await Promise.all([
      api<PatientPackage[]>(`${root}/packages${query}`, "GET", undefined, signal),
      api<CatalogPackage[]>(`${root}/packages/catalog`, "GET", undefined, signal),
      api<Row[]>(`${root}/patients`, "GET", undefined, signal),
      api<Row[]>(`${root}/professionals`, "GET", undefined, signal),
      api<Row[]>(`${root}/services`, "GET", undefined, signal),
      api<FinanceCategory[]>(`${root}/finance/categories`, "GET", undefined, signal),
    ]);
    return { assignments, catalog, patients, professionals, services, categories };
  }, [root, statusFilter]);

  const { data, error, reload } = useLoad(load);
  const activeCatalog = (data?.catalog ?? []).filter((item) => item.active);
  const incomeCategories = (data?.categories ?? []).filter((cat) => cat.active && cat.type === "INCOME");
  const selectedCatalog = activeCatalog.find((item) => item.id === selectedPkgId) ?? activeCatalog[0];

  async function createCatalog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const validityRaw = String(form.get("validityDays") ?? "").trim();
    setPending(true);
    setCatalogError("");
    try {
      await api(`${root}/packages/catalog`, "POST", {
        name: String(form.get("name") ?? "").trim(),
        serviceId: String(form.get("serviceId") ?? ""),
        totalSessions: Number(form.get("totalSessions")),
        priceCents: parseLocaleMoneyToCents(String(form.get("price") ?? "0"), organization.locale ?? "pt-BR"),
        ...(validityRaw ? { validityDays: Number(validityRaw) } : {}),
      });
      event.currentTarget.reset();
      onNotice("Pacote adicionado ao catálogo.");
      reload();
    } catch (err) {
      setCatalogError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function toggleCatalog(pkg: CatalogPackage) {
    if (pending) return;
    setPending(true);
    setCatalogError("");
    try {
      await api(`${root}/packages/catalog/${pkg.id}`, "PATCH", { active: !pkg.active });
      onNotice(pkg.active ? "Pacote desativado." : "Pacote reativado.");
      reload();
    } catch (err) {
      setCatalogError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function assignPackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const priceCents = parseLocaleMoneyToCents(String(form.get("price") ?? "0"), organization.locale ?? "pt-BR");
    setPending(true);
    setActionError("");
    try {
      await api(`${root}/packages/assign`, "POST", {
        patientId: String(form.get("patientId") ?? ""),
        packageId: String(form.get("packageId") ?? ""),
        professionalId: String(form.get("professionalId") ?? ""),
        purchasedAt: String(form.get("purchasedAt") ?? today),
        priceCents,
        notes: String(form.get("notes") ?? "").trim(),
        createFinanceEntry: createFinance && priceCents > 0,
        ...(createFinance && priceCents > 0 && {
          dueDate: String(form.get("dueDate") ?? today),
          categoryId: String(form.get("categoryId") ?? ""),
        }),
      });
      setAssigning(false);
      onNotice(createFinance && priceCents > 0 ? "Pacote vinculado e conta a receber gerada." : "Pacote vinculado ao paciente.");
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function consumeSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!consuming || pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setActionError("");
    try {
      await api(`${root}/packages/${consuming.id}/consume`, "POST", {
        notes: String(form.get("notes") ?? "").trim(),
      });
      setConsuming(undefined);
      onNotice("Sessão registrada no pacote.");
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function revertSession(pkg: PatientPackage, usage: SessionUsage) {
    if (pending) return;
    setPending(true);
    setActionError("");
    try {
      const updated = await api<PatientPackage>(`${root}/packages/${pkg.id}/usages/${usage.id}/revert`, "POST", {});
      setHistoryOf(updated);
      onNotice("Sessão estornada e devolvida ao saldo.");
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function cancelPackage() {
    if (!cancelling || pending) return;
    setPending(true);
    setActionError("");
    try {
      await api(`${root}/packages/${cancelling.id}/cancel`, "POST", {});
      setCancelling(undefined);
      onNotice("Pacote cancelado.");
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <section className="panel records">
        <div className="panel-heading records-heading">
          <div>
            <h2>Pacotes dos pacientes</h2>
            <p>Acompanhe o saldo de sessões contratadas e registre cada atendimento realizado.</p>
          </div>
          <button
            className="button primary"
            disabled={!activeCatalog.length || !(data?.patients.length ?? 0)}
            onClick={() => {
              setActionError("");
              setSelectedPkgId(activeCatalog[0]?.id ?? "");
              setCreateFinance(true);
              setAssigning(true);
            }}
          >
            <PackagePlus size={17} /> Vincular pacote
          </button>
        </div>

        <div className="record-tools">
          <div className="date-tools">
            <select
              aria-label="Filtrar pacotes por situação"
              className="finance-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "" | "ACTIVE" | "COMPLETED" | "CANCELLED")}
            >
              <option value="">Todas as situações</option>
              <option value="ACTIVE">Ativos</option>
              <option value="COMPLETED">Concluídos</option>
              <option value="CANCELLED">Cancelados</option>
            </select>
          </div>
        </div>

        {error ? (
          <LoadError message={error} retry={reload} />
        ) : !data ? (
          <Loading />
        ) : data.assignments.length === 0 ? (
          <Empty>
            {activeCatalog.length
              ? "Nenhum pacote vinculado a pacientes ainda."
              : "Cadastre primeiro um modelo no catálogo de pacotes abaixo."}
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Pacote</th>
                  <th>Sessões</th>
                  <th>Validade</th>
                  <th>Valor</th>
                  <th>Situação</th>
                  <th className="table-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.assignments.map((item) => {
                  const statusCode =
                    item.status === "CANCELLED"
                      ? "CANCELLED"
                      : item.status === "COMPLETED"
                        ? "COMPLETED"
                        : item.expired
                          ? "SUSPENDED"
                          : "ACTIVE";
                  const statusLabel =
                    item.status === "CANCELLED"
                      ? "Cancelado"
                      : item.status === "COMPLETED"
                        ? "Concluído"
                        : item.expired
                          ? "Vencido"
                          : "Ativo";
                  return (
                    <tr key={item.id}>
                      <td>
                        <div>{item.patient.name}</div>
                        <small style={{ color: "var(--subtle)", fontWeight: 400 }}>
                          {[item.professional?.name, `Contratado em ${formatDay(item.purchasedAt, organization.timezone, organization.locale ?? "pt-BR")}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </td>
                      <td>
                        <div>{item.servicePackage.name}</div>
                        {item.servicePackage.service && (
                          <small style={{ color: "var(--subtle)", fontWeight: 400 }}>{item.servicePackage.service.name}</small>
                        )}
                      </td>
                      <td style={{ fontVariantNumeric: "tabular-nums" }}>
                        <strong>{item.usedSessions} / {item.totalSessions}</strong>
                        <small style={{ display: "block", color: "var(--subtle)", fontWeight: 400 }}>
                          {item.remainingSessions} restante(s)
                        </small>
                      </td>
                      <td>{item.expiresAt ? formatDay(item.expiresAt, organization.timezone, organization.locale ?? "pt-BR") : "Sem prazo"}</td>
                      <td>
                        <div>{money(item.priceCents)}</div>
                        {item.financeEntry && (
                          <small style={{ color: "var(--subtle)", fontWeight: 400 }}>
                            Financeiro: {item.financeEntry.status === "PAID" ? "Recebido" : item.financeEntry.status === "CANCELLED" ? "Cancelado" : "A receber"}
                          </small>
                        )}
                      </td>
                      <td>
                        <Status status={statusCode}>{statusLabel}</Status>
                      </td>
                      <td className="table-actions">
                        {item.status === "ACTIVE" && !item.expired && (
                          <button
                            className="button primary compact"
                            disabled={pending}
                            onClick={() => {
                              setActionError("");
                              setConsuming(item);
                            }}
                          >
                            <CheckCircle2 size={15} /> Registrar sessão
                          </button>
                        )}
                        <button
                          className="icon-button"
                          aria-label={`Ver histórico de ${item.patient.name}`}
                          title="Histórico de sessões"
                          onClick={() => {
                            setActionError("");
                            setHistoryOf(item);
                          }}
                        >
                          <History size={16} />
                        </button>
                        {canManage && item.status === "ACTIVE" && (
                          <button
                            className="icon-button danger-icon"
                            aria-label={`Cancelar pacote de ${item.patient.name}`}
                            title="Cancelar pacote"
                            onClick={() => {
                              setActionError("");
                              setCancelling(item);
                            }}
                          >
                            <XCircle size={16} />
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

      <div className="home-grid" style={{ marginTop: "1rem" }}>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Catálogo de pacotes</h2>
              <p>Modelos pré-configurados pela clínica para contratação rápida.</p>
            </div>
          </div>
          {catalogError && (
            <div style={{ padding: "0 1.2rem .8rem" }}>
              <ErrorText>{catalogError}</ErrorText>
            </div>
          )}
          {!data ? (
            <Loading />
          ) : data.catalog.length === 0 ? (
            <Empty>Nenhum modelo de pacote cadastrado.</Empty>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Pacote</th>
                    <th>Sessões</th>
                    <th>Validade</th>
                    <th>Valor</th>
                    <th>Situação</th>
                    {canManage && <th className="table-actions">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.catalog.map((pkg) => (
                    <tr key={pkg.id}>
                      <td>
                        <div>{pkg.name}</div>
                        {pkg.service && (
                          <small style={{ color: "var(--subtle)", fontWeight: 400 }}>{pkg.service.name}</small>
                        )}
                      </td>
                      <td>{pkg.totalSessions}</td>
                      <td>{pkg.validityDays ? `${pkg.validityDays} dias` : "Sem prazo"}</td>
                      <td>{money(pkg.priceCents)}</td>
                      <td>
                        <Status status={pkg.active ? "ACTIVE" : "SUSPENDED"}>
                          {pkg.active ? "Ativo" : "Inativo"}
                        </Status>
                      </td>
                      {canManage && (
                        <td className="table-actions">
                          <button className="button secondary compact" disabled={pending} onClick={() => void toggleCatalog(pkg)}>
                            {pkg.active ? "Desativar" : "Reativar"}
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
                <h2>Novo modelo de pacote</h2>
                <p>Ex.: 10 sessões de fisioterapia, 5 sessões de estética.</p>
              </div>
            </div>
            <form className="form-stack settings-form" onSubmit={createCatalog}>
              <label className="form-field">
                <span>Nome do pacote</span>
                <input name="name" required minLength={2} maxLength={120} placeholder="Ex. Pacote 10 sessões" />
              </label>
              <label className="form-field">
                <span>Serviço vinculado (opcional)</span>
                <select name="serviceId" defaultValue="">
                  <option value="">Não vinculado</option>
                  {(data?.services ?? []).map((service) => (
                    <option key={service.id} value={service.id}>
                      {String(service.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Quantidade de sessões</span>
                <input name="totalSessions" type="number" min={1} max={200} required defaultValue={10} />
              </label>
              <label className="form-field">
                <span>Valor do pacote (R$)</span>
                <input name="price" type="number" step="0.01" min="0" required defaultValue="0" />
              </label>
              <label className="form-field">
                <span>Validade em dias (opcional)</span>
                <input name="validityDays" type="number" min={1} max={1825} placeholder="Ex. 90" />
              </label>
              <button className="button primary" disabled={pending}>
                <Plus size={16} /> {pending ? "Salvando…" : "Adicionar pacote"}
              </button>
            </form>
          </section>
        )}
      </div>

      {assigning && (
        <Dialog title="Vincular pacote ao paciente" busy={pending} onClose={() => setAssigning(false)}>
          <form className="form-stack" onSubmit={assignPackage}>
            <label className="form-field">
              <span>Paciente</span>
              <select name="patientId" required defaultValue={data?.patients[0]?.id ?? ""}>
                {(data?.patients ?? []).map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {String(patient.name)}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Pacote</span>
              <select
                name="packageId"
                required
                value={selectedCatalog?.id ?? ""}
                onChange={(event) => setSelectedPkgId(event.target.value)}
              >
                {activeCatalog.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name} ({pkg.totalSessions} sessões · {money(pkg.priceCents)})
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Profissional responsável (opcional)</span>
              <select name="professionalId" defaultValue="">
                <option value="">Não vinculado</option>
                {(data?.professionals ?? []).map((prof) => (
                  <option key={prof.id} value={prof.id}>
                    {String(prof.name)}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Valor combinado ({organization.currency ?? "BRL"})</span>
              <input
                key={selectedCatalog?.id}
                name="price"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={selectedCatalog ? (selectedCatalog.priceCents / 100).toFixed(2) : "0.00"}
              />
            </label>
            <label className="form-field">
              <span>Data de contratação</span>
              <input name="purchasedAt" type="date" required defaultValue={today} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: ".55rem", fontSize: ".9rem", fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={createFinance}
                onChange={(event) => setCreateFinance(event.target.checked)}
              />
              Gerar conta a receber no Financeiro automaticamente
            </label>
            {createFinance && (
              <>
                <label className="form-field">
                  <span>Vencimento no Financeiro</span>
                  <input name="dueDate" type="date" defaultValue={today} />
                </label>
                <label className="form-field">
                  <span>Categoria de receita (opcional)</span>
                  <select name="categoryId" defaultValue="">
                    <option value="">Sem categoria</option>
                    {incomeCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label className="form-field">
              <span>Observações (opcional)</span>
              <textarea name="notes" rows={2} maxLength={300} />
            </label>
            {actionError && <ErrorText>{actionError}</ErrorText>}
            <div className="dialog-actions">
              <button type="button" className="button secondary" disabled={pending} onClick={() => setAssigning(false)}>
                Cancelar
              </button>
              <button className="button primary" disabled={pending}>
                {pending ? "Salvando…" : "Vincular pacote"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {consuming && (
        <Dialog title="Registrar sessão realizada" busy={pending} onClose={() => setConsuming(undefined)}>
          <p className="confirm-copy">
            <strong>{consuming.patient.name}</strong> — {consuming.servicePackage.name} (sessão {consuming.usedSessions + 1} de{" "}
            {consuming.totalSessions}).
          </p>
          <form className="form-stack" onSubmit={consumeSession}>
            <label className="form-field">
              <span>Observação administrativa (opcional)</span>
              <textarea name="notes" rows={2} maxLength={240} placeholder="Ex. Sessão realizada conforme combinado." />
            </label>
            {actionError && <ErrorText>{actionError}</ErrorText>}
            <div className="dialog-actions">
              <button type="button" className="button secondary" disabled={pending} onClick={() => setConsuming(undefined)}>
                Cancelar
              </button>
              <button className="button primary" disabled={pending}>
                {pending ? "Registrando…" : "Confirmar sessão"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {historyOf && (
        <Dialog title={`Sessões — ${historyOf.patient.name}`} busy={pending} onClose={() => setHistoryOf(undefined)}>
          <p className="confirm-copy">
            {historyOf.servicePackage.name}: <strong>{historyOf.usedSessions} de {historyOf.totalSessions}</strong> usadas (
            {historyOf.remainingSessions} restantes).
          </p>
          {actionError && <ErrorText>{actionError}</ErrorText>}
          {historyOf.usages.length === 0 ? (
            <Empty>Nenhuma sessão registrada ainda.</Empty>
          ) : (
            <ul className="task-list" style={{ padding: 0 }}>
              {historyOf.usages.map((usage) => (
                <li key={usage.id}>
                  <div>
                    <strong>
                      {displayDate(usage.usedAt, organization.timezone, { dateStyle: "short", timeStyle: "short" }, organization.locale)}
                      {usage.revertedAt ? " · Estornada" : ""}
                    </strong>
                    <small>
                      Registrada por {usage.recordedBy.name}
                      {usage.notes ? ` · ${usage.notes}` : ""}
                      {usage.revertedBy ? ` · Estornada por ${usage.revertedBy.name}` : ""}
                    </small>
                  </div>
                  {canManage && !usage.revertedAt && historyOf.status !== "CANCELLED" && (
                    <button
                      className="button secondary compact"
                      disabled={pending}
                      onClick={() => void revertSession(historyOf, usage)}
                    >
                      <RotateCcw size={14} /> Estornar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="dialog-actions">
            <button type="button" className="button secondary" onClick={() => setHistoryOf(undefined)}>
              Fechar
            </button>
          </div>
        </Dialog>
      )}

      {cancelling && (
        <Dialog title="Cancelar pacote" busy={pending} onClose={() => setCancelling(undefined)}>
          <p className="confirm-copy">
            Cancelar o pacote “{cancelling.servicePackage.name}” de {cancelling.patient.name}? As {cancelling.usedSessions}{" "}
            sessões já registradas continuam no histórico.
          </p>
          {actionError && <ErrorText>{actionError}</ErrorText>}
          <div className="dialog-actions">
            <button type="button" className="button secondary" disabled={pending} onClick={() => setCancelling(undefined)}>
              Voltar
            </button>
            <button className="button danger" disabled={pending} onClick={() => void cancelPackage()}>
              {pending ? "Cancelando…" : "Cancelar pacote"}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
