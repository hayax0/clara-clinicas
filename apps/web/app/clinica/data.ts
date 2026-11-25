export type Organization = {
  id: string;
  name: string;
  countryCode?: "BR" | "PT" | "ES" | "US";
  timezone: string;
  currency?: string;
  locale?: string;
  clinicLocale?: string;
  status?: "ACTIVE" | "SUSPENDED";
};
export type Role = "OWNER" | "MANAGER" | "STAFF" | "VIEWER";
export type Session = {
  user: { name: string; email: string; isAdmin: boolean; isDemo?: boolean; uiLocale?: "pt-BR" | "en-US" | null };
  memberships: { organization: Organization; role: Role }[];
};
export type Row = { id: string } & Record<string, string | number | boolean | null | undefined>;
export type Member = { id: string; role: Role; user: { name: string; email: string } };
export type Metrics = Record<"appointments" | "patients" | "contacts" | "opportunities" | "tasks", number>;
export type Resource = "units" | "services" | "professionals" | "contacts" | "patients" | "opportunities" | "appointments" | "tasks";
export type View = "home" | "agenda" | "patients" | "inbox" | "finance" | "assistant" | "tasks" | "settings" | "admin";

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal,
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = Array.isArray(payload?.message) ? payload.message.join(" ") : payload?.message;
    throw new ApiError(response.status, typeof message === "string" ? message : "Não foi possível concluir a solicitação.");
  }
  return payload as T;
}

export function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Não foi possível conectar. Tente novamente.";
}

export const roles: Record<Role, string> = {
  OWNER: "Proprietário", MANAGER: "Gestor", STAFF: "Equipe", VIEWER: "Leitura",
};

const appointmentStatus = { SCHEDULED: "Agendada", CONFIRMED: "Confirmada", COMPLETED: "Concluída", CANCELLED: "Cancelada" };
export const contactSources: Record<string,string> = { REFERRAL:"Indicação", INSTAGRAM:"Instagram", GOOGLE:"Google", WHATSAPP:"WhatsApp", WEBSITE:"Site", OTHER:"Outra" };
export const stages = { NEW: "Nova", CONTACTED: "Em contato", BOOKED: "Agendada", WON: "Convertida", LOST: "Perdida" };
const taskStatus = { OPEN: "Aberta", DONE: "Concluída" };

export type Field = {
  key: string;
  label: string;
  type?: "email" | "tel" | "number" | "money" | "datetime-local" | "select";
  required?: boolean;
  relation?: Resource;
  options?: Record<string, string>;
  initial?: string;
  min?: number;
};

type ResourceConfig = {
  title: string;
  singular: string;
  add: string;
  empty: string;
  fields: Field[];
  columns: string[];
};

const name = { key: "name", label: "Nome", required: true };
const email = { key: "email", label: "E-mail", type: "email" } as const;
const phone = { key: "phone", label: "Telefone", type: "tel" } as const;
const title = { key: "title", label: "Título", required: true };
export const resources: Record<Resource, ResourceConfig> = {
  units: {
    title: "Unidades", singular: "unidade", add: "Nova unidade", empty: "Nenhuma unidade cadastrada.",
    fields: [name, { key: "address", label: "Endereço" }],
    columns: ["name", "address"],
  },
  services: {
    title: "Serviços", singular: "serviço", add: "Novo serviço", empty: "Nenhum serviço cadastrado.",
    fields: [name, { key: "durationMinutes", label: "Duração em minutos", type: "number", required: true, min: 5, initial: "30" }, { key: "priceCents", label: "Preço", type: "money", required: true, min: 0, initial: "0" }],
    columns: ["name", "durationMinutes", "priceCents"],
  },
  professionals: {
    title: "Profissionais", singular: "profissional", add: "Novo profissional", empty: "Nenhum profissional cadastrado.",
    fields: [name, { key: "specialty", label: "Especialidade" }, email],
    columns: ["name", "specialty", "email"],
  },
  contacts: {
    title: "Contatos", singular: "contato", add: "Novo contato", empty: "Nenhum contato cadastrado.",
    fields: [name, email, phone, {key:"source",label:"Origem",type:"select",options:contactSources}, {key:"leadStatus",label:"Acompanhamento",type:"select",options:{NEW:"Novo",CONTACTED:"Contatado",WAITING:"Aguardando retorno",DONE:"Concluído"},initial:"NEW",required:true}, {key:"followUpAt",label:"Próximo retorno",type:"datetime-local"}],
    columns: ["name", "email", "phone", "source","leadStatus","followUpAt"],
  },
  patients: {
    title: "Pacientes", singular: "paciente", add: "Novo paciente", empty: "Nenhum paciente cadastrado.",
    fields: [name, email, phone],
    columns: ["name", "email", "phone"],
  },
  opportunities: {
    title: "Oportunidades", singular: "oportunidade", add: "Nova oportunidade", empty: "Nenhuma oportunidade cadastrada.",
    fields: [title, { key: "contactId", label: "Contato", type: "select", relation: "contacts", required: true }, { key: "stage", label: "Etapa", type: "select", options: stages, initial: "NEW", required: true }],
    columns: ["title", "contactId", "stage"],
  },
  appointments: {
    title: "Agendamentos", singular: "agendamento", add: "Novo agendamento", empty: "Nenhum atendimento encontrado.",
    fields: [
      { key: "patientId", label: "Paciente", type: "select", relation: "patients", required: true },
      { key: "professionalId", label: "Profissional", type: "select", relation: "professionals", required: true },
      { key: "serviceId", label: "Serviço", type: "select", relation: "services", required: true },
      { key: "unitId", label: "Unidade", type: "select", relation: "units", required: true },
      { key: "startAt", label: "Início", type: "datetime-local", required: true },
      { key: "reminderPhone", label: "WhatsApp autorizado para lembrete desta consulta (com DDI). Deixe vazio sem autorização.", type: "tel" },
      { key: "endAt", label: "Término", type: "datetime-local", required: true },
      { key: "status", label: "Status", type: "select", options: appointmentStatus, initial: "SCHEDULED", required: true },
    ],
    columns: ["patientId", "startAt", "professionalId", "serviceId", "status"],
  },
  tasks: {
    title: "Tarefas", singular: "tarefa", add: "Nova tarefa", empty: "Nenhuma tarefa cadastrada.",
    fields: [title, { key: "dueAt", label: "Prazo", type: "datetime-local" }, { key: "status", label: "Status", type: "select", options: taskStatus, initial: "OPEN", required: true }],
    columns: ["title", "dueAt", "status"],
  },
};

const isoLocal = (date: Date, timezone: string) => {
  const options = { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" } as const;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", options).formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};

export function dateKey(value: string | Date, timezone: string) {
  return isoLocal(new Date(value), timezone).slice(0, 10);
}

export function displayDate(
  value: string | Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
  locale = "pt-BR",
) {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: timezone }).format(new Date(value));
}

const enResources: Record<Resource, ResourceConfig> = {
  units: {
    title: "Locations", singular: "location", add: "New location", empty: "No locations registered yet.",
    fields: [{ key: "name", label: "Name", required: true }, { key: "address", label: "Address" }],
    columns: ["name", "address"],
  },
  services: {
    title: "Services", singular: "service", add: "New service", empty: "No services registered yet.",
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "durationMinutes", label: "Duration (min)", type: "number", required: true, min: 5, initial: "30" },
      { key: "priceCents", label: "Price", type: "money", required: true, min: 0, initial: "0" },
    ],
    columns: ["name", "durationMinutes", "priceCents"],
  },
  professionals: {
    title: "Providers", singular: "provider", add: "New provider", empty: "No providers registered yet.",
    fields: [{ key: "name", label: "Name", required: true }, { key: "specialty", label: "Specialty" }, { key: "email", label: "Email", type: "email" }],
    columns: ["name", "specialty", "email"],
  },
  contacts: {
    title: "Contacts", singular: "contact", add: "New contact", empty: "No contacts registered yet.",
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone", type: "tel" },
      { key: "source", label: "Source", type: "select", options: { REFERRAL: "Referral", INSTAGRAM: "Instagram", GOOGLE: "Google", WHATSAPP: "WhatsApp", WEBSITE: "Website", OTHER: "Other" } },
      { key: "leadStatus", label: "Lead status", type: "select", options: { NEW: "New", CONTACTED: "Contacted", WAITING: "Awaiting reply", DONE: "Done" }, initial: "NEW", required: true },
      { key: "followUpAt", label: "Next follow-up", type: "datetime-local" },
    ],
    columns: ["name", "email", "phone", "source", "leadStatus", "followUpAt"],
  },
  patients: {
    title: "Patients", singular: "patient", add: "New patient", empty: "No patients registered yet.",
    fields: [{ key: "name", label: "Name", required: true }, { key: "email", label: "Email", type: "email" }, { key: "phone", label: "Phone", type: "tel" }],
    columns: ["name", "email", "phone"],
  },
  opportunities: {
    title: "Opportunities", singular: "opportunity", add: "New opportunity", empty: "No opportunities registered yet.",
    fields: [
      { key: "title", label: "Title", required: true },
      { key: "contactId", label: "Contact", type: "select", relation: "contacts", required: true },
      { key: "stage", label: "Stage", type: "select", options: { NEW: "New", CONTACTED: "Contacted", BOOKED: "Booked", WON: "Won", LOST: "Lost" }, initial: "NEW", required: true },
    ],
    columns: ["title", "contactId", "stage"],
  },
  appointments: {
    title: "Appointments", singular: "appointment", add: "New appointment", empty: "No appointments found.",
    fields: [
      { key: "patientId", label: "Patient", type: "select", relation: "patients", required: true },
      { key: "professionalId", label: "Provider", type: "select", relation: "professionals", required: true },
      { key: "serviceId", label: "Service", type: "select", relation: "services", required: true },
      { key: "unitId", label: "Location", type: "select", relation: "units", required: true },
      { key: "startAt", label: "Start", type: "datetime-local", required: true },
      { key: "reminderPhone", label: "Authorized phone for reminder (with country code). Leave blank if not authorized.", type: "tel" },
      { key: "endAt", label: "End", type: "datetime-local", required: true },
      { key: "status", label: "Status", type: "select", options: { SCHEDULED: "Scheduled", CONFIRMED: "Confirmed", COMPLETED: "Completed", CANCELLED: "Cancelled" }, initial: "SCHEDULED", required: true },
    ],
    columns: ["patientId", "startAt", "professionalId", "serviceId", "status"],
  },
  tasks: {
    title: "Tasks", singular: "task", add: "New task", empty: "No tasks registered yet.",
    fields: [
      { key: "title", label: "Title", required: true },
      { key: "dueAt", label: "Due date", type: "datetime-local" },
      { key: "status", label: "Status", type: "select", options: { OPEN: "Open", DONE: "Done" }, initial: "OPEN", required: true },
    ],
    columns: ["title", "dueAt", "status"],
  },
};

export function getResourceConfig(resource: Resource, locale?: string): ResourceConfig {
  return locale === "en-US" ? enResources[resource] : resources[resource];
}

export function zonedToIso(value: string, timezone: string) {
  const desired = Date.parse(`${value}Z`);
  let candidate = desired;
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = isoLocal(new Date(candidate), timezone);
    if (current === value) return new Date(candidate).toISOString();
    candidate += desired - Date.parse(`${current}Z`);
  }
  throw new Error("Horário inválido para o fuso da clínica.");
}

export function initialValue(field: Field, row: Row | undefined, timezone: string) {
  const value = row?.[field.key];
  if (value == null) return field.initial ?? "";
  if (field.type === "datetime-local") return isoLocal(new Date(String(value)), timezone);
  if (field.type === "money") return (Number(value) / 100).toFixed(2);
  return String(value);
}

export function formPayload(fields: Field[], form: FormData, timezone: string, locale = "pt-BR") {
  const body: Record<string, unknown> = {};
  for (const field of fields) {
    const value = String(form.get(field.key) ?? "").trim();
    if (!value) {
      if (!field.required) body[field.key] = "";
      continue;
    }
    if (field.type === "datetime-local") body[field.key] = zonedToIso(value, timezone);
    else if (field.type === "money") body[field.key] = parseLocaleMoneyToCents(value, locale);
    else if (field.type === "number") body[field.key] = Number(value);
    else body[field.key] = value;
  }
  return body;
}

export function lookupLabel(rows: Row[] | undefined, id: unknown) {
  return String(rows?.find((row) => row.id === id)?.name ?? "—");
}

export function formatMoney(cents: number, currency = "BRL", locale = "pt-BR") {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: /^[A-Z]{3}$/.test(currency) ? currency : "USD" }).format(cents / 100);
  }
}

export function parseLocaleMoneyToCents(raw: string, locale = "pt-BR") {
  // Number inputs expose a canonical dot decimal even when their UI follows a comma-decimal locale.
  if (/^\d+(?:\.\d+)?$/.test(raw.trim())) {
    const canonical = Number(raw);
    return Number.isFinite(canonical) ? Math.round(canonical * 100) : 0;
  }
  const sample = new Intl.NumberFormat(locale).formatToParts(12345.6);
  const decimal = sample.find((part) => part.type === "decimal")?.value ?? ".";
  const groups = [...new Set(sample.filter((part) => part.type === "group").map((part) => part.value))];
  let normalized = raw.trim().replace(/[\s\u00a0\u202f]/g, "");
  for (const group of groups) normalized = normalized.split(group).join("");
  if (decimal !== ".") normalized = normalized.replace(decimal, ".");
  if (!/^(?:\d+|\d*\.\d+)$/.test(normalized)) return 0;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : 0;
}

export function formatDateLocale(
  date: Date | string,
  timezone: string,
  locale = "pt-BR",
  options: Intl.DateTimeFormatOptions = { dateStyle: "short" },
) {
  return new Intl.DateTimeFormat(locale, { timeZone: timezone, ...options }).format(
    typeof date === "string" ? new Date(date) : date,
  );
}

export function displayCell(
  row: Row,
  field: Field,
  related: Partial<Record<Resource, Row[]>>,
  timezone: string,
  currency = "BRL",
  locale = "pt-BR",
) {
  const value = row[field.key];
  if (value == null || value === "") return "—";
  if (field.relation) return lookupLabel(related[field.relation], value);
  if (field.options) return field.options[String(value)] ?? String(value);
  if (field.type === "datetime-local") return formatDateLocale(String(value), timezone, locale, { dateStyle: "short", timeStyle: "short" });
  if (field.type === "money") return formatMoney(Number(value), currency, locale);
  if (field.key === "durationMinutes") return `${value} min`;
  return String(value);
}
