"use client";

import {
  Activity, AlertTriangle, Building2, Copy, Cpu, DollarSign, Plus,
} from "lucide-react";
import { type FormEvent, useCallback, useState } from "react";
import { Dialog, Empty, ErrorText, LoadError, Loading, PageHeading, Status, useLoad } from "./components";
import { api, displayDate, errorMessage } from "./data";
import { countryDefaults, countryOptions, currencyOptions, localeOptions, localizedCountryName, localizedCurrencyName, type CountryCode, type UiLocale } from "../i18n/translations";
import { Segments } from "./sections";

type AdminOrganization = {
  id: string;
  name: string;
  countryCode: CountryCode;
  locale: string;
  timezone: string;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
  memberCount: number;
  lastActivityAt: string;
  aiMonthCalls: number;
  aiMonthTokens: number;
  aiMonthCostUsd: number;
};

type ProvisionResult = {
  organization: {
    id: string;
    name: string;
    countryCode: CountryCode;
    timezone: string;
    status: "ACTIVE" | "SUSPENDED";
    createdAt: string;
  };
  owner: {
    id: string;
    name: string;
    email: string;
    createdNewUser: boolean;
  };
  temporaryPassword: string | null;
  loginPath: string;
};

type AiMetricsReport = {
  month: string;
  today: string;
  dailyCallLimit: number;
  dailyTokenLimit: number;
  totals: {
    monthCalls: number;
    monthTokens: number;
    monthCostUsd: number;
    todayCalls: number;
    todayTokens: number;
    nearQuotaCount: number;
  };
  byOrganization: {
    organizationId: string;
    organizationName: string;
    status: "ACTIVE" | "SUSPENDED";
    monthCalls: number;
    monthTokens: number;
    monthCostUsd: number;
    todayCalls: number;
    todayTokens: number;
    callUsagePercent: number;
    tokenUsagePercent: number;
    nearQuota: boolean;
  }[];
};

const usdFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 });

function localizeAdminError(message: string, isEn: boolean) {
  if (!isEn) return message;
  const translations: Record<string, string> = {
    "Não foi possível conectar. Tente novamente.": "Could not connect. Please try again.",
    "Não foi possível concluir a solicitação.": "Could not complete this request.",
    "Não foi possível concluir a operação.": "Could not complete this operation.",
    "Acesso exclusivo da administração da plataforma.": "Platform admin access only.",
    "Clínica não encontrada.": "Clinic not found.",
  };
  return translations[message] ?? message;
}

export function Admin({ onNotice, locale }: { onNotice: (message: string) => void; locale: UiLocale }) {
  const [tab, setTab] = useState<"clinics" | "ai">("clinics");
  const [focusOrgId, setFocusOrgId] = useState<string | null>(null);
  const isEn = locale === "en-US";

  return (
    <>
      <PageHeading
        title={isEn ? "Platform administration" : "Administração"}
        description={isEn ? "Clinic provisioning, platform availability, and AI usage monitoring." : "Provisionamento de clínicas, disponibilidade na plataforma e monitoramento de consumo de IA."}
      />
      <Segments
        label={isEn ? "Administration areas" : "Áreas da administração"}
        options={[
          { id: "clinics", name: isEn ? "Clinics" : "Clínicas" },
          { id: "ai", name: isEn ? "AI & cost monitoring" : "Monitoramento de IA & Custos" },
        ]}
        selected={tab}
        onSelect={setTab}
      />
      {tab === "clinics" && (
        <AdminClinicsView
          onNotice={onNotice}
          isEn={isEn}
          onInspectAi={(orgId) => {
            setFocusOrgId(orgId);
            setTab("ai");
          }}
        />
      )}
      {tab === "ai" && (
        <AdminAiMetricsView
          focusOrgId={focusOrgId}
          onClearFocus={() => setFocusOrgId(null)}
          isEn={isEn}
        />
      )}
    </>
  );
}

function AdminClinicsView({
  onNotice,
  onInspectAi,
  isEn,
}: {
  onNotice: (message: string) => void;
  onInspectAi: (orgId: string) => void;
  isEn: boolean;
}) {
  const path = "/admin/organizations";
  const load = useCallback((signal: AbortSignal) => api<AdminOrganization[]>(path, "GET", undefined, signal), []);
  const { data, error, reload } = useLoad(load);

  const [selected, setSelected] = useState<AdminOrganization>();
  const [pending, setPending] = useState(false);
  const [issue, setIssue] = useState("");

  const [showProvision, setShowProvision] = useState(false);
  const [clinicName, setClinicName] = useState("");
  const [countryCode, setCountryCode] = useState<CountryCode>("BR");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [currency, setCurrency] = useState("BRL");
  const [locale, setLocale] = useState("pt-BR");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [provisionBusy, setProvisionBusy] = useState(false);
  const [provisionError, setProvisionError] = useState("");
  const [provisioned, setProvisioned] = useState<ProvisionResult | null>(null);

  const suspend = selected?.status === "ACTIVE";
  const action = suspend ? (isEn ? "Suspend" : "Suspender") : (isEn ? "Reactivate" : "Reativar");

  async function updateStatus() {
    if (!selected || pending) return;
    setPending(true);
    setIssue("");
    try {
      await api(`${path}/${selected.id}`, "PATCH", { status: suspend ? "SUSPENDED" : "ACTIVE" });
      setSelected(undefined);
      onNotice(suspend ? (isEn ? "Clinic suspended." : "Clínica suspensa.") : (isEn ? "Clinic reactivated." : "Clínica reativada."));
      reload();
    } catch (err) {
      setIssue(localizeAdminError(errorMessage(err), isEn));
    } finally {
      setPending(false);
    }
  }

  async function submitProvision(event: FormEvent) {
    event.preventDefault();
    if (provisionBusy) return;
    setProvisionBusy(true);
    setProvisionError("");
    try {
      const result = await api<ProvisionResult>("/admin/organizations/provision", "POST", {
        name: clinicName.trim(),
        countryCode,
        timezone,
        currency,
        locale,
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim(),
      });
      setProvisioned(result);
      setShowProvision(false);
      setClinicName("");
      setCountryCode("BR");
      setTimezone(countryDefaults.BR.timezone);
      setCurrency(countryDefaults.BR.currency);
      setLocale(countryDefaults.BR.locale);
      setOwnerName("");
      setOwnerEmail("");
      onNotice(isEn ? `Clinic "${result.organization.name}" provisioned successfully.` : `Clínica "${result.organization.name}" provisionada com sucesso.`);
      reload();
    } catch (err) {
      setProvisionError(localizeAdminError(errorMessage(err), isEn));
    } finally {
      setProvisionBusy(false);
    }
  }

  async function copyAccessDetails(result: ProvisionResult) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const loginUrl = `${origin}${result.loginPath}`;
    const lines = [
      isEn ? `Clara access — ${result.organization.name}` : `Acesso à Clara — ${result.organization.name}`,
      `${isEn ? "Link" : "Link"}: ${loginUrl}`,
      `${isEn ? "Email" : "E-mail"}: ${result.owner.email}`,
      ...(result.temporaryPassword
        ? [`${isEn ? "Temporary initial password" : "Senha inicial temporária"}: ${result.temporaryPassword}`]
        : [isEn ? "Existing account linked as Owner (use the current password)." : "Conta já existente vinculada como Proprietário (use sua senha atual)."]),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      onNotice(isEn ? "Access details copied to clipboard." : "Dados de acesso copiados para a área de transferência.");
    } catch {
      onNotice(isEn ? "Could not copy automatically. Copy the details shown on screen." : "Não foi possível copiar automaticamente. Copie os dados exibidos na tela.");
    }
  }

  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2><Building2 size={21} /> {isEn ? "Clinics on the platform" : "Clínicas na plataforma"}</h2>
            <p>{isEn ? "Manage clinic availability without accessing patient clinical data." : "Gerencie o ciclo de vida das clínicas sem acessar dados clínicos de pacientes."}</p>
          </div>
          <button
            className="button primary"
            onClick={() => {
              setProvisionError("");
              setShowProvision(true);
            }}
          >
            <Plus size={16} />
            {isEn ? "Provision a clinic" : "Provisionar nova clínica"}
          </button>
        </div>

        {error ? (
          <LoadError message={localizeAdminError(error, isEn)} retry={reload} />
        ) : !data ? (
          <Loading />
        ) : !data.length ? (
          <Empty>{isEn ? "No clinics registered." : "Nenhuma clínica cadastrada."}</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{isEn ? "Clinic" : "Clínica"}</th>
                  <th>{isEn ? "Country" : "País"}</th>
                  <th>{isEn ? "Time zone" : "Fuso horário"}</th>
                  <th>{isEn ? "Members" : "Membros"}</th>
                  <th>{isEn ? "AI this month" : "IA no mês"}</th>
                  <th>{isEn ? "Last activity" : "Última atividade"}</th>
                  <th>{isEn ? "Status" : "Status"}</th>
                  <th className="table-actions">{isEn ? "Actions" : "Ações"}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((org) => (
                  <tr key={org.id}>
                    <td>
                      <strong>{org.name}</strong>
                      <div className="subtle" style={{ fontSize: "0.8rem" }}>
                        {isEn ? "Created " : "Criada em "}{displayDate(org.createdAt, org.timezone, { dateStyle: "short" }, isEn ? "en-US" : "pt-BR")}
                      </div>
                    </td>
                    <td>{localizedCountryName(org.countryCode, isEn ? "en-US" : "pt-BR")}</td>
                    <td>{org.timezone}</td>
                    <td>{org.memberCount}</td>
                    <td>
                      {new Intl.NumberFormat(isEn ? "en-US" : "pt-BR").format(org.aiMonthCalls)} {isEn ? "calls" : "ch."} · {new Intl.NumberFormat(isEn ? "en-US" : "pt-BR").format(org.aiMonthTokens)} {isEn ? "tokens" : "tok."}
                    </td>
                    <td>{displayDate(org.lastActivityAt, org.timezone, { dateStyle: "short", timeStyle: "short" }, isEn ? "en-US" : "pt-BR")}</td>
                    <td>
                      <Status status={org.status}>
                        {org.status === "SUSPENDED" ? (isEn ? "Suspended" : "Suspensa") : (isEn ? "Active" : "Ativa")}
                      </Status>
                    </td>
                    <td className="table-actions">
                      <button
                        className="button ghost compact"
                        onClick={() => onInspectAi(org.id)}
                      >
                        {isEn ? "AI metrics" : "Métricas IA"}
                      </button>
                      <button
                        className="button secondary compact"
                        onClick={() => {
                          setIssue("");
                          setSelected(org);
                        }}
                      >
                        {org.status === "SUSPENDED" ? (isEn ? "Reactivate" : "Reativar") : (isEn ? "Suspend" : "Suspender")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showProvision && (
        <Dialog title={isEn ? "Provision a clinic" : "Provisionar nova clínica"} busy={provisionBusy} onClose={() => setShowProvision(false)}>
          <form onSubmit={submitProvision} className="stack">
            <label className="form-field">
              <span>{isEn ? "Clinic name" : "Nome da clínica"}</span>
              <input
                required
                minLength={2}
                maxLength={120}
                value={clinicName}
                onChange={(event) => setClinicName(event.target.value)}
                placeholder={isEn ? "e.g. Horizon Clinic" : "Ex.: Clínica Saúde Plena"}
              />
            </label>
            <label className="form-field">
              <span>{isEn ? "Country / market" : "País / mercado"}</span>
              <select value={countryCode} onChange={(event) => {
                const country = event.target.value as CountryCode;
                const defaults = countryDefaults[country];
                setCountryCode(country);
                setTimezone(defaults.timezone);
                setCurrency(defaults.currency);
                setLocale(defaults.locale);
              }}>
                {countryOptions.map((option) => <option key={option.value} value={option.value}>{localizedCountryName(option.value, isEn ? "en-US" : "pt-BR")}</option>)}
              </select>
            </label>
            {(countryCode === "PT" || countryCode === "ES") && <p className="form-hint">{isEn ? "The clinic language sets AI replies. Clara's interface is available in Brazilian Portuguese and English; for Portugal and Spain, choose English in the account preferences." : "O idioma da clínica define as respostas da IA. A interface da Clara está disponível em português do Brasil e inglês; para Portugal e Espanha, selecione inglês nas preferências da conta."}</p>}
            <label className="form-field">
              <span>{isEn ? "Time zone" : "Fuso horário"}</span>
              <select
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
              >
                <optgroup label={isEn ? "Brazil" : "Brasil"}>
                  <option value="America/Sao_Paulo">Brasília (America/Sao_Paulo)</option>
                  <option value="America/Manaus">Manaus (America/Manaus)</option>
                  <option value="America/Cuiaba">Cuiabá (America/Cuiaba)</option>
                  <option value="America/Belem">Belém (America/Belem)</option>
                  <option value="America/Fortaleza">Fortaleza (America/Fortaleza)</option>
                  <option value="America/Recife">Recife (America/Recife)</option>
                  <option value="America/Rio_Branco">Rio Branco (America/Rio_Branco)</option>
                </optgroup>
                <optgroup label={isEn ? "United States (US)" : "Estados Unidos (US)"}>
                  <option value="America/New_York">New York / Miami — EST (America/New_York)</option>
                  <option value="America/Chicago">Chicago — CST (America/Chicago)</option>
                  <option value="America/Denver">Denver — MST (America/Denver)</option>
                  <option value="America/Los_Angeles">Los Angeles — PST (America/Los_Angeles)</option>
                  <option value="America/Anchorage">Anchorage — AKST (America/Anchorage)</option>
                  <option value="Pacific/Honolulu">Honolulu — HST (Pacific/Honolulu)</option>
                </optgroup>
                <optgroup label={isEn ? "United Kingdom & Europe" : "Reino Unido & Europa"}>
                  <option value="Europe/London">London — UK (Europe/London)</option>
                  <option value="Europe/Lisbon">Lisboa (Europe/Lisbon)</option>
                  <option value="Europe/Madrid">Madrid (Europe/Madrid)</option>
                  <option value="Atlantic/Azores">Açores (Atlantic/Azores)</option>
                  <option value="Atlantic/Canary">Ilhas Canárias (Atlantic/Canary)</option>
                  <option value="Europe/Paris">Paris (Europe/Paris)</option>
                  <option value="Europe/Berlin">Berlin (Europe/Berlin)</option>
                  <option value="Europe/Rome">Rome (Europe/Rome)</option>
                  <option value="Europe/Zurich">Zurich (Europe/Zurich)</option>
                </optgroup>
              </select>
            </label>
            <label className="form-field">
              <span>{isEn ? "Currency" : "Moeda"}</span>
              <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                {currencyOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{localizedCurrencyName(opt.value, isEn ? "en-US" : "pt-BR")}</option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>{isEn ? "Default clinic, AI, and message language" : "Idioma padrão da clínica, IA e mensagens"}</span>
              <select value={locale} onChange={(event) => setLocale(event.target.value)}>
                {localeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>{isEn ? "Owner / lead clinician name" : "Nome do proprietário / médico responsável"}</span>
              <input
                required
                minLength={2}
                maxLength={120}
                value={ownerName}
                onChange={(event) => setOwnerName(event.target.value)}
                placeholder={isEn ? "e.g. Dr. Jordan Lee" : "Ex.: Dra. Camila Rocha"}
              />
            </label>
            <label className="form-field">
              <span>{isEn ? "Owner email" : "E-mail do proprietário"}</span>
              <input
                type="email"
                required
                value={ownerEmail}
                onChange={(event) => setOwnerEmail(event.target.value)}
                placeholder={isEn ? "jordan@clinic.com" : "camila@clinica.com.br"}
              />
            </label>
            {provisionError && <ErrorText>{provisionError}</ErrorText>}
            <div className="dialog-actions">
              <button type="button" className="button secondary" disabled={provisionBusy} onClick={() => setShowProvision(false)}>
                {isEn ? "Cancel" : "Cancelar"}
              </button>
              <button type="submit" className="button primary" disabled={provisionBusy}>
                {provisionBusy ? (isEn ? "Provisioning…" : "Provisionando…") : (isEn ? "Create clinic and generate access" : "Criar clínica e gerar acesso")}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {provisioned && (
        <Dialog title={isEn ? "Access provisioned" : "Acesso provisionado"} onClose={() => setProvisioned(null)}>
          <div className="stack">
            <p className="confirm-copy">
              {isEn ? "Clinic " : "A clínica "}<strong>{provisioned.organization.name}</strong>{isEn ? " was created and linked to " : " foi criada e vinculada a "}
              <strong>{provisioned.owner.name}</strong> ({provisioned.owner.email}) {isEn ? "as Owner." : "como Proprietário."}
            </p>
            <div className="panel" style={{ padding: "0.9rem" }}>
              <div><strong>{isEn ? "Sign-in link:" : "Link de acesso:"}</strong> {provisioned.loginPath}</div>
              <div><strong>{isEn ? "Email:" : "E-mail:"}</strong> {provisioned.owner.email}</div>
              {provisioned.temporaryPassword ? (
                <div>
                  <strong>{isEn ? "Temporary initial password:" : "Senha inicial temporária:"}</strong> <code>{provisioned.temporaryPassword}</code>
                </div>
              ) : (
                <div className="subtle">
                  {isEn ? "This email already had a Clara account; access was linked without changing its password." : "Este e-mail já possuía conta na Clara; o acesso foi vinculado mantendo a senha existente."}
                </div>
              )}
            </div>
            <div className="dialog-actions">
              <button type="button" className="button secondary" onClick={() => setProvisioned(null)}>
                {isEn ? "Close" : "Fechar"}
              </button>
              <button type="button" className="button primary" onClick={() => copyAccessDetails(provisioned)}>
                <Copy size={15} />
                {isEn ? "Copy access details" : "Copiar dados de acesso"}
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {selected && (
        <Dialog title={isEn ? `${action} clinic` : `${action} clínica`} busy={pending} onClose={() => setSelected(undefined)}>
          <p className="confirm-copy">{isEn ? `${action} access to ${selected.name}?` : `${action} o acesso à clínica ${selected.name}?`}</p>
          {issue && <ErrorText>{issue}</ErrorText>}
          <div className="dialog-actions">
            <button className="button secondary" disabled={pending} onClick={() => setSelected(undefined)}>
              {isEn ? "Cancel" : "Cancelar"}
            </button>
            <button className={`button ${suspend ? "danger" : "primary"}`} disabled={pending} onClick={updateStatus}>
              {pending ? (isEn ? "Saving…" : "Salvando…") : action}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}

function AdminAiMetricsView({
  focusOrgId,
  onClearFocus,
  isEn,
}: {
  focusOrgId: string | null;
  onClearFocus: () => void;
  isEn: boolean;
}) {
  const load = useCallback(
    (signal: AbortSignal) => api<AiMetricsReport>("/admin/metrics/ai", "GET", undefined, signal),
    [],
  );
  const { data, error, reload } = useLoad(load);

  if (error) return <LoadError message={localizeAdminError(error, isEn)} retry={reload} />;
  if (!data) return <Loading label={isEn ? "Loading AI metrics…" : "Carregando métricas de IA…"} />;

  const rows = focusOrgId
    ? data.byOrganization.filter((item) => item.organizationId === focusOrgId)
    : data.byOrganization;

  return (
    <>
      <div className="metric-grid" style={{ marginTop: "1rem" }}>
        <article className="metric panel">
          <span className="feature-icon"><Activity size={20} /></span>
          <div>
            <p>{isEn ? `Calls this month (${data.month})` : `Chamadas no mês (${data.month})`}</p>
            <strong>{new Intl.NumberFormat(isEn ? "en-US" : "pt-BR").format(data.totals.monthCalls)}</strong>
          </div>
        </article>
        <article className="metric panel">
          <span className="feature-icon"><Cpu size={20} /></span>
          <div>
            <p>{isEn ? "Tokens this month" : "Tokens no mês"}</p>
            <strong>{new Intl.NumberFormat(isEn ? "en-US" : "pt-BR").format(data.totals.monthTokens)}</strong>
          </div>
        </article>
        <article className="metric panel">
          <span className="feature-icon"><DollarSign size={20} /></span>
          <div>
            <p>{isEn ? "Estimated cost (USD)" : "Custo estimado (USD)"}</p>
            <strong>{usdFmt.format(data.totals.monthCostUsd)}</strong>
          </div>
        </article>
        <article className="metric panel">
          <span className="feature-icon"><AlertTriangle size={20} /></span>
          <div>
            <p>{isEn ? "Near daily quota" : "Próximas da cota diária"}</p>
            <strong>{data.totals.nearQuotaCount}</strong>
          </div>
        </article>
      </div>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <div className="panel-heading">
          <div>
            <h2>{isEn ? "AI usage by clinic" : "Consumo de IA por clínica"}</h2>
            <p>
              {isEn ? "Default daily quota: " : "Cota diária padrão: "}{new Intl.NumberFormat(isEn ? "en-US" : "pt-BR").format(data.dailyCallLimit)} {isEn ? "calls and " : "chamadas e "}
              {new Intl.NumberFormat(isEn ? "en-US" : "pt-BR").format(data.dailyTokenLimit)} {isEn ? "tokens per clinic." : "tokens por clínica."}
            </p>
          </div>
          {focusOrgId && (
            <button className="button ghost" onClick={onClearFocus}>
              {isEn ? "Show all clinics" : "Mostrar todas as clínicas"}
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <Empty>{isEn ? "No clinics match the selected filter." : "Nenhuma clínica encontrada para o filtro selecionado."}</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{isEn ? "Clinic" : "Clínica"}</th>
                  <th>Status</th>
                  <th>{isEn ? "Calls (month)" : "Chamadas (mês)"}</th>
                  <th>{isEn ? "Tokens (month)" : "Tokens (mês)"}</th>
                  <th>{isEn ? "Est. cost (USD)" : "Custo est. (USD)"}</th>
                  <th>{isEn ? "Today's usage (calls / tokens)" : "Uso hoje (chamadas / tokens)"}</th>
                  <th>{isEn ? "Quota" : "Cota"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.organizationId}>
                    <td><strong>{item.organizationName}</strong></td>
                    <td>
                      <Status status={item.status}>
                        {item.status === "SUSPENDED" ? (isEn ? "Suspended" : "Suspensa") : (isEn ? "Active" : "Ativa")}
                      </Status>
                    </td>
                    <td>{new Intl.NumberFormat(isEn ? "en-US" : "pt-BR").format(item.monthCalls)}</td>
                    <td>{new Intl.NumberFormat(isEn ? "en-US" : "pt-BR").format(item.monthTokens)}</td>
                    <td>{usdFmt.format(item.monthCostUsd)}</td>
                    <td>
                      {new Intl.NumberFormat(isEn ? "en-US" : "pt-BR").format(item.todayCalls)} ({item.callUsagePercent}%) ·{" "}
                      {new Intl.NumberFormat(isEn ? "en-US" : "pt-BR").format(item.todayTokens)} ({item.tokenUsagePercent}%)
                    </td>
                    <td>
                      {item.nearQuota ? (
                        <Status status="CANCELLED">{isEn ? "Near quota" : "Próxima da cota"}</Status>
                      ) : (
                        <Status status="CONFIRMED">Normal</Status>
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
  );
}
