export type ClinicLocale = "pt-BR" | "pt-PT" | "es-ES" | "en-US";
export type UiLocale = "pt-BR" | "en-US";
export type ClinicCurrency = "BRL" | "USD" | "EUR" | "GBP";
export type CountryCode = "BR" | "PT" | "ES" | "US";

export const countryOptions: { value: CountryCode; label: string }[] = [
  { value: "BR", label: "Brasil" },
  { value: "PT", label: "Portugal" },
  { value: "ES", label: "Espanha" },
  { value: "US", label: "Estados Unidos" },
];

export function localizedCountryName(country: CountryCode, locale?: string | null) {
  if (locale !== "en-US") return countryOptions.find((option) => option.value === country)?.label ?? country;
  return ({ BR: "Brazil", PT: "Portugal", ES: "Spain", US: "United States" } satisfies Record<CountryCode, string>)[country];
}

export const countryDefaults: Record<CountryCode, { timezone: string; currency: ClinicCurrency; locale: ClinicLocale }> = {
  BR: { timezone: "America/Sao_Paulo", currency: "BRL", locale: "pt-BR" },
  PT: { timezone: "Europe/Lisbon", currency: "EUR", locale: "pt-PT" },
  ES: { timezone: "Europe/Madrid", currency: "EUR", locale: "es-ES" },
  US: { timezone: "America/New_York", currency: "USD", locale: "en-US" },
};

const dictionaries = {
  "pt-BR": {
    nav_home: "Início",
    nav_agenda: "Agenda",
    nav_patients: "Pacientes",
    nav_inbox: "Atendimento",
    nav_finance: "Financeiro",
    nav_assistant: "Meu Assistente",
    nav_tasks: "Tarefas",
    nav_settings: "Configurações",
    nav_admin: "Administração",
    status_SCHEDULED: "Agendada",
    status_CONFIRMED: "Confirmada",
    status_COMPLETED: "Concluída",
    status_CANCELLED: "Cancelada",
    action_newAppointment: "Novo agendamento",
    action_save: "Salvar",
    action_saving: "Salvando…",
    action_cancel: "Cancelar",
    action_confirm: "Confirmar",
    action_close: "Fechar",
    action_logout: "Sair",
    action_exportCsv: "Exportar CSV",
    settings_currency: "Moeda",
    settings_locale: "Idioma padrão da clínica",
    channel_whatsapp: "Abrir no WhatsApp",
    channel_sms: "Enviar SMS",
    channel_email: "Enviar E-mail",
  },
  "en-US": {
    nav_home: "Home",
    nav_agenda: "Schedule",
    nav_patients: "Patients",
    nav_inbox: "Inbox",
    nav_finance: "Finance",
    nav_assistant: "My Assistant",
    nav_tasks: "Tasks",
    nav_settings: "Settings",
    nav_admin: "Platform Admin",
    status_SCHEDULED: "Scheduled",
    status_CONFIRMED: "Confirmed",
    status_COMPLETED: "Completed",
    status_CANCELLED: "Cancelled",
    action_newAppointment: "New appointment",
    action_save: "Save",
    action_saving: "Saving…",
    action_cancel: "Cancel",
    action_confirm: "Confirm",
    action_close: "Close",
    action_logout: "Sign out",
    action_exportCsv: "Export CSV",
    settings_currency: "Currency",
    settings_locale: "Clinic language",
    channel_whatsapp: "Open in WhatsApp",
    channel_sms: "Send SMS",
    channel_email: "Send Email",
  },
} as const;

export type TranslationKey = keyof (typeof dictionaries)["pt-BR"];

export function normalizeLocale(locale?: string | null): UiLocale {
  return locale === "en-US" ? "en-US" : "pt-BR";
}

export function t(locale: string | null | undefined, key: TranslationKey): string {
  return dictionaries[normalizeLocale(locale)][key];
}

export const currencyOptions: { value: ClinicCurrency; label: string }[] = [
  { value: "BRL", label: "BRL (R$) — Real Brasileiro" },
  { value: "USD", label: "USD ($) — US Dollar" },
  { value: "EUR", label: "EUR (€) — Euro" },
  { value: "GBP", label: "GBP (£) — British Pound" },
];

export function localizedCurrencyName(currency: ClinicCurrency, locale?: string | null) {
  const symbol: Record<ClinicCurrency, string> = { BRL: "R$", USD: "$", EUR: "€", GBP: "£" };
  const names: Record<ClinicCurrency, { pt: string; en: string }> = {
    BRL: { pt: "Real brasileiro", en: "Brazilian real" },
    USD: { pt: "Dólar americano", en: "US dollar" },
    EUR: { pt: "Euro", en: "Euro" },
    GBP: { pt: "Libra esterlina", en: "British pound" },
  };
  const name = names[currency][locale === "en-US" ? "en" : "pt"];
  return `${currency} (${symbol[currency]}) — ${name}`;
}

export const localeOptions: { value: ClinicLocale; label: string }[] = [
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "pt-PT", label: "Português (Portugal)" },
  { value: "es-ES", label: "Español (España)" },
  { value: "en-US", label: "English (international)" },
];

export const uiLocaleOptions: { value: UiLocale; label: string }[] = [
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "en-US", label: "English (international)" },
];

/** The account UI remains available in Brazilian Portuguese and international English. */
export function resolveUiLocale(locale?: string | null): UiLocale {
  return locale === "pt-BR" ? "pt-BR" : "en-US";
}
