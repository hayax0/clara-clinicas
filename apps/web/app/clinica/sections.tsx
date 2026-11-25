"use client";

import { Campaigns } from "./campaigns";
import { FollowUps } from "./follow-ups";
import { CaptureEditor } from "./capture-editor";
import { Queue } from "./inbox";
import gsap from "gsap";
import {
  CalendarDays, Check, ClipboardList, ListTodo, MessageCircle, Plus, Sparkles, Trash2, UserRoundPlus, Wallet,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Dialog, Empty, ErrorText, LoadError, Loading, PageHeading, Records, Status, useLoad } from "./components";
import { api, contactSources, dateKey, displayDate, errorMessage, lookupLabel, roles, type Member, type Metrics, type Organization, type Resource, type Role, type Row, type View } from "./data";
import { countryOptions, currencyOptions, localizedCountryName, localizedCurrencyName, localeOptions, uiLocaleOptions, type UiLocale } from "../i18n/translations";

export function Home({
  organization, name, isDemo, canWrite, navigate,
}: {
  organization: Organization; name: string; isDemo: boolean; canWrite: boolean; navigate: (view: View, create?: boolean) => void;
}) {
  const root = `/organizations/${organization.id}`;
  const load = useCallback(async (signal: AbortSignal) => {
    const get = <T,>(resource: string) => api<T>(`${root}/${resource}`, "GET", undefined, signal);
    const [metrics, appointments, patients, professionals, tasks] = await Promise.all([
      get<Metrics>("dashboard"), get<Row[]>("appointments"), get<Row[]>("patients"), get<Row[]>("professionals"), get<Row[]>("tasks"),
    ]);
    return { metrics, appointments, patients, professionals, tasks };
  }, [root]);
  const { data, error, reload } = useLoad(load);
  const homeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = homeRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      gsap.from("[data-home-stagger]", {
        y: 16,
        opacity: 0,
        duration: 0.52,
        stagger: 0.055,
        ease: "power3.out",
        clearProps: "transform,opacity",
      });
    }, homeRef);
    return () => ctx.revert();
  }, [organization.id]);
  const date = new Date();
  const locale = organization.locale ?? "pt-BR";
  const isEn = locale === "en-US";
  const today = dateKey(date, organization.timezone);
  const hour = Number(displayDate(date, organization.timezone, { hour: "2-digit", hourCycle: "h23" }, locale));
  const greeting = isEn
    ? (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening")
    : (hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite");
  const appointments = data?.appointments.filter((row) => row.status !== "CANCELLED" && dateKey(String(row.startAt), organization.timezone) === today)
    .sort((a, b) => String(a.startAt).localeCompare(String(b.startAt))) ?? [];
  const pending = appointments.filter((row) => row.status === "SCHEDULED").length;
  const tasks = data?.tasks.filter((task) => task.status === "OPEN").slice(0, 4) ?? [];
  const metrics = isEn
    ? [
        { label: "Appointments today", value: data?.metrics.appointments, Icon: CalendarDays, target: "agenda" as View },
        { label: "Pending confirmation", value: data ? pending : undefined, Icon: ClipboardList, target: "agenda" as View },
        { label: "Open opportunities", value: data?.metrics.opportunities, Icon: MessageCircle, target: "inbox" as View },
        { label: "Open tasks", value: data?.metrics.tasks, Icon: ListTodo, target: "tasks" as View },
      ]
    : [
        { label: "Consultas hoje", value: data?.metrics.appointments, Icon: CalendarDays, target: "agenda" as View },
        { label: "A confirmar", value: data ? pending : undefined, Icon: ClipboardList, target: "agenda" as View },
        { label: "Oportunidades abertas", value: data?.metrics.opportunities, Icon: MessageCircle, target: "inbox" as View },
        { label: "Tarefas abertas", value: data?.metrics.tasks, Icon: ListTodo, target: "tasks" as View },
      ];
  return <div ref={homeRef}>
    <div className="home-intro" data-home-stagger>
      <p className="today-line"><CalendarDays size={15} />{displayDate(date, organization.timezone, { weekday: "long", day: "numeric", month: "long" }, locale)}</p>
      <PageHeading
        title={isDemo ? (isEn ? "Clinic overview" : "Visão geral da clínica") : `${greeting}, ${name.split(" ")[0]}.`}
        description={
          isDemo
            ? (isEn ? "Explore the workflow with sample data." : "Explore a rotina com dados fictícios.")
            : (isEn ? "Track today's schedule, follow-ups, finances, and tasks." : "Acompanhe a agenda, os retornos, o financeiro e as tarefas do dia.")
        }
        actions={canWrite && <button className="button primary" onClick={() => navigate("agenda", true)}><Plus size={18} />{isEn ? "New appointment" : "Novo agendamento"}</button>}
      />
    </div>
    {error ? <LoadError message={error} retry={reload} /> : <>
      <div className="metric-grid">
        {metrics.map(({ label, value, Icon, target }) => <button type="button" className="metric panel metric-btn" key={label} data-home-stagger onClick={() => navigate(target)}><span className="feature-icon"><Icon size={20}/></span><div><p>{label}</p><strong>{value ?? "—"}</strong></div></button>)}
      </div>
      <div className="home-grid">
        <section className="panel day-panel" data-home-stagger>
          <div className="panel-heading"><div><h2>{isEn ? "Today's schedule" : "Agenda de hoje"}</h2><p>{isEn ? "Clinic appointments" : "Atendimentos da clínica"}</p></div><button className="button ghost" onClick={() => navigate("agenda")}>{isEn ? "Open calendar" : "Abrir calendário"}</button></div>
          {!data ? <Loading label={isEn ? "Loading…" : "Carregando…"} /> : appointments.length === 0 ? <Empty calendar>{isEn ? "No appointments scheduled for today." : "Nenhum atendimento para hoje."}</Empty> : <ul className="day-list">
            {appointments.slice(0, 6).map((entry) => <li key={entry.id}>
              <time dateTime={String(entry.startAt)}>{displayDate(String(entry.startAt), organization.timezone, { timeStyle: "short" }, locale)}</time>
              <div><strong>{lookupLabel(data.patients, entry.patientId)}</strong><small>{lookupLabel(data.professionals, entry.professionalId)}</small></div>
              <Status status={String(entry.status)}>{isEn ? (entry.status === "CONFIRMED" ? "Confirmed" : entry.status === "COMPLETED" ? "Completed" : "Scheduled") : (entry.status === "CONFIRMED" ? "Confirmada" : entry.status === "COMPLETED" ? "Concluída" : "Agendada")}</Status>
            </li>)}
          </ul>}
        </section>
        <section className="panel tasks-panel" data-home-stagger>
          <div className="panel-heading"><div><h2>{isEn ? "Pending tasks" : "Pendências"}</h2><p>{isEn ? "Open team tasks" : "Tarefas em aberto"}</p></div><button className="button ghost" onClick={() => navigate("tasks")}>{isEn ? "View tasks" : "Ver tarefas"}</button></div>
          {!data ? <Loading label={isEn ? "Loading…" : "Carregando…"} /> : tasks.length === 0 ? <Empty>{isEn ? "No open tasks." : "Nenhuma tarefa em aberto."}</Empty> : <ul className="task-list">{tasks.map((task) => <li key={task.id}><span className="task-mark" /><div><strong>{task.title}</strong>{task.dueAt && <small>{displayDate(String(task.dueAt), organization.timezone, { dateStyle: "short", timeStyle: "short" }, locale)}</small>}</div></li>)}</ul>}
        </section>
      </div>
    </>}
    <div className="home-grid shortcuts">
      <section className="panel" data-home-stagger><div className="panel-heading"><h2>{isEn ? "Quick access" : "Acesso rápido"}</h2></div><div className="quick-actions">
        <button className="button secondary" onClick={() => navigate("patients", canWrite)}><UserRoundPlus size={17}/>{canWrite ? (isEn ? "New patient" : "Novo paciente") : (isEn ? "View patients" : "Ver pacientes")}</button>
        <button className="button secondary" onClick={() => navigate("inbox")}><MessageCircle size={17}/>{isEn ? "Open inbox" : "Ver atendimento"}</button>
        {canWrite && <button className="button secondary" onClick={() => navigate("finance")}><Wallet size={17}/>{isEn ? "Finance" : "Financeiro"}</button>}
        <button className="button secondary" onClick={() => navigate("tasks", canWrite)}><ListTodo size={17}/>{canWrite ? (isEn ? "New task" : "Nova tarefa") : (isEn ? "View tasks" : "Ver tarefas")}</button>
      </div></section>
      <section className="panel assistant-teaser" data-home-stagger><span className="feature-icon"><Sparkles size={20}/></span><div><h2>{isEn ? "My Assistant" : "Meu Assistente"}</h2><p>{isEn ? "Schedule, confirm appointments, and query your clinic via chat." : "Agende, confirme consultas e consulte a clínica pelo chat."}</p></div><button className="button secondary" onClick={() => navigate("assistant")}>{isEn ? "Open assistant" : "Abrir assistente"}</button></section>
    </div>
  </div>;
}

export function Segments<T extends string>({ options, selected, onSelect, label }: {
  options: { id: T; name: string }[]; selected: T; onSelect: (id: T) => void; label: string;
}) {
  return <div className="segments" role="group" aria-label={label}>{options.map(({ id, name }) => <button key={id} aria-pressed={id === selected} onClick={() => onSelect(id)}>{name}</button>)}</div>;
}

function AcquisitionReport({organization}:{organization:Organization}) {
  const report = useLoad(useCallback((signal:AbortSignal) =>
    api<{source:string; contacts:number; converted:number}[]>(`/organizations/${organization.id}/reports/acquisition`,"GET",undefined,signal),[organization.id]));
  if (report.error) return <LoadError message={report.error} retry={report.reload}/>;
  if (!report.data) return <Loading/>;
  if (!report.data.length) return <Empty>Cadastre um contato para acompanhar a conversão por origem.</Empty>;
  return <section className="panel"><div className="panel-heading"><div><h2>Conversão por origem</h2>
    <p>Percentual de contatos com pelo menos uma oportunidade convertida, considerando todo o histórico atual.</p></div></div>
    <div className="table-scroll"><table><thead><tr><th>Origem</th><th>Contatos</th><th>Convertidos</th><th>Conversão</th></tr></thead>
    <tbody>{report.data.map(row=><tr key={row.source}><td>{contactSources[row.source] ?? "Não informada"}</td><td>{row.contacts}</td>
      <td>{row.converted}</td><td>{(row.converted/row.contacts).toLocaleString(organization.locale ?? "pt-BR",{style:"percent",maximumFractionDigits:1})}</td></tr>)}</tbody></table></div></section>;
}

function CaptureLink({organization,onNotice}:{organization:Organization;onNotice:(message:string)=>void}) {
  const [source,setSource]=useState("WEBSITE");
  const path=`/contato/${organization.id}?origem=${source}`;
  const [manual,setManual]=useState(false);
  async function copy() {
    try {await navigator.clipboard.writeText(new URL(path,window.location.origin).href);onNotice("Link copiado.");}
    catch {setManual(true);}
  }
  return <section className="panel"><div className="panel-heading"><div><h2>Formulário de captação</h2><p>Escolha onde vai divulgar o link. Os pedidos entram em Contatos com essa origem.</p></div></div>
    <label className="form-field">Canal de divulgação<select value={source} onChange={e=>setSource(e.target.value)}>{Object.entries(contactSources).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <div className="quick-actions"><a className="button secondary" href={path} target="_blank" rel="noreferrer">Abrir formulário</a><button className="button primary" onClick={copy}>Copiar link</button></div>
    {manual && <label className="form-field">Link para copiar<input readOnly value={new URL(path,window.location.origin).href} onFocus={e=>e.target.select()}/></label>}</section>;
}

export function Inbox({ organization, canWrite, canPublish, onNotice }: { organization: Organization; canWrite: boolean; canPublish:boolean; onNotice: (message: string) => void }) {
  const [tab, setTab] = useState<"queue" | "opportunities" | "contacts" | "report" | "capture" | "returns" | "campaigns">("queue");
  const isEn = organization.locale === "en-US";
  return <>
    <PageHeading
      title={isEn ? "Inbox" : "Atendimento"}
      description={isEn ? "Organize conversations, follow-ups, leads, and outreach for your team." : "Organize as conversas e repasse atendimentos para a equipe."}
    />
    <Segments
      label={isEn ? "Inbox sections" : "Áreas de atendimento"}
      options={
        isEn
          ? [
              { id: "queue", name: "Queue" },
              { id: "returns", name: "Follow-ups" },
              { id: "campaigns", name: "Campaigns" },
              { id: "opportunities", name: "Opportunities" },
              { id: "contacts", name: "Contacts" },
              { id: "capture", name: "Lead capture" },
              { id: "report", name: "Commercial report" },
            ]
          : [
              { id: "queue", name: "Caixa de entrada" },
              { id: "returns", name: "Retornos" },
              { id: "campaigns", name: "Campanhas" },
              { id: "opportunities", name: "Oportunidades" },
              { id: "contacts", name: "Contatos" },
              { id: "capture", name: "Captação" },
              { id: "report", name: "Relatório comercial" },
            ]
      }
      selected={tab}
      onSelect={setTab}
    />
    {tab === "campaigns" ? <Campaigns key={organization.id} organization={organization} canManage={canPublish}/> : tab === "returns" ? <FollowUps key={organization.id} organization={organization} canWrite={canWrite}/> : tab === "capture" ? <><CaptureLink organization={organization} onNotice={onNotice}/><CaptureEditor key={organization.id} organization={organization} canPublish={canPublish}/></> : tab === "report" ? <AcquisitionReport key={organization.id} organization={organization}/> : tab === "queue" ? <Queue key={organization.id} organization={organization} canWrite={canWrite} /> : <Records key={tab} resource={tab} organization={organization} canWrite={canWrite} onNotice={onNotice} />}
  </>;
}

export const timezones = [
  ["America/Sao_Paulo", "Brasília"], ["America/Fortaleza", "Fortaleza"], ["America/Recife", "Recife"],
  ["America/Bahia", "Salvador"], ["America/Belem", "Belém"], ["America/Manaus", "Manaus"],
  ["America/Porto_Velho", "Porto Velho"], ["America/Boa_Vista", "Boa Vista"], ["America/Cuiaba", "Cuiabá"],
  ["America/Campo_Grande", "Campo Grande"], ["America/Rio_Branco", "Rio Branco"], ["America/Noronha", "Fernando de Noronha"],
  ["America/New_York", "New York / Miami (EST)"], ["America/Chicago", "Chicago (CST)"],
  ["America/Denver", "Denver (MST)"], ["America/Los_Angeles", "Los Angeles (PST)"],
  ["America/Anchorage", "Anchorage (AKST)"], ["Pacific/Honolulu", "Honolulu (HST)"],
  ["Europe/London", "London (UK)"], ["Europe/Lisbon", "Lisboa"], ["Europe/Madrid", "Madrid"],
  ["Atlantic/Azores", "Açores"], ["Atlantic/Canary", "Ilhas Canárias"],
  ["Europe/Paris", "Paris"], ["Europe/Berlin", "Berlin"], ["Europe/Rome", "Rome"], ["Europe/Zurich", "Zurich"],
];

export function TimezoneField({ timezone = "America/Sao_Paulo", label = "Fuso horário", onChange }: { timezone?: string; label?: string; onChange?: (value: string) => void }) {
  return <label className="form-field"><span>{label}</span><select name="timezone" value={onChange ? timezone : undefined} defaultValue={onChange ? undefined : timezone} onChange={onChange ? (event) => onChange(event.target.value) : undefined}>
    {timezones.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    {!timezones.some(([value]) => value === timezone) && <option value={timezone}>{timezone}</option>}
  </select></label>;
}

function Profile({ organization, canManage, onUpdate, onNotice }: {
  organization: Organization; canManage: boolean; onUpdate: (organization: Organization) => void; onNotice: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name")).trim();
    const countryCode = String(form.get("countryCode") ?? organization.countryCode ?? "BR") as Organization["countryCode"];
    const timezone = String(form.get("timezone"));
    const currency = String(form.get("currency") ?? organization.currency ?? "BRL");
    const locale = String(form.get("locale") ?? organization.clinicLocale ?? organization.locale ?? "pt-BR");
    try {
      await api(`/organizations/${organization.id}`, "PATCH", { name, countryCode, timezone, currency, locale });
      onUpdate({ ...organization, name, countryCode, timezone, currency, locale, clinicLocale: locale });
      onNotice("Configurações salvas.");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }
  const isEn = organization.locale === "en-US";
  const clinicLocale = organization.clinicLocale ?? organization.locale ?? "pt-BR";
  return <section className="panel settings-panel">
    <div className="panel-heading"><h2>{isEn ? "Clinic profile" : "Dados da clínica"}</h2></div>
    {canManage ? <form className="form-stack settings-form" onSubmit={save}><label className="form-field"><span>{isEn ? "Clinic name" : "Nome da clínica"}</span><input name="name" defaultValue={organization.name} required minLength={2} maxLength={100} /></label>
      <label className="form-field"><span>{isEn ? "Country / market" : "País / mercado"}</span><select name="countryCode" defaultValue={organization.countryCode ?? "BR"}>{countryOptions.map((option) => <option key={option.value} value={option.value}>{localizedCountryName(option.value, organization.locale)}</option>)}</select></label>
      <TimezoneField timezone={organization.timezone} label={isEn ? "Timezone" : "Fuso horário"}/>
      <label className="form-field">
        <span>{isEn ? "Currency" : "Moeda"}</span>
        <select name="currency" defaultValue={organization.currency ?? "BRL"}>
          {currencyOptions.map((opt) => <option key={opt.value} value={opt.value}>{localizedCurrencyName(opt.value, organization.locale)}</option>)}
        </select>
      </label>
      <label className="form-field">
        <span>{isEn ? "Clinic language for AI and messages" : "Idioma padrão da clínica, IA e mensagens"}</span>
        <select name="locale" defaultValue={clinicLocale}>
          {localeOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </label>
      {(organization.countryCode === "PT" || organization.countryCode === "ES") && <p className="form-hint">{isEn ? "The clinic language controls AI replies. The Clara interface is currently available in Brazilian Portuguese and English; choose English in your account preferences for Portugal and Spain." : "O idioma da clínica controla as respostas da IA. A interface Clara está disponível em português do Brasil e inglês; para Portugal e Espanha, escolha inglês nas preferências da sua conta."}</p>}
      {error && <ErrorText>{error}</ErrorText>}
      <button className="button primary" disabled={pending}><Check size={17}/>{pending ? (isEn ? "Saving…" : "Salvando…") : (isEn ? "Save changes" : "Salvar alterações")}</button>
    </form> : <div className="settings-summary"><div><small>{isEn ? "Clinic name" : "Nome da clínica"}</small><strong>{organization.name}</strong></div><div><small>{isEn ? "Country / market" : "País / mercado"}</small><strong>{localizedCountryName(organization.countryCode ?? "BR", organization.locale)}</strong></div><div><small>{isEn ? "Timezone" : "Fuso horário"}</small><strong>{organization.timezone}</strong></div><div><small>{isEn ? "Currency" : "Moeda"}</small><strong>{organization.currency ?? "BRL"}</strong></div><div><small>{isEn ? "Clinic language" : "Idioma padrão da clínica"}</small><strong>{clinicLocale}</strong></div></div>}
  </section>;
}

function Members({ organization, role, onNotice }: { organization: Organization; role: Role; onNotice: (message: string) => void }) {
  const path = `/organizations/${organization.id}/members`;
  const load = useCallback((signal: AbortSignal) => api<Member[]>(path, "GET", undefined, signal), [path]);
  const { data, error, reload } = useLoad(load);
  const [adding, setAdding] = useState(false);
  const [remove, setRemove] = useState<Member>();
  const [pending, setPending] = useState(false);
  const [issue, setIssue] = useState("");
  const manageable = role === "OWNER" || role === "MANAGER";
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setIssue("");
    try {
      await api(path, "POST", { email: String(form.get("email")).trim(), role: form.get("role") });
      setAdding(false);
      onNotice("Acesso concedido.");
      reload();
    } catch (error) {
      setIssue(errorMessage(error));
    } finally {
      setPending(false);
    }
  }
  async function revoke() {
    if (!remove || pending) return;
    setPending(true);
    setIssue("");
    try {
      await api(`${path}/${remove.id}`, "DELETE");
      setRemove(undefined);
      onNotice("Acesso removido.");
      reload();
    } catch (error) {
      setIssue(errorMessage(error));
    } finally {
      setPending(false);
    }
  }
  return <>
    <section className="panel">
      <div className="panel-heading"><h2>Acessos da equipe</h2>{manageable && <button className="button primary" onClick={() => { setIssue(""); setAdding(true); }}><Plus size={17}/>Adicionar acesso</button>}</div>
      {error ? <LoadError message={error} retry={reload} /> : !data ? <Loading /> : !data.length ? <Empty>Nenhum acesso cadastrado.</Empty> :
      <div className="table-scroll"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th>{manageable && <th className="table-actions">Ações</th>}</tr></thead><tbody>
        {data.map((member) => <tr key={member.id}><td>{member.user.name}</td><td>{member.user.email}</td><td>{roles[member.role]}</td>
          {manageable && <td className="table-actions">{member.role !== "OWNER" && (member.role !== "MANAGER" || role === "OWNER") &&
            <button className="icon-button danger-icon" aria-label={`Remover acesso de ${member.user.name}`} onClick={() => { setIssue(""); setRemove(member); }}><Trash2 size={17}/></button>}</td>}</tr>)}
      </tbody></table></div>}
    </section>
    {adding && <Dialog title="Adicionar acesso" busy={pending} onClose={() => setAdding(false)}>
      <form className="form-stack" onSubmit={add}>
        <p className="form-hint">A pessoa precisa ter criado uma conta com este e-mail.</p>
        <label className="form-field"><span>E-mail</span><input name="email" type="email" required /></label>
        <label className="form-field"><span>Perfil</span><select name="role" defaultValue="STAFF"><option value="STAFF">Equipe</option><option value="VIEWER">Leitura</option>{role === "OWNER" && <option value="MANAGER">Gestor</option>}</select></label>
        {issue && <ErrorText>{issue}</ErrorText>}
        <div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setAdding(false)} disabled={pending}>Cancelar</button><button className="button primary" disabled={pending}>{pending ? "Salvando…" : "Conceder acesso"}</button></div>
      </form>
    </Dialog>}
    {remove && <Dialog title="Remover acesso" busy={pending} onClose={() => setRemove(undefined)}>
      <p className="confirm-copy">Remover o acesso de {remove.user.name} a esta clínica?</p>
      {issue && <ErrorText>{issue}</ErrorText>}
      <div className="dialog-actions"><button className="button secondary" onClick={() => setRemove(undefined)} disabled={pending}>Cancelar</button><button className="button danger" onClick={revoke} disabled={pending}>{pending ? "Removendo…" : "Remover"}</button></div>
    </Dialog>}
  </>;
}

export function Settings({ organization, role, onUpdate, onNotice, uiLocale, onUiLocaleChange }: {
  organization: Organization; role: Role; onUpdate: (organization: Organization) => void; onNotice: (message: string) => void;
  uiLocale: UiLocale; onUiLocaleChange: (locale: UiLocale) => Promise<void>;
}) {
  type Tab = "profile" | "members" | Extract<Resource, "units" | "services" | "professionals">;
  const [tab, setTab] = useState<Tab>("profile");
  const [localePending, setLocalePending] = useState(false);
  const [localeError, setLocaleError] = useState("");
  const isEn = uiLocale === "en-US";
  async function changeUiLocale(value: UiLocale) {
    setLocalePending(true);
    setLocaleError("");
    try {
      await onUiLocaleChange(value);
    } catch (error) {
      setLocaleError(errorMessage(error));
    } finally {
      setLocalePending(false);
    }
  }
  const tabs: { id: Tab; name: string }[] = isEn
    ? [
        { id: "profile", name: "Clinic profile" },
        { id: "units", name: "Locations" },
        { id: "services", name: "Services" },
        { id: "professionals", name: "Providers" },
        { id: "members", name: "Team access" },
      ]
    : [
        { id: "profile", name: "Dados da clínica" },
        { id: "units", name: "Unidades" },
        { id: "services", name: "Serviços" },
        { id: "professionals", name: "Profissionais" },
        { id: "members", name: "Acessos" },
      ];
  const manageable = role === "OWNER" || role === "MANAGER";
  return <>
    <PageHeading
      title={isEn ? "Settings" : "Configurações"}
      description={isEn ? "Manage your clinic structure, currency, language, and team access." : "Gerencie a estrutura da clínica e os acessos da equipe."}
    />
    <Segments label={isEn ? "Clinic settings" : "Configurações da clínica"} options={manageable ? tabs : tabs.filter(({ id }) => id !== "members")} selected={tab} onSelect={setTab} />
    {tab === "profile" ? <><Profile organization={organization} canManage={manageable} onUpdate={onUpdate} onNotice={onNotice}/>
      <section className="panel settings-panel"><div className="panel-heading"><h2>{isEn ? "Your interface language" : "Idioma da sua interface"}</h2></div><label className="form-field"><span>{isEn ? "Only changes your account" : "Altera somente a sua conta"}</span><select value={uiLocale} disabled={localePending} onChange={(event) => { void changeUiLocale(event.target.value as UiLocale); }}>{uiLocaleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>{localeError && <ErrorText>{localeError}</ErrorText>}</section>
      </> :
      tab === "members" ? <Members organization={organization} role={role} onNotice={onNotice}/> :
      <Records key={tab} resource={tab} organization={organization} canWrite={role !== "VIEWER"} onNotice={onNotice} />}
  </>;
}
