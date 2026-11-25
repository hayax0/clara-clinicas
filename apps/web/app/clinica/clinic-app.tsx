"use client";

import {
  Building2, CalendarDays, ChevronDown, CircleCheck, House, ListTodo, LogOut, Menu, MessagesSquare,
  Plus, Settings2, ShieldCheck, Sparkles, UsersRound, Wallet,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ClaraLogo } from "../brand-logo";
import { Dialog, ErrorText, LoadError, Loading, PageHeading, Records } from "./components";
import { Admin } from "./admin";
import { Home, Inbox, Settings, TimezoneField } from "./sections";
import { Assistant, type AgentId } from "./assistant";
import { ClinicCalendar } from "./calendar";
import { Finance } from "./finance";
import { api, ApiError, errorMessage, roles, type Organization, type Session, type View } from "./data";
import { countryDefaults, countryOptions, currencyOptions, localeOptions, localizedCountryName, localizedCurrencyName, resolveUiLocale, t, type CountryCode, type TranslationKey, type UiLocale } from "../i18n/translations";

const mainNav = [
  { id: "home", key: "nav_home", icon: House },
  { id: "agenda", key: "nav_agenda", icon: CalendarDays },
  { id: "patients", key: "nav_patients", icon: UsersRound },
  { id: "inbox", key: "nav_inbox", icon: MessagesSquare },
  { id: "finance", key: "nav_finance", icon: Wallet },
  { id: "assistant", key: "nav_assistant", icon: Sparkles },
] satisfies { id: View; key: TranslationKey; icon: typeof House }[];
const utilityNav = [
  { id: "tasks", key: "nav_tasks", icon: ListTodo },
  { id: "settings", key: "nav_settings", icon: Settings2 },
] satisfies { id: View; key: TranslationKey; icon: typeof House }[];

const recordViews = {
  patients: { resource: "patients", title: "Pacientes", description: "Consulte e atualize os dados administrativos dos pacientes." },
  tasks: { resource: "tasks", title: "Tarefas", description: "Organize as pendências da clínica." },
} as const;
const uiLocaleStorageKey = "clara-ui-locale";
const uiLocaleChangeEvent = "clara-ui-locale-change";

function subscribeToUiLocale(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(uiLocaleChangeEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(uiLocaleChangeEvent, onChange);
  };
}

function getPreferredUiLocaleSnapshot(): UiLocale | null {
  const savedLocale = window.localStorage.getItem(uiLocaleStorageKey);
  return savedLocale === "pt-BR" || savedLocale === "en-US" ? savedLocale : null;
}

function getServerPreferredUiLocaleSnapshot(): UiLocale | null {
  return null;
}

function savePreferredUiLocale(locale: UiLocale) {
  window.localStorage.setItem(uiLocaleStorageKey, locale);
  window.dispatchEvent(new Event(uiLocaleChangeEvent));
}

function subscribeToLocalHost() {
  return () => {};
}

function getLocalHostSnapshot() {
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function getServerLocalHostSnapshot() {
  return false;
}

function BrandLink() {
  return <ClaraLogo href="/" size={35} />;
}

function Auth({ initialRegister, onSuccess, locale, onLocaleChange }: {
  initialRegister: boolean;
  onSuccess: () => Promise<void>;
  locale: UiLocale;
  onLocaleChange: (locale: UiLocale) => void;
}) {
  const [register, setRegister] = useState(initialRegister);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const localRegistrationAllowed = useSyncExternalStore(subscribeToLocalHost, getLocalHostSnapshot, getServerLocalHostSnapshot);
  const [localDemoAvailable, setLocalDemoAvailable] = useState(false);
  const isEn = locale === "en-US";

  useEffect(() => {
    if (!localRegistrationAllowed) return;
    let active = true;
    void api<{ available: boolean }>("/auth/demo").then((result) => {
      if (active) setLocalDemoAvailable(result.available);
    }).catch(() => {});
    return () => { active = false; };
  }, [localRegistrationAllowed]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    const name = String(form.get("name") ?? "").trim();
    setPending(true);
    setError("");
    try {
      await api(register ? "/auth/register" : "/auth/login", "POST", register ? { name, email, password } : { email, password });
      await onSuccess();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function enterLocalDemo() {
    if (pending || !localDemoAvailable) return;
    setPending(true);
    setError("");
    try {
      await api("/auth/demo", "POST");
      await onSuccess();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  const displayedError = isEn && error === "E-mail ou senha incorretos."
    ? "Email or password is incorrect."
    : error;

  return <div className="entry-shell">
    <header className="entry-header"><BrandLink/><div className="lp-actions">
      <button className="button ghost" type="button" onClick={() => onLocaleChange(isEn ? "pt-BR" : "en-US")} aria-label={isEn ? "Mudar para português" : "Switch to English"}>{isEn ? "PT" : "EN"}</button>
      <Link className="button ghost" href="/">{isEn ? "Home" : "Página inicial"}</Link>
    </div></header>
    <main className="entry-main">
      <div className="entry-card panel">
        <h1>{register ? (isEn ? "Create your account" : "Crie sua conta") : (isEn ? "Sign in to your clinic" : "Entre na sua clínica")}</h1>
        <p>{register ? (isEn ? "Get started with your work email." : "Comece com seu e-mail de trabalho.") : (isEn ? "Access your schedule, patients, and inbox." : "Acesse sua agenda, pacientes e atendimento.")}</p>
        {localDemoAvailable && !register && <button type="button" className="button secondary" disabled={pending} onClick={enterLocalDemo}>{pending ? (isEn ? "Opening demo…" : "Abrindo demonstração…") : (isEn ? "Explore local demo" : "Explorar demonstração local")}</button>}
        <form className="form-stack" onSubmit={submit} key={register ? "register" : "login"}>
          {register && <label className="form-field"><span>{isEn ? "Your name" : "Seu nome"}</span><input name="name" autoComplete="name" required minLength={2} maxLength={100} /></label>}
          <label className="form-field"><span>{isEn ? "Email" : "E-mail"}</span><input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <label className="form-field"><span>{isEn ? "Password" : "Senha"}</span><input name="password" type="password" autoComplete={register ? "new-password" : "current-password"} required minLength={register ? 10 : undefined} maxLength={128} /></label>
          {register && <p className="form-hint">{isEn ? "Use at least 10 characters." : "Use pelo menos 10 caracteres."}</p>}
          {displayedError && <ErrorText>{displayedError}</ErrorText>}
          <button className="button primary" disabled={pending}>{pending ? (isEn ? "Please wait…" : "Aguarde…") : register ? (isEn ? "Create account" : "Criar conta") : (isEn ? "Sign in" : "Entrar")}</button>
        </form>
        <div className="entry-switch">{register
          ? <><span>{isEn ? "Already have access?" : "Já tem acesso?"}</span> <button className="text-button" disabled={pending} onClick={() => { setError(""); setRegister(false); }}>{isEn ? "Sign in" : "Entrar"}</button></>
          : <span>{localRegistrationAllowed
            ? <>{isEn ? "Need a local test account?" : "Precisa de uma conta local para testar?"} <Link href="/clinica?cadastro=1">{isEn ? "Create account" : "Criar conta"}</Link></>
            : (isEn ? "To get access, contact the person responsible for your clinic's implementation." : "Para receber seu acesso, fale com o responsável pela implantação na sua clínica.")}</span>}
        </div>
      </div>
    </main>
  </div>;
}

function OrganizationForm({ onSuccess, onCancel, fullPage = false, uiLocale }: {
  onSuccess: (organization: Organization) => Promise<void>; onCancel?: () => void; fullPage?: boolean; uiLocale: UiLocale;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [countryCode, setCountryCode] = useState<CountryCode>("BR");
  const [timezone, setTimezone] = useState(countryDefaults.BR.timezone);
  const [currency, setCurrency] = useState(countryDefaults.BR.currency);
  const [locale, setLocale] = useState(countryDefaults.BR.locale);
  const isEn = uiLocale === "en-US";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const result = await api<Organization | { organization: Organization }>("/organizations", "POST", { name: String(form.get("name")).trim(), countryCode, timezone, currency, locale });
      await onSuccess("organization" in result ? result.organization : result);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }
  const form = <form className="form-stack" onSubmit={submit}>
    <label className="form-field"><span>{isEn ? "Clinic name" : "Nome da clínica"}</span><input name="name" required minLength={2} maxLength={100} placeholder={isEn ? "e.g. Horizon Clinic" : "Ex. Clínica Horizonte"} /></label>
    <label className="form-field"><span>{isEn ? "Country / market" : "País / mercado"}</span><select value={countryCode} onChange={(event) => {
      const country = event.target.value as CountryCode;
      const defaults = countryDefaults[country];
      setCountryCode(country);
      setTimezone(defaults.timezone);
      setCurrency(defaults.currency);
      setLocale(defaults.locale);
    }}>{countryOptions.map((option) => <option key={option.value} value={option.value}>{localizedCountryName(option.value, uiLocale)}</option>)}</select></label>
    <TimezoneField timezone={timezone} label={isEn ? "Time zone" : "Fuso horário"} onChange={setTimezone} />
    <label className="form-field"><span>{isEn ? "Currency" : "Moeda"}</span><select value={currency} onChange={(event) => setCurrency(event.target.value as typeof currency)}>{currencyOptions.map((option) => <option key={option.value} value={option.value}>{localizedCurrencyName(option.value, uiLocale)}</option>)}</select></label>
    <label className="form-field"><span>{isEn ? "Default clinic, AI, and message language" : "Idioma padrão da clínica, IA e mensagens"}</span><select value={locale} onChange={(event) => setLocale(event.target.value as typeof locale)}>{localeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    {(countryCode === "PT" || countryCode === "ES") && <p className="form-hint">{isEn ? "The clinic language sets AI replies. Clara's interface is available in Brazilian Portuguese and English; for Portugal and Spain, choose English in your account preferences." : "O idioma da clínica define as respostas da IA. A interface da Clara está disponível em português do Brasil e inglês; para Portugal e Espanha, selecione inglês nas preferências da sua conta."}</p>}
    {error && <ErrorText>{error}</ErrorText>}
    <div className="dialog-actions">{!fullPage && onCancel && <button type="button" className="button secondary" disabled={pending} onClick={onCancel}>{isEn ? "Cancel" : "Cancelar"}</button>}<button className="button primary" disabled={pending}>{pending ? (isEn ? "Creating…" : "Criando…") : (isEn ? "Create clinic" : "Criar clínica")}</button></div>
  </form>;

  if (!fullPage && onCancel) return <Dialog title={isEn ? "Create clinic" : "Criar clínica"} onClose={onCancel} busy={pending}>{form}</Dialog>;
  return <div className="entry-card panel"><span className="feature-icon"><Building2 size={22}/></span><h1>{isEn ? "Set up your clinic" : "Configure sua clínica"}</h1><p>{isEn ? "Register your organization to get started." : "Cadastre sua organização para começar."}</p>{form}</div>;
}

export default function ClinicApp({ initialRegister, openAssistant }: { initialRegister: boolean; openAssistant: boolean }) {
  const [session, setSession] = useState<Session | null>();
  const [sessionError, setSessionError] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [route, setRoute] = useState<{ view: View; sequence: number; create?: boolean; agent?: AgentId }>({ view: openAssistant ? "assistant" : "home", sequence: 0 });
  const [menu, setMenu] = useState(false);
  const [showNewOrganization, setShowNewOrganization] = useState(false);
  const [notice, setNotice] = useState("");
  const [logoutIssue, setLogoutIssue] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const preferredUiLocale = useSyncExternalStore(subscribeToUiLocale, getPreferredUiLocaleSnapshot, getServerPreferredUiLocaleSnapshot);

  useEffect(() => {
    document.documentElement.lang = (preferredUiLocale ?? "pt-BR") === "en-US" ? "en" : "pt-BR";
  }, [preferredUiLocale]);

  const refreshSession = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await api<Session>("/session", "GET", undefined, signal);
      if (signal?.aborted) return;
      setSession(result);
      setSessionError("");
    } catch (error) {
      if (signal?.aborted) return;
      if (error instanceof ApiError && error.status === 401) {
        setSession(null);
        setSessionError("");
        return;
      }
      setSessionError(errorMessage(error));
      throw error;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => refreshSession(controller.signal)).catch(() => {});
    return () => controller.abort();
  }, [refreshSession]);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!menu) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenu(false);
      document.getElementById("clinic-menu-toggle")?.focus();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menu]);

  function navigate(view: View, create = false, agent?: AgentId) {
    setRoute((previous) => ({ view, sequence: previous.sequence + 1, create, agent }));
    setMenu(false);
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutIssue("");
    try {
      await api("/auth/logout", "POST");
      setSession(null);
      setOrganizationId("");
      navigate("home");
    } catch (error) {
      setLogoutIssue(errorMessage(error));
    } finally {
      setLoggingOut(false);
    }
  }

  async function created(organization: Organization) {
    await refreshSession();
    setOrganizationId(organization.id);
    setShowNewOrganization(false);
    navigate("home");
    setNotice("Clínica criada.");
  }

  if (sessionError && session === undefined) return <div className="entry-shell"><header className="entry-header"><BrandLink/></header><main className="entry-main"><LoadError message={sessionError} retry={() => { void refreshSession().catch(() => {}); }} /></main></div>;
  if (session === undefined) return <main className="entry-main"><Loading label="Abrindo área da clínica…" /></main>;
  if (!session) return <Auth initialRegister={initialRegister} onSuccess={refreshSession} locale={preferredUiLocale ?? "pt-BR"} onLocaleChange={(next) => {
    savePreferredUiLocale(next);
  }} />;

  const member = session.user.isAdmin ? undefined : session.memberships.find(({ organization }) => organization.id === organizationId) ?? session.memberships[0];
  const baseOrganization = member?.organization;
  const organization = baseOrganization ? {
    ...baseOrganization,
    clinicLocale: baseOrganization.locale,
    locale: resolveUiLocale(preferredUiLocale ?? session.user.uiLocale ?? baseOrganization.locale),
  } : undefined;
  const view = session.user.isAdmin ? "admin" : route.view;
  const entryIsEn = (preferredUiLocale ?? (session.user.uiLocale ? resolveUiLocale(session.user.uiLocale) : "pt-BR")) === "en-US";

  if (!organization && !session.user.isAdmin) return <div className="entry-shell">
    <header className="entry-header"><BrandLink/><button className="button ghost" disabled={loggingOut} onClick={logout}><LogOut size={17}/>{entryIsEn ? "Sign out" : "Sair"}</button></header>
    <main className="entry-main"><div>{logoutIssue && <ErrorText>{logoutIssue}</ErrorText>}<OrganizationForm onSuccess={created} fullPage uiLocale={preferredUiLocale ?? (session.user.uiLocale ? resolveUiLocale(session.user.uiLocale) : "pt-BR")} /></div></main>
  </div>;

  const role = member?.role ?? "VIEWER";
  const canWrite = role !== "VIEWER";
  const locale = organization?.locale ?? preferredUiLocale ?? (session.user.uiLocale ? resolveUiLocale(session.user.uiLocale) : "pt-BR");
  const isEn = locale === "en-US";
  const roleLabel = isEn
    ? ({ OWNER: "Owner", MANAGER: "Manager", STAFF: "Staff", VIEWER: "Viewer" }[role])
    : roles[role];
  const visibleMainNav = (role === "VIEWER" ? mainNav.filter((item) => item.id !== "finance") : mainNav)
    .map((item) => ({ ...item, label: t(locale, item.key) }));
  const visibleUtilityNav = utilityNav.map((item) => ({ ...item, label: t(locale, item.key) }));
  const currentOptions = session.user.isAdmin
    ? [{ id: "admin" as const, label: t(locale, "nav_admin"), icon: ShieldCheck }]
    : organization ? [...visibleMainNav, ...visibleUtilityNav] : [];
  const currentLabel = currentOptions.find(({ id }) => id === view)?.label;
  const initials = session.user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase(locale);

  function updateOrganization(updated: Organization) {
    const { clinicLocale, ...rest } = updated;
    const persisted = { ...rest, locale: clinicLocale ?? updated.locale };
    setSession((current) => current ? {
      ...current,
      memberships: current.memberships.map((membership) => membership.organization.id === updated.id ? { ...membership, organization: persisted } : membership),
    } : current);
  }

  async function updateUiLocale(uiLocale: UiLocale) {
    const result = await api<{ user: Session["user"] }>("/auth/preferences", "PATCH", { uiLocale });
    setSession((current) => current ? { ...current, user: result.user } : current);
    savePreferredUiLocale(uiLocale);
    setNotice(uiLocale === "en-US" ? "Interface language saved." : "Idioma da interface salvo.");
  }

  async function toggleUiLocale() {
    if (!session) return;
    const next: UiLocale = isEn ? "pt-BR" : "en-US";
    if (session.user.isDemo) {
      savePreferredUiLocale(next);
      setNotice(next === "en-US" ? "Interface language changed." : "Idioma da interface alterado.");
      return;
    }
    try {
      await updateUiLocale(next);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  function section() {
    if (view === "admin" && session?.user.isAdmin) return <Admin onNotice={setNotice} locale={locale}/>;
    if (!organization) return null;
    if (view === "home") return <Home organization={organization} name={session!.user.name} isDemo={Boolean(session?.user.isDemo)} canWrite={canWrite} navigate={navigate}/>;
    if (view === "agenda") return <ClinicCalendar organization={organization} role={role} autoCreate={route.create} onNotice={setNotice} onOpenAgendaAgent={() => navigate("assistant", false, "agenda")} />;
    if (view === "assistant") return <Assistant organization={organization} role={role} initialAgent={route.agent ?? "main"} />;
    if (view === "finance" && role !== "VIEWER") return <Finance organization={organization} role={role} onNotice={setNotice} />;
    if (view === "settings") return <Settings organization={organization} role={role} onUpdate={updateOrganization} onNotice={setNotice} uiLocale={preferredUiLocale ?? resolveUiLocale(session!.user.uiLocale ?? organization.clinicLocale ?? organization.locale)} onUiLocaleChange={updateUiLocale}/>;
    if (view === "inbox") return <Inbox canPublish={role === "OWNER" || role === "MANAGER"} organization={organization} canWrite={canWrite} onNotice={setNotice}/>;
    if (view in recordViews) {
      const { resource, title, description } = recordViews[view as keyof typeof recordViews];
      const localizedTitle = isEn ? (view === "patients" ? "Patients" : "Tasks") : title;
      const localizedDesc = isEn
        ? (view === "patients" ? "View and update administrative patient records." : "Organize your clinic's pending tasks.")
        : description;
      return <><PageHeading title={localizedTitle} description={localizedDesc}/><Records resource={resource} organization={organization} canWrite={canWrite} autoCreate={route.create} onNotice={setNotice}/></>;
    }
  }

  return <div className="app-shell">
    {menu && <div className="sidebar-backdrop" aria-hidden="true" onClick={() => setMenu(false)} />}
    <aside className={`sidebar ${menu ? "visible" : ""}`} aria-label="Menu da clínica" id="clinic-sidebar">
      <div className="sidebar-logo"><BrandLink/></div>
      <div className="clinic-picker">
        <div className="clinic-icon"><Building2 size={18}/></div>
      {organization ? <label className="clinic-select"><span>{isEn ? "Current clinic" : "Clínica atual"}</span><select aria-label={isEn ? "Switch clinic" : "Trocar de clínica"} value={organization.id} onChange={(event) => { setOrganizationId(event.target.value); navigate("home"); }}>
          {session.memberships.map(({ organization: item }) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select><ChevronDown size={15}/></label> : <span>{isEn ? "Administration" : "Administração"}</span>}
      </div>
      <nav className="app-nav" aria-label={isEn ? "Platform areas" : "Áreas da plataforma"}>
        {currentOptions.map(({ id, label, icon: Icon }, index) => <button key={id} className={`nav-button ${view === id ? "selected" : ""} ${index === visibleMainNav.length ? "nav-separator" : ""}`} aria-current={view === id ? "page" : undefined} onClick={() => navigate(id)}><Icon size={19}/>{label}</button>)}
      </nav>
      {!session.user.isDemo && !session.user.isAdmin && <div className="sidebar-footer"><button className="nav-button" onClick={() => { setMenu(false); setShowNewOrganization(true); }}><Plus size={18}/>{isEn ? "New clinic" : "Criar clínica"}</button></div>}
    </aside>
    <div className="app-body">
      <header className="app-header">
        <div className="header-location"><button className="icon-button mobile-menu" id="clinic-menu-toggle" aria-label={isEn ? "Toggle menu" : "Alternar menu"} aria-controls="clinic-sidebar" aria-expanded={menu} onClick={() => setMenu(!menu)}><Menu size={22}/></button><span>{currentLabel}</span></div>
        <div className="header-user"><span className="avatar">{initials}</span><div><strong>{session.user.name}</strong><small>{session.user.isDemo ? (isEn ? "Demo" : "Demonstração") : organization ? roleLabel : "Super Admin"}</small></div><button className="button ghost compact" type="button" onClick={() => void toggleUiLocale()} aria-label={isEn ? "Switch to Portuguese" : "Switch to English"} title={isEn ? "Switch to Portuguese" : "Switch to English"}>{isEn ? "PT" : "EN"}</button><button className="icon-button logout-button" disabled={loggingOut} aria-label={isEn ? "Sign out" : "Sair"} title={isEn ? "Sign out" : "Sair"} onClick={logout}><LogOut size={19}/></button></div>
      </header>
      <main className="app-content" key={`${organization?.id ?? "admin"}-${route.sequence}`}>
        {logoutIssue && <ErrorText>{logoutIssue}</ErrorText>}
        {section()}
      </main>
    </div>
    {showNewOrganization && !session.user.isAdmin && <OrganizationForm onSuccess={created} onCancel={() => setShowNewOrganization(false)} uiLocale={preferredUiLocale ?? resolveUiLocale(session.user.uiLocale ?? organization?.clinicLocale ?? organization?.locale)} />}
    {notice && <div className="toast" role="status"><CircleCheck size={19}/>{notice}</div>}
  </div>;
}
