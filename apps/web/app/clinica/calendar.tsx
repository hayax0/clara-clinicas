"use client";

import gsap from "gsap";
import {
  Bell, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Mail, MapPin, Package,
  Pencil, Phone, Plus, Search, Sparkles, Stethoscope, Trash2, UserRound, Wallet, X, XCircle,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, Empty, ErrorText, LoadError, Loading, Status, useLoad } from "./components";
import { api, dateKey, displayDate, errorMessage, formatMoney, zonedToIso, type Organization, type Role, type Row } from "./data";
import { ReminderQueue } from "./reminders";

type CalendarMode = "week" | "day" | "month" | "list";
type AppointmentRow = {
  id: string;
  patientId: string;
  professionalId: string;
  serviceId: string;
  unitId: string;
  startAt: string;
  endAt: string;
  status: "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
  reminderPhone?: string | null;
};

type PatientRow = { id: string; name: string; email?: string | null; phone?: string | null };
type ProfessionalRow = { id: string; name: string; specialty?: string | null; email?: string | null };
type ServiceRow = { id: string; name: string; durationMinutes: number; priceCents: number };
type UnitRow = { id: string; name: string; address?: string | null };
type PatientPackageRow = {
  id: string;
  patientId: string;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  expired: boolean;
  expiresAt: string | null;
  servicePackage: { id: string; name: string };
};

const START_HOUR = 7;
const END_HOUR = 20;
const HOUR_HEIGHT = 62;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, idx) => START_HOUR + idx);

const statusLabels: Record<AppointmentRow["status"], string> = {
  SCHEDULED: "Agendada",
  CONFIRMED: "Confirmada",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

function addDays(dayStr: string, delta: number) {
  const date = new Date(`${dayStr}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function startOfWeek(dayStr: string, countryCode = "BR") {
  const date = new Date(`${dayStr}T12:00:00Z`);
  const dayOfWeek = date.getUTCDay(); // 0 = Sun, 1 = Mon
  const firstDay = countryCode === "US" ? 0 : 1;
  const offset = -((dayOfWeek - firstDay + 7) % 7);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function monthGridDays(dayStr: string, countryCode = "BR") {
  const first = `${dayStr.slice(0, 8)}01`;
  const gridStart = startOfWeek(first, countryCode);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

function minutesInTimezone(iso: string, timezone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map(({ type, value }) => [type, value]),
  );
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function timeStringInTimezone(iso: string, timezone: string, locale = "pt-BR") {
  return displayDate(iso, timezone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, locale);
}

function displayTimeInTimezone(iso: string, timezone: string, locale: string) {
  const options: Intl.DateTimeFormatOptions = locale === "en-US"
    ? { hour: "numeric", minute: "2-digit", hourCycle: "h12" }
    : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  return displayDate(iso, timezone, options, locale);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function addMinutesToLocalTime(dayStr: string, timeStr: string, durationMinutes: number) {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + durationMinutes;
  const clamped = Math.min(23 * 60 + 55, total);
  return `${dayStr}T${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
}

function initialsOf(name: string, locale = "pt-BR") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toLocaleUpperCase(locale);
}

export function ClinicCalendar({
  organization,
  role,
  autoCreate = false,
  onNotice,
  onOpenAgendaAgent,
}: {
  organization: Organization;
  role: Role;
  autoCreate?: boolean;
  onNotice: (message: string) => void;
  onOpenAgendaAgent: () => void;
}) {
  const root = `/organizations/${organization.id}`;
  const canWrite = role !== "VIEWER";
  const today = dateKey(new Date(), organization.timezone);
  const [mode, setMode] = useState<CalendarMode>("week");
  const [anchorDay, setAnchorDay] = useState(today);
  const [professionalFilter, setProfessionalFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | AppointmentRow["status"]>("");
  const [search, setSearch] = useState("");
  const [showReminders, setShowReminders] = useState(false);

  const [selected, setSelected] = useState<AppointmentRow | undefined>();
  const [editor, setEditor] = useState<
    | { mode: "new"; day: string; startTime: string; serviceId?: string }
    | { mode: "edit"; row: AppointmentRow }
    | undefined
  >(autoCreate && canWrite ? { mode: "new", day: today, startTime: "09:00" } : undefined);
  const [editorServiceId, setEditorServiceId] = useState("");
  const [editorStartLocal, setEditorStartLocal] = useState(`${today}T09:00`);
  const [editorEndLocal, setEditorEndLocal] = useState(`${today}T09:30`);
  const [confirmDelete, setConfirmDelete] = useState<AppointmentRow | undefined>();
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    const [appointments, patients, professionals, services, units, packages] = await Promise.all([
      api<AppointmentRow[]>(`${root}/appointments`, "GET", undefined, signal),
      api<PatientRow[]>(`${root}/patients`, "GET", undefined, signal),
      api<ProfessionalRow[]>(`${root}/professionals`, "GET", undefined, signal),
      api<ServiceRow[]>(`${root}/services`, "GET", undefined, signal),
      api<UnitRow[]>(`${root}/units`, "GET", undefined, signal),
      canWrite
        ? api<PatientPackageRow[]>(`${root}/packages?status=ACTIVE`, "GET", undefined, signal).catch(() => [])
        : Promise.resolve([] as PatientPackageRow[]),
    ]);
    return { appointments, patients, professionals, services, units, packages };
  }, [root, canWrite]);

  const { data, error, reload } = useLoad(load);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !data) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      gsap.from("[data-cal-reveal]", {
        y: 12,
        opacity: 0,
        duration: 0.42,
        stagger: 0.04,
        ease: "power3.out",
        clearProps: "transform,opacity",
      });
    }, containerRef);
    return () => ctx.revert();
  }, [mode, anchorDay, data]);

  const patientMap = useMemo(() => new Map((data?.patients ?? []).map((p) => [p.id, p])), [data?.patients]);
  const profMap = useMemo(() => new Map((data?.professionals ?? []).map((p) => [p.id, p])), [data?.professionals]);
  const serviceMap = useMemo(() => new Map((data?.services ?? []).map((s) => [s.id, s])), [data?.services]);
  const unitMap = useMemo(() => new Map((data?.units ?? []).map((u) => [u.id, u])), [data?.units]);
  const locale = organization.locale ?? "pt-BR";

  const filteredAppointments = useMemo(() => {
    const q = search.trim().toLocaleLowerCase(locale);
    return (data?.appointments ?? [])
      .filter((row) => {
        if (professionalFilter && row.professionalId !== professionalFilter) return false;
        if (unitFilter && row.unitId !== unitFilter) return false;
        if (statusFilter && row.status !== statusFilter) return false;
        if (q) {
          const patient = patientMap.get(row.patientId)?.name ?? "";
          const prof = profMap.get(row.professionalId)?.name ?? "";
          const srv = serviceMap.get(row.serviceId)?.name ?? "";
          if (!`${patient} ${prof} ${srv}`.toLocaleLowerCase(locale).includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  }, [data?.appointments, professionalFilter, unitFilter, statusFilter, search, patientMap, profMap, serviceMap, locale]);

  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(anchorDay, organization.countryCode ?? "BR");
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [anchorDay, organization.countryCode]);

  const monthDays = useMemo(() => monthGridDays(anchorDay, organization.countryCode ?? "BR"), [anchorDay, organization.countryCode]);
  const visibleDays = mode === "day" ? [anchorDay] : weekDays;

  const byDay = useMemo(() => {
    const map = new Map<string, AppointmentRow[]>();
    for (const appt of filteredAppointments) {
      const key = dateKey(appt.startAt, organization.timezone);
      const bucket = map.get(key) ?? [];
      bucket.push(appt);
      map.set(key, bucket);
    }
    return map;
  }, [filteredAppointments, organization.timezone]);

  const nowMinutes = minutesInTimezone(new Date().toISOString(), organization.timezone);
  const showNowLine = nowMinutes >= START_HOUR * 60 && nowMinutes <= (END_HOUR + 1) * 60;
  const nowTop = ((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;

  function stepPeriod(direction: -1 | 1) {
    if (mode === "day") setAnchorDay((d) => addDays(d, direction));
    else if (mode === "week") setAnchorDay((d) => addDays(d, direction * 7));
    else {
      const cur = new Date(`${anchorDay}T12:00:00Z`);
      cur.setUTCDate(1);
      cur.setUTCMonth(cur.getUTCMonth() + direction);
      setAnchorDay(cur.toISOString().slice(0, 10));
    }
  }

  const isEn = locale === "en-US";
  const formatHourLabel = (hour: number) => {
    if (!isEn) return `${pad2(hour)}:00`;
    const suffix = hour >= 12 ? "PM" : "AM";
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${h12}:00 ${suffix}`;
  };

  const periodTitle = useMemo(() => {
    if (mode === "day") {
      return displayDate(`${anchorDay}T12:00:00Z`, organization.timezone, { weekday: "long", day: "numeric", month: "long", year: "numeric" }, locale);
    }
    if (mode === "month") {
      return displayDate(`${anchorDay}T12:00:00Z`, organization.timezone, { month: "long", year: "numeric" }, locale);
    }
    const startLabel = displayDate(`${weekDays[0]}T12:00:00Z`, organization.timezone, { day: "numeric", month: "short" }, locale);
    const endLabel = displayDate(`${weekDays[6]}T12:00:00Z`, organization.timezone, { day: "numeric", month: "short", year: "numeric" }, locale);
    return `${startLabel} – ${endLabel}`;
  }, [mode, anchorDay, weekDays, organization.timezone, locale]);

  function openCreateModal(dayStr: string, startTime = "09:00") {
    if (!canWrite) return;
    setMutationError("");
    const defaultService = data?.services[0];
    const duration = defaultService?.durationMinutes ?? 30;
    setEditorServiceId(defaultService?.id ?? "");
    setEditorStartLocal(`${dayStr}T${startTime}`);
    setEditorEndLocal(addMinutesToLocalTime(dayStr, startTime, duration));
    setEditor({ mode: "new", day: dayStr, startTime, serviceId: defaultService?.id });
  }

  function openEditModal(row: AppointmentRow) {
    if (!canWrite) return;
    setMutationError("");
    const dayStr = dateKey(row.startAt, organization.timezone);
    const startTime = timeStringInTimezone(row.startAt, organization.timezone, locale);
    const endDay = dateKey(row.endAt, organization.timezone);
    const endTime = timeStringInTimezone(row.endAt, organization.timezone, locale);
    setEditorServiceId(row.serviceId);
    setEditorStartLocal(`${dayStr}T${startTime}`);
    setEditorEndLocal(`${endDay}T${endTime}`);
    setEditor({ mode: "edit", row });
  }

  function handleServiceChange(nextServiceId: string) {
    setEditorServiceId(nextServiceId);
    const srv = serviceMap.get(nextServiceId);
    if (srv && editorStartLocal.includes("T")) {
      const [dayPart, timePart] = editorStartLocal.split("T");
      setEditorEndLocal(addMinutesToLocalTime(dayPart, timePart, srv.durationMinutes));
    }
  }

  function handleStartChange(nextStart: string) {
    setEditorStartLocal(nextStart);
    const srv = serviceMap.get(editorServiceId);
    if (nextStart.includes("T")) {
      const [dayPart, timePart] = nextStart.split("T");
      setEditorEndLocal(addMinutesToLocalTime(dayPart, timePart, srv?.durationMinutes ?? 30));
    }
  }

  async function saveAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMutationError("");
    try {
      const startAt = zonedToIso(editorStartLocal, organization.timezone);
      const endAt = zonedToIso(editorEndLocal, organization.timezone);
      const body = {
        patientId: String(form.get("patientId") ?? ""),
        professionalId: String(form.get("professionalId") ?? ""),
        serviceId: editorServiceId || String(form.get("serviceId") ?? ""),
        unitId: String(form.get("unitId") ?? ""),
        startAt,
        endAt,
        reminderPhone: String(form.get("reminderPhone") ?? "").trim(),
        status: String(form.get("status") ?? "SCHEDULED"),
      };
      if (editor.mode === "new") {
        await api(`${root}/appointments`, "POST", body);
        setAnchorDay(dateKey(startAt, organization.timezone));
        onNotice("Agendamento criado.");
      } else {
        const updated = await api<AppointmentRow>(`${root}/appointments/${editor.row.id}`, "PATCH", body);
        setSelected(updated);
        onNotice("Agendamento atualizado.");
      }
      setEditor(undefined);
      reload();
    } catch (err) {
      setMutationError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function quickStatus(appt: AppointmentRow, nextStatus: AppointmentRow["status"]) {
    if (busy) return;
    setBusy(true);
    setMutationError("");
    try {
      const updated = await api<AppointmentRow>(`${root}/appointments/${appt.id}`, "PATCH", { status: nextStatus });
      setSelected(updated);
      onNotice(
        nextStatus === "CONFIRMED"
          ? "Consulta confirmada."
          : nextStatus === "COMPLETED"
            ? "Consulta marcada como concluída."
            : "Consulta cancelada.",
      );
      reload();
    } catch (err) {
      setMutationError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function consumePackageSession(pkg: PatientPackageRow, appt: AppointmentRow) {
    if (busy) return;
    setBusy(true);
    setMutationError("");
    try {
      await api(`${root}/packages/${pkg.id}/consume`, "POST", {
        appointmentId: appt.id,
        notes: `Sessão vinculada à consulta de ${displayDate(appt.startAt, organization.timezone, { dateStyle: "short", timeStyle: "short" }, locale)}`,
      });
      onNotice("Sessão descontada do pacote do paciente.");
      reload();
    } catch (err) {
      setMutationError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function createReceivableFromAppointment(appt: AppointmentRow) {
    const srv = serviceMap.get(appt.serviceId);
    const pat = patientMap.get(appt.patientId);
    if (!srv || srv.priceCents <= 0 || busy) return;
    setBusy(true);
    setMutationError("");
    try {
      await api(`${root}/finance/entries`, "POST", {
        type: "INCOME",
        description: `${srv.name} — ${pat?.name ?? "Paciente"}`.slice(0, 160),
        amountCents: srv.priceCents,
        dueDate: dateKey(appt.startAt, organization.timezone),
        patientId: appt.patientId,
        professionalId: appt.professionalId,
        notes: `Gerado a partir da Agenda (${displayDate(appt.startAt, organization.timezone, { dateStyle: "short", timeStyle: "short" }, locale)})`,
      });
      onNotice("Conta a receber lançada no Financeiro.");
    } catch (err) {
      setMutationError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeAppointment() {
    if (!confirmDelete || busy) return;
    setBusy(true);
    setMutationError("");
    try {
      await api(`${root}/appointments/${confirmDelete.id}`, "DELETE");
      setConfirmDelete(undefined);
      setSelected(undefined);
      onNotice("Agendamento removido.");
      reload();
    } catch (err) {
      setMutationError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const missingPrereqs = useMemo(() => {
    if (!data) return [];
    const list: string[] = [];
    if (!data.patients.length) list.push("Pacientes");
    if (!data.professionals.length) list.push("Profissionais");
    if (!data.services.length) list.push("Serviços");
    if (!data.units.length) list.push("Unidades");
    return list;
  }, [data]);

  const selectedPatient = selected ? patientMap.get(selected.patientId) : undefined;
  const selectedProf = selected ? profMap.get(selected.professionalId) : undefined;
  const selectedService = selected ? serviceMap.get(selected.serviceId) : undefined;
  const selectedUnit = selected ? unitMap.get(selected.unitId) : undefined;
  const selectedPatientPackages = useMemo(
    () => (selected ? (data?.packages ?? []).filter((p) => p.patientId === selected.patientId && p.status === "ACTIVE" && !p.expired) : []),
    [selected, data?.packages],
  );
  const selectedPatientHistory = useMemo(
    () =>
      selected
        ? (data?.appointments ?? [])
            .filter((a) => a.patientId === selected.patientId && a.id !== selected.id)
            .sort((a, b) => b.startAt.localeCompare(a.startAt))
            .slice(0, 4)
        : [],
    [selected, data?.appointments],
  );

  return (
    <div className="gcal-wrap" ref={containerRef}>
      <div className="page-heading gcal-head">
        <div>
          <h1>{isEn ? "Schedule" : "Agenda"}</h1>
          <p>{isEn ? "Visual clinic calendar connected to patients, packages, finance, and assistants." : "Calendário visual da clínica conectado a pacientes, pacotes, financeiro e assistentes."}</p>
        </div>
        <div className="heading-actions">
          {canWrite && (
            <button
              className={`button secondary ${showReminders ? "is-active" : ""}`}
              onClick={() => setShowReminders((v) => !v)}
            >
              <Bell size={16} /> {isEn ? "24h Reminders" : "Lembretes 24h"}
            </button>
          )}
          {canWrite && (
            <button className="button secondary" onClick={onOpenAgendaAgent}>
              <Sparkles size={16} /> {isEn ? "Schedule Agent" : "Agente Agenda"}
            </button>
          )}
          {canWrite && (
            <button className="button primary" onClick={() => openCreateModal(anchorDay, "09:00")}>
              <Plus size={17} /> {isEn ? "New appointment" : "Novo agendamento"}
            </button>
          )}
        </div>
      </div>

      {showReminders && canWrite && (
        <div style={{ marginBottom: "1rem" }}>
          <ReminderQueue organization={organization} />
        </div>
      )}

      <section className="panel gcal-shell" data-cal-reveal>
        {/* Google-Calendar-style top toolbar */}
        <div className="gcal-toolbar">
          <div className="gcal-nav-group">
            <button className="button secondary compact" onClick={() => setAnchorDay(today)}>
              {organization.locale === "en-US" ? "Today" : "Hoje"}
            </button>
            <div className="gcal-arrows">
              <button className="icon-button" aria-label={organization.locale === "en-US" ? "Previous period" : "Período anterior"} onClick={() => stepPeriod(-1)}>
                <ChevronLeft size={18} />
              </button>
              <button className="icon-button" aria-label={organization.locale === "en-US" ? "Next period" : "Próximo período"} onClick={() => stepPeriod(1)}>
                <ChevronRight size={18} />
              </button>
            </div>
            <h2 className="gcal-period-title">{periodTitle}</h2>
          </div>

          <div className="gcal-controls">
            <div className="gcal-mode-switch" role="group" aria-label={organization.locale === "en-US" ? "Calendar view mode" : "Modo de visualização da agenda"}>
              {(
                organization.locale === "en-US"
                  ? ([
                      ["day", "Day"],
                      ["week", "Week"],
                      ["month", "Month"],
                      ["list", "List"],
                    ] as const)
                  : ([
                      ["day", "Dia"],
                      ["week", "Semana"],
                      ["month", "Mês"],
                      ["list", "Lista"],
                    ] as const)
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={mode === id}
                  onClick={() => setMode(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filters bar */}
        <div className="gcal-filters">
          <label className="search-field gcal-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isEn ? "Search patient, provider or service…" : "Buscar paciente, profissional ou serviço…"}
              aria-label={isEn ? "Search schedule" : "Buscar na agenda"}
            />
          </label>
          <select
            aria-label={isEn ? "Filter by provider" : "Filtrar por profissional"}
            className="finance-filter"
            value={professionalFilter}
            onChange={(e) => setProfessionalFilter(e.target.value)}
          >
            <option value="">{isEn ? "All providers" : "Todos os profissionais"}</option>
            {(data?.professionals ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            aria-label={isEn ? "Filter by location" : "Filtrar por unidade"}
            className="finance-filter"
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
          >
            <option value="">{isEn ? "All locations" : "Todas as unidades"}</option>
            {(data?.units ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select
            aria-label={isEn ? "Filter by status" : "Filtrar por status"}
            className="finance-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | AppointmentRow["status"])}
          >
            <option value="">{isEn ? "All statuses" : "Todos os status"}</option>
            <option value="SCHEDULED">{isEn ? "Scheduled" : "Agendada"}</option>
            <option value="CONFIRMED">{isEn ? "Confirmed" : "Confirmada"}</option>
            <option value="COMPLETED">{isEn ? "Completed" : "Concluída"}</option>
            <option value="CANCELLED">{isEn ? "Cancelled" : "Cancelada"}</option>
          </select>
        </div>

        {error ? (
          <LoadError message={error} retry={reload} />
        ) : !data ? (
          <Loading label={isEn ? "Loading clinic schedule…" : "Carregando calendário da clínica…"} />
        ) : mode === "week" || mode === "day" ? (
          <div className="gcal-grid-scroll">
            <div className={`gcal-timegrid ${mode === "day" ? "is-day" : "is-week"}`}>
              {/* Sticky header with days */}
              <div className="gcal-corner" />
              {visibleDays.map((dayStr) => {
                const isToday = dayStr === today;
                const count = (byDay.get(dayStr) ?? []).filter((a) => a.status !== "CANCELLED").length;
                return (
                  <button
                    key={dayStr}
                    type="button"
                    className={`gcal-day-head ${isToday ? "is-today" : ""}`}
                    onClick={() => {
                      setAnchorDay(dayStr);
                      if (mode === "week") setMode("day");
                    }}
                  >
                    <span className="gcal-weekday">
                      {displayDate(`${dayStr}T12:00:00Z`, organization.timezone, { weekday: "short" }, locale)}
                    </span>
                    <strong className="gcal-daynum">{dayStr.slice(8, 10)}</strong>
                    <small className="gcal-daycount">{count ? (isEn ? `${count} appt${count > 1 ? "s" : ""}` : `${count} hor.`) : (isEn ? "free" : "livre")}</small>
                  </button>
                );
              })}

              {/* Time ruler column */}
              <div className="gcal-hours-col" style={{ height: HOURS.length * HOUR_HEIGHT }}>
                {HOURS.map((hour) => (
                  <div key={hour} className="gcal-hour-label" style={{ height: HOUR_HEIGHT }}>
                    <span>{formatHourLabel(hour)}</span>
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {visibleDays.map((dayStr) => {
                const isToday = dayStr === today;
                const events = byDay.get(dayStr) ?? [];
                return (
                  <div
                    key={dayStr}
                    className={`gcal-day-col ${isToday ? "is-today" : ""}`}
                    style={{ height: HOURS.length * HOUR_HEIGHT }}
                  >
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        className="gcal-hour-slot"
                        style={{ height: HOUR_HEIGHT }}
                        role={canWrite ? "button" : undefined}
                        tabIndex={canWrite ? 0 : undefined}
                        aria-label={canWrite ? `Agendar em ${dayStr} às ${pad2(hour)}:00` : undefined}
                        onClick={() => canWrite && openCreateModal(dayStr, `${pad2(hour)}:00`)}
                        onKeyDown={(e) => {
                          if (canWrite && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault();
                            openCreateModal(dayStr, `${pad2(hour)}:00`);
                          }
                        }}
                      />
                    ))}

                    {isToday && showNowLine && (
                      <div className="gcal-now-line" style={{ top: nowTop }} aria-hidden="true">
                        <span className="gcal-now-dot" />
                      </div>
                    )}

                    {events.map((appt) => {
                      const startMin = minutesInTimezone(appt.startAt, organization.timezone);
                      const endMin = Math.max(startMin + 20, minutesInTimezone(appt.endAt, organization.timezone));
                      const clampedStart = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60 + 45, startMin));
                      const top = ((clampedStart - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                      const height = Math.max(34, ((endMin - startMin) / 60) * HOUR_HEIGHT - 3);
                      const pat = patientMap.get(appt.patientId);
                      const prof = profMap.get(appt.professionalId);
                      const srv = serviceMap.get(appt.serviceId);
                      return (
                        <button
                          key={appt.id}
                          type="button"
                          className={`gcal-event status-${appt.status.toLowerCase()} ${selected?.id === appt.id ? "is-selected" : ""}`}
                          style={{ top, height }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMutationError("");
                            setSelected(appt);
                          }}
                        >
                          <div className="gcal-event-head">
                            <time>{displayTimeInTimezone(appt.startAt, organization.timezone, locale)}</time>
                            <span className="gcal-event-pill">{statusLabels[appt.status]}</span>
                          </div>
                          <strong className="gcal-event-patient">{pat?.name ?? "Paciente"}</strong>
                          {height >= 48 && (
                            <small className="gcal-event-meta">
                              {[srv?.name, prof?.name].filter(Boolean).join(" · ")}
                            </small>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        ) : mode === "month" ? (
          <div className="gcal-month">
            <div className="gcal-month-weekdays">
              {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="gcal-month-grid">
              {monthDays.map((dayStr) => {
                const inMonth = dayStr.slice(0, 7) === anchorDay.slice(0, 7);
                const isToday = dayStr === today;
                const events = byDay.get(dayStr) ?? [];
                return (
                  <div key={dayStr} className={`gcal-month-cell ${!inMonth ? "is-outside" : ""} ${isToday ? "is-today" : ""}`}>
                    <div className="gcal-month-cell-head">
                      <button
                        type="button"
                        className="gcal-month-daybtn"
                        onClick={() => {
                          setAnchorDay(dayStr);
                          setMode("day");
                        }}
                      >
                        {Number(dayStr.slice(8, 10))}
                      </button>
                      {canWrite && (
                        <button
                          type="button"
                          className="gcal-month-add"
                          aria-label={`Agendar em ${dayStr}`}
                          onClick={() => openCreateModal(dayStr, "09:00")}
                        >
                          <Plus size={13} />
                        </button>
                      )}
                    </div>
                    <div className="gcal-month-events">
                      {events.slice(0, 3).map((appt) => (
                        <button
                          key={appt.id}
                          type="button"
                          className={`gcal-month-pill status-${appt.status.toLowerCase()}`}
                          onClick={() => {
                            setMutationError("");
                            setSelected(appt);
                          }}
                        >
                          <span>{displayTimeInTimezone(appt.startAt, organization.timezone, locale)}</span>
                          <strong>{patientMap.get(appt.patientId)?.name ?? "Paciente"}</strong>
                        </button>
                      ))}
                      {events.length > 3 && (
                        <button
                          type="button"
                          className="gcal-month-more"
                          onClick={() => {
                            setAnchorDay(dayStr);
                            setMode("day");
                          }}
                        >
                          +{events.length - 3} horário(s)
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : filteredAppointments.length === 0 ? (
          <Empty calendar>Nenhum atendimento encontrado para os filtros aplicados.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Data e hora</th>
                  <th>Profissional</th>
                  <th>Serviço</th>
                  <th>Status</th>
                  <th className="table-actions">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {filteredAppointments.map((appt) => (
                  <tr key={appt.id}>
                    <td>{patientMap.get(appt.patientId)?.name ?? "—"}</td>
                    <td>{displayDate(appt.startAt, organization.timezone, { dateStyle: "short", timeStyle: "short" }, locale)}</td>
                    <td>{profMap.get(appt.professionalId)?.name ?? "—"}</td>
                    <td>{serviceMap.get(appt.serviceId)?.name ?? "—"}</td>
                    <td>
                      <Status status={appt.status}>{statusLabels[appt.status]}</Status>
                    </td>
                    <td className="table-actions">
                      <button
                        className="button secondary compact"
                        onClick={() => {
                          setMutationError("");
                          setSelected(appt);
                        }}
                      >
                        Abrir ficha
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Patient & Appointment Glass Drawer */}
      {selected && (
        <div className="gcal-drawer-backdrop" onClick={() => !busy && setSelected(undefined)}>
          <aside
            className="gcal-drawer"
            role="dialog"
            aria-label="Detalhes do agendamento e paciente"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="gcal-drawer-head">
              <div className="gcal-drawer-patient-id">
                <span className="avatar gcal-drawer-avatar">{initialsOf(selectedPatient?.name ?? "P", locale)}</span>
                <div>
                  <h2>{selectedPatient?.name ?? "Paciente"}</h2>
                  <Status status={selected.status}>{statusLabels[selected.status]}</Status>
                </div>
              </div>
              <button className="icon-button" aria-label="Fechar painel" onClick={() => setSelected(undefined)}>
                <X size={20} />
              </button>
            </div>

            {mutationError && (
              <div style={{ marginBottom: ".8rem" }}>
                <ErrorText>{mutationError}</ErrorText>
              </div>
            )}

            {/* Patient contact & info card */}
            <section className="gcal-drawer-card">
              <h3><UserRound size={15} /> Informações do paciente</h3>
              <dl className="gcal-info-list">
                <div>
                  <dt><Phone size={14} /> Telefone</dt>
                  <dd>{selectedPatient?.phone || "Não informado"}</dd>
                </div>
                <div>
                  <dt><Mail size={14} /> E-mail</dt>
                  <dd>{selectedPatient?.email || "Não informado"}</dd>
                </div>
              </dl>
            </section>

            {/* Appointment details card */}
            <section className="gcal-drawer-card">
              <h3><CalendarDays size={15} /> Detalhes da consulta</h3>
              <dl className="gcal-info-list">
                <div>
                  <dt><Clock size={14} /> Horário</dt>
                  <dd>
                    {displayDate(selected.startAt, organization.timezone, { weekday: "short", day: "2-digit", month: "short" }, locale)}
                    {" · "}
                    {displayTimeInTimezone(selected.startAt, organization.timezone, locale)} –{" "}
                    {displayTimeInTimezone(selected.endAt, organization.timezone, locale)}
                  </dd>
                </div>
                <div>
                  <dt><Stethoscope size={14} /> Profissional</dt>
                  <dd>
                    {selectedProf?.name ?? "—"}
                    {selectedProf?.specialty ? ` (${selectedProf.specialty})` : ""}
                  </dd>
                </div>
                <div>
                  <dt><Sparkles size={14} /> Serviço</dt>
                  <dd>
                    {selectedService?.name ?? "—"}
                    {selectedService
                      ? ` · ${selectedService.durationMinutes} min · ${formatMoney(selectedService.priceCents, organization.currency, organization.locale)}`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt><MapPin size={14} /> Unidade</dt>
                  <dd>{selectedUnit?.name ?? "—"}</dd>
                </div>
                {selected.reminderPhone && (
                  <div>
                    <dt><Bell size={14} /> WhatsApp lembrete</dt>
                    <dd>+{selected.reminderPhone}</dd>
                  </div>
                )}
              </dl>
            </section>

            {/* Connected patient packages */}
            {canWrite && (
              <section className="gcal-drawer-card">
                <h3><Package size={15} /> Pacotes ativos do paciente</h3>
                {selectedPatientPackages.length === 0 ? (
                  <p className="gcal-drawer-muted">Nenhum pacote ativo vinculado a este paciente.</p>
                ) : (
                  <ul className="gcal-pkg-list">
                    {selectedPatientPackages.map((pkg) => (
                      <li key={pkg.id}>
                        <div>
                          <strong>{pkg.servicePackage.name}</strong>
                          <small>
                            {pkg.usedSessions}/{pkg.totalSessions} usadas · {pkg.remainingSessions} restante(s)
                          </small>
                        </div>
                        <button
                          className="button secondary compact"
                          disabled={busy}
                          onClick={() => void consumePackageSession(pkg, selected)}
                        >
                          <Check size={14} /> Usar sessão
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* Quick platform actions */}
            {canWrite && (
              <section className="gcal-drawer-card">
                <h3>Ações rápidas</h3>
                <div className="gcal-drawer-actions">
                  {selected.status === "SCHEDULED" && (
                    <button
                      className="button primary compact"
                      disabled={busy}
                      onClick={() => void quickStatus(selected, "CONFIRMED")}
                    >
                      <CheckCircle2 size={15} /> Confirmar
                    </button>
                  )}
                  {(selected.status === "SCHEDULED" || selected.status === "CONFIRMED") && (
                    <button
                      className="button secondary compact"
                      disabled={busy}
                      onClick={() => void quickStatus(selected, "COMPLETED")}
                    >
                      <Check size={15} /> Concluir
                    </button>
                  )}
                  {selectedService && selectedService.priceCents > 0 && selected.status !== "CANCELLED" && (
                    <button
                      className="button secondary compact"
                      disabled={busy}
                      onClick={() => void createReceivableFromAppointment(selected)}
                    >
                      <Wallet size={15} /> Lançar no Financeiro
                    </button>
                  )}
                  <button
                    className="button secondary compact"
                    disabled={busy}
                    onClick={() => openEditModal(selected)}
                  >
                    <Pencil size={15} /> Reagendar / Editar
                  </button>
                  {selected.status !== "CANCELLED" && selected.status !== "COMPLETED" && (
                    <button
                      className="button secondary compact"
                      disabled={busy}
                      onClick={() => void quickStatus(selected, "CANCELLED")}
                    >
                      <XCircle size={15} /> Cancelar
                    </button>
                  )}
                  <button
                    className="button ghost compact"
                    style={{ color: "var(--error)" }}
                    disabled={busy}
                    onClick={() => setConfirmDelete(selected)}
                  >
                    <Trash2 size={15} /> Remover
                  </button>
                </div>
              </section>
            )}

            {/* Patient recent appointments */}
            {selectedPatientHistory.length > 0 && (
              <section className="gcal-drawer-card">
                <h3>Histórico recente do paciente</h3>
                <ul className="gcal-hist-list">
                  {selectedPatientHistory.map((item) => (
                    <li key={item.id}>
                      <span>{displayDate(item.startAt, organization.timezone, { dateStyle: "short", timeStyle: "short" }, locale)}</span>
                      <strong>{serviceMap.get(item.serviceId)?.name ?? "Consulta"}</strong>
                      <Status status={item.status}>{statusLabels[item.status]}</Status>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      )}

      {/* Create / Edit Appointment Dialog */}
      {editor && (
        <Dialog
          title={editor.mode === "new" ? "Novo agendamento" : "Editar agendamento"}
          busy={busy}
          onClose={() => setEditor(undefined)}
        >
          {missingPrereqs.length > 0 ? (
            <>
              <p className="confirm-copy">
                Antes de agendar, cadastre {missingPrereqs.join(", ")} (você pode usar Configurações/Pacientes ou pedir
                direto no chat do Agente Agenda).
              </p>
              <div className="dialog-actions">
                <button type="button" className="button secondary" onClick={() => setEditor(undefined)}>
                  Fechar
                </button>
                <button
                  type="button"
                  className="button primary"
                  onClick={() => {
                    setEditor(undefined);
                    onOpenAgendaAgent();
                  }}
                >
                  <Sparkles size={15} /> Configurar pelo Agente
                </button>
              </div>
            </>
          ) : (
            <form className="form-stack" onSubmit={saveAppointment}>
              <label className="form-field">
                <span>Paciente</span>
                <select
                  name="patientId"
                  required
                  defaultValue={editor.mode === "edit" ? editor.row.patientId : data?.patients[0]?.id ?? ""}
                >
                  {(data?.patients ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Profissional</span>
                <select
                  name="professionalId"
                  required
                  defaultValue={editor.mode === "edit" ? editor.row.professionalId : data?.professionals[0]?.id ?? ""}
                >
                  {(data?.professionals ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Serviço</span>
                <select
                  name="serviceId"
                  required
                  value={editorServiceId}
                  onChange={(e) => handleServiceChange(e.target.value)}
                >
                  {(data?.services ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.durationMinutes} min · {formatMoney(s.priceCents, organization.currency, organization.locale)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Unidade</span>
                <select
                  name="unitId"
                  required
                  defaultValue={editor.mode === "edit" ? editor.row.unitId : data?.units[0]?.id ?? ""}
                >
                  {(data?.units ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="gcal-two-col">
                <label className="form-field">
                  <span>Início</span>
                  <input
                    type="datetime-local"
                    required
                    value={editorStartLocal}
                    onChange={(e) => handleStartChange(e.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span>Término</span>
                  <input
                    type="datetime-local"
                    required
                    value={editorEndLocal}
                    onChange={(e) => setEditorEndLocal(e.target.value)}
                  />
                </label>
              </div>
              <label className="form-field">
                <span>WhatsApp autorizado para lembrete (com DDI, opcional)</span>
                <input
                  name="reminderPhone"
                  type="tel"
                  defaultValue={editor.mode === "edit" ? editor.row.reminderPhone ?? "" : ""}
                  placeholder="Ex. 5511999999999"
                />
              </label>
              <label className="form-field">
                <span>Status</span>
                <select name="status" defaultValue={editor.mode === "edit" ? editor.row.status : "SCHEDULED"}>
                  <option value="SCHEDULED">Agendada</option>
                  <option value="CONFIRMED">Confirmada</option>
                  <option value="COMPLETED">Concluída</option>
                  <option value="CANCELLED">Cancelada</option>
                </select>
              </label>
              {mutationError && <ErrorText>{mutationError}</ErrorText>}
              <div className="dialog-actions">
                <button type="button" className="button secondary" disabled={busy} onClick={() => setEditor(undefined)}>
                  Cancelar
                </button>
                <button className="button primary" disabled={busy}>
                  {busy ? "Salvando…" : editor.mode === "new" ? "Salvar agendamento" : "Salvar alterações"}
                </button>
              </div>
            </form>
          )}
        </Dialog>
      )}

      {confirmDelete && (
        <Dialog title="Remover agendamento" busy={busy} onClose={() => setConfirmDelete(undefined)}>
          <p className="confirm-copy">
            Remover permanentemente o agendamento de {patientMap.get(confirmDelete.patientId)?.name ?? "paciente"} em{" "}
            {displayDate(confirmDelete.startAt, organization.timezone, { dateStyle: "short", timeStyle: "short" }, locale)}?
          </p>
          {mutationError && <ErrorText>{mutationError}</ErrorText>}
          <div className="dialog-actions">
            <button type="button" className="button secondary" disabled={busy} onClick={() => setConfirmDelete(undefined)}>
              Voltar
            </button>
            <button className="button danger" disabled={busy} onClick={() => void removeAppointment()}>
              {busy ? "Removendo…" : "Remover"}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

// Keep unused Row import check clean
export type _CalendarRowRef = Row;
