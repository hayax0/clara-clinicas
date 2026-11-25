import { dateParts } from './chat-date.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database } from '../database.js';
import { lockChatAccess } from './assistant-actions.js';

const setupKindSchema = z.enum(['service', 'professional', 'unit']);
type SetupKind = z.infer<typeof setupKindSchema>;

const setupState = z.object({
  kind: setupKindSchema,
  stage: z.enum(['collect', 'confirm']),
  name: z.string().optional(),
  durationMinutes: z.number().int().min(5).max(1440).optional(),
  priceCents: z.number().int().min(0).max(100_000_000).optional(),
  specialty: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
});

const state = z.object({
  reminderPhone: z.string().optional(),
  day: z.string().optional(), time: z.string().optional(), patient: z.string().optional(),
  professional: z.string().optional(), unit: z.string().optional(), service: z.string().optional(),
  registration: z.enum(['name', 'confirm']).optional(), candidate: z.string().optional(),
  setup: setupState.optional(),
  standalone: z.boolean().optional(), waitingPatient: z.boolean().optional(),
  ready: z.boolean().optional(),
});

const fields = ['patient', 'service', 'professional', 'unit'] as const;
const clean = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim();

function validName(value: string) {
  return value.length >= 2 && value.length <= 120 && /^[\p{L}][\p{L}\p{M} '’-]*$/u.test(value);
}

function validEntityName(value: string) {
  return value.length >= 2 && value.length <= 120 && /^[\p{L}\d][\p{L}\p{M}\d .,/'’()-]*$/u.test(value);
}

function formatNameCase(value: string) {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed === trimmed.toLocaleLowerCase('pt-BR')) {
    const particles = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);
    return trimmed.split(' ').map((word, idx) =>
      idx > 0 && particles.has(word) ? word : word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1),
    ).join(' ');
  }
  return trimmed;
}

function stripGreeting(text: string) {
  return clean(text).replace(/^(?:(?:ola|oi|e ai|bom dia|boa tarde|boa noite|clara|agenda|tudo bem|por favor|hola|buenos dias|buenas tardes|buenas noches|hello|hi|good morning|good afternoon|good evening|please)[,!. ]+)+/, '').trim();
}

export function bookingRequest(text: string) {
  const normalized = stripGreeting(text);
  if (!normalized || /\b(?:tarefa|task)\b/.test(normalized)) return false;
  if (/^(?:como|onde|quant[oa]s?|quais|quem|ver|mostr[ae]|list[ae]|tem algum|how|where|what|who|show|list|donde|cuantos?|cuales|quien|mostrar|listar|hay algun[oa])\b/.test(normalized)) return false;
  if (/^(?:(?:pode|quero|preciso|vamos|gostaria de|queria|voce pode|quero que voce|pode me ajudar a|preciso que voce) )?(?:agend[eaar]+|mar(?:que|car|ca)|encaix(?:e|ar|a))\b/.test(normalized)) {
    return true;
  }
  if (/^(?:(?:please|can you|could you|i want to|i need to|let'?s) )?(?:schedule|book)\b/.test(normalized)) {
    return true;
  }
  if (/^(?:(?:por favor|puedes|podrias|quiero|necesito|vamos a|me gustaria) )?(?:agendar|reservar|programar|concertar)\b/.test(normalized)) return true;
  if (/\b(?:fazer|criar|abrir|registrar|incluir)\s+(?:um\s+)?(?:novo\s+)?(?:agendamento|horario|consulta)\b/.test(normalized)) {
    return true;
  }
  if (/\b(?:quero|preciso|pode|vamos|gostaria de|queria)\s+(?:agendar|marcar|encaixar)\b/.test(normalized)) {
    return true;
  }
  return false;
}

const nonPatientWords = new Set([
  'um', 'uma', 'o', 'a', 'os', 'as', 'paciente', 'pacientes', 'consulta', 'consultas',
  'agendamento', 'agendamentos', 'horario', 'horarios', 'atendimento', 'atendimentos',
  'hoje', 'amanha', 'depois', 'agora', 'aqui', 'agenda', 'clinica', 'novo', 'nova',
  'ele', 'ela', 'eles', 'elas', 'esse', 'essa', 'este', 'esta', 'retorno',
  'em', 'no', 'na', 'de', 'da', 'do', 'para', 'pra', 'dia', 'hora', 'horas', 'com', 'por', 'favor',
  'an', 'the', 'patient', 'appointment', 'today', 'tomorrow', 'for', 'at', 'with', 'please',
  'paciente', 'cita', 'citas', 'reservar', 'agendar', 'hoy', 'manana', 'para', 'por', 'favor',
]);

function extractPatientCandidate(text: string): string | undefined {
  const patterns = [
    /\b(?:paciente|patient)\s+([\p{L}][\p{L}\p{M} '’-]{1,80})/iu,
    /\b(?:para|pra|for)\s+(?:(?:o|a|the)\s+)?(?:(?:paciente|patient)\s+)?([\p{L}][\p{L}\p{M} '’-]{1,80})/iu,
    /\b(?:agend[eaar]+|mar(?:que|car|ca)|encaix(?:e|ar|a)|schedule|book)\s+(?!um\b|uma\b|an?\b|consulta\b|agendamento\b|appointment\b|hor[aá]rio\b|atendimento\b)(?:(?:a|o|the)\s+)?(?:(?:paciente|patient)\s+)?([\p{L}][\p{L}\p{M} '’-]{1,80})/iu,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match?.[1]) continue;
    const raw = match[1]
      .replace(/\b(?:hoje|amanh[aã]|today|tomorrow|hoy|ma[nñ]ana|pasado ma[nñ]ana|depois de amanh[aã]|day after tomorrow|dia\b|nesta|nesse|no dia|na agenda|em\s+\d|[aà]s\s+\d|a las\s+\d|at\s+\d|on\s+\d|para\s+(?:hoje|amanh[aã]|hoy|ma[nñ]ana|o dia|dia|\d)|pra\s+(?:hoje|amanh[aã]|o dia|dia|\d)|com\s+(?:dr|dra|o|a)\b|with\s+(?:dr|the)\b|por favor|please)\b.*$/iu, '')
      .replace(/(?:\s+(?:em|no|na|para|pra|[aà]s|at|on|for|dia|de|da|do))+$/iu, '')
      .replace(/[,.:;!?]+$/g, '')
      .trim();
    if (!raw || !validName(raw)) continue;
    const tokens = clean(raw).split(' ').filter(Boolean);
    if (!tokens.length || tokens.every((token) => nonPatientWords.has(token))) continue;
    if (tokens.some((token) => ['consulta', 'consultas', 'agendamento', 'agendamentos', 'horario', 'horarios', 'atendimento'].includes(token))) {
      continue;
    }
    return formatNameCase(raw);
  }
  return undefined;
}

function isRegistrationConfirm(msg: string) {
  return /^(?:sim|s|ok|okay|claro|pode|pode sim|beleza|isso|perfeito|confirmo|confirmar|confirme|confirma|pode cadastrar|yes|y|sure|absolutely|confirm|confirm it|si|vale|de acuerdo|claro que si|adelante|registrelo|registralo)(?: o cadastro| sim| por favor| the registration| it| please| el registro| por favor)?$/.test(msg);
}

function isBookingConfirm(msg: string) {
  return /^(?:sim|s|yes|y|ok|okay|sure|claro|pode|pode sim|beleza|isso|exato|perfeito|confirmo|confirmar|confirme|confirma|confirm|confirm it|pode agendar|pode marcar|si|vale|de acuerdo|adelante|confirmar cita|reserva)(?: o agendamento| a consulta| the appointment| la cita| la reserva| sim| yes| por favor| please)?$/.test(msg);
}

function isJustConsentToStart(msg: string) {
  return /^(?:sim|s|ok|okay|claro|pode|pode sim|pode cadastrar|quero|quero sim|vamos|beleza|bora|por favor|cadastra ai|cadastre|cadastrar|yes|y|sure|go ahead|please|si|vale|adelante|por favor|hazlo|hagalo|registra|registrar)(?:[,! ]+(?:por favor|aqui|mesmo|please|here|ahora|aqui))?$/.test(msg);
}

function detectStandaloneSetup(text: string): { kind: SetupKind; rest: string } | undefined {
  const match = /^(?:(?:ol[aá]|oi|bom dia|boa tarde|boa noite|clara|por favor|hola|buenos dias|buenas tardes|buenas noches|hello|hi|please)[,!. ]+)*(?:(?:pode|quero|preciso|queria|vamos|puedes|quiero|necesito|can you|please|add|create|register) )?(?:cadastre|cadastra|cadastrar|crie|cria|criar|registre|registra|registrar|adicione|adiciona|adicionar|agrega|agregar|crea|crear|add|create|register)\s+(?:(?:um|uma|o|a|novo|nova|un|una|el|la|new|a|the)\s+)*(servi[cç]o|servicio|service|profissional|profesional|provider|m[eé]dic[oa]|doctor|dentista|dentist|unidade|sede|location|sala|room)\b[\s:,-]*(.*)$/iu.exec(text.trim());
  if (!match) return undefined;
  const rawKind = clean(match[1]);
  const kind: SetupKind = rawKind.startsWith('servic')
    ? 'service'
    : (['unidade', 'sala', 'sede', 'location', 'room'].includes(rawKind))
      ? 'unit'
      : 'professional';
  return { kind, rest: match[2]?.trim() ?? '' };
}

function parseLocaleAmount(raw: string, locale: string) {
  let value = raw.replace(/\s/g, '');
  const lastDot = value.lastIndexOf('.');
  const lastComma = value.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? '.' : ',';
    const grouping = decimal === '.' ? /,/g : /\./g;
    value = value.replace(grouping, '').replace(decimal, '.');
  } else if (lastDot >= 0 || lastComma >= 0) {
    const separator = lastDot >= 0 ? '.' : ',';
    const index = lastDot >= 0 ? lastDot : lastComma;
    const fractionDigits = value.length - index - 1;
    const localeUsesComma = locale === 'pt-BR' || locale === 'pt-PT' || locale === 'es-ES';
    const likelyGrouping = fractionDigits === 3 && (separator === (localeUsesComma ? '.' : ','));
    if (likelyGrouping) value = value.replace(separator === '.' ? /\./g : /,/g, '');
    else value = value.replace(separator, '.');
  }
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}

function parseServiceDetails(raw: string, locale = 'pt-BR'): { name: string; durationMinutes: number; priceCents: number } | undefined {
  let working = raw.trim().replace(/[.!?]+$/, '');
  if (!working) return undefined;

  let durationMinutes = 30;
  const hourMinMatch = /\b(\d{1,2})\s*(?:h|hora|horas)\s*(?:e\s*)?(\d{1,2})?\s*(?:min|minutos?)?\b/i.exec(working);
  const minMatch = /\b(\d{1,3})\s*(?:min|mins|minuto|minutos)\b/i.exec(working);
  if (minMatch) {
    durationMinutes = Math.min(1440, Math.max(5, Number(minMatch[1])));
    working = working.replace(minMatch[0], ' ');
  } else if (hourMinMatch) {
    const mins = Number(hourMinMatch[1]) * 60 + (hourMinMatch[2] ? Number(hourMinMatch[2]) : 0);
    durationMinutes = Math.min(1440, Math.max(5, mins));
    working = working.replace(hourMinMatch[0], ' ');
  }

  let priceCents = 0;
  const moneyMatch = /(?:(?:r\$|us\$|c\$|€|£|\$|brl|usd|eur|gbp)\s*([\d.,]+)|([\d.,]+)\s*(?:brl|usd|eur|gbp|reais?|euros?|d[oó]lares?|dollars?|libras?|pounds?|€|£|\$))/i.exec(working);
  if (moneyMatch) {
    const parsed = parseLocaleAmount(moneyMatch[1] ?? moneyMatch[2], locale);
    if (parsed !== undefined) priceCents = Math.min(100_000_000, Math.round(parsed * 100));
    working = working.replace(moneyMatch[0], ' ');
  } else {
    // Handle trailing bare price after comma like "Consulta inicial, 30 min, 150"
    const trailingNumber = /(?:,\s*|\s+por\s+|\s+de\s+)(\d+(?:[.,]\d{1,2})?)\s*$/i.exec(working);
    if (trailingNumber) {
      const parsed = parseLocaleAmount(trailingNumber[1], locale);
      if (parsed !== undefined) priceCents = Math.min(100_000_000, Math.round(parsed * 100));
      working = working.slice(0, trailingNumber.index);
    }
  }

  const cleanedName = working
    .replace(/\b(?:de|com|por|valor|pre[cç]o|dura[cç][aã]o|custa|custando)\s*$/iu, '')
    .replace(/^[,:\s-]+|[,:\s-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!validEntityName(cleanedName)) return undefined;
  return { name: formatNameCase(cleanedName), durationMinutes, priceCents };
}

function parseProfessionalDetails(raw: string): { name: string; specialty: string | null } | undefined {
  const cleaned = raw.trim().replace(/[.!?]+$/, '');
  if (!cleaned) return undefined;
  const parts = cleaned.split(/\s*(?:,|—|-|\bespecialidade\s*:?)\s*/i).map((p) => p.trim()).filter(Boolean);
  const candidateName = parts[0] ?? '';
  if (!validEntityName(candidateName)) return undefined;
  const specialty = parts.slice(1).join(', ').trim() || null;
  return { name: formatNameCase(candidateName), specialty };
}

function parseUnitDetails(raw: string): { name: string; address: string | null } | undefined {
  const cleaned = raw.trim().replace(/[.!?]+$/, '');
  if (!cleaned) return undefined;
  const parts = cleaned.split(/\s*(?:,|—|-|\bendere[cç]o\s*:?)\s*/i).map((p) => p.trim()).filter(Boolean);
  const candidateName = parts[0] ?? '';
  if (!validEntityName(candidateName)) return undefined;
  const address = parts.slice(1).join(', ').trim() || null;
  return { name: formatNameCase(candidateName), address };
}

function setupCollectPrompt(kind: SetupKind, prefix = '', locale = 'pt-BR', currency = 'BRL') {
  const isEn = locale === 'en-US';
  const isEs = locale === 'es-ES';
  const isPtPt = locale === 'pt-PT';
  const examplePrice = new Intl.NumberFormat(locale, { style: 'currency', currency }).format(150);
  switch (kind) {
    case 'service':
      return `${prefix}${isEn ? `What is the service name, duration in minutes, and price? (e.g. Initial consultation, 30 min, ${examplePrice})` : isEs ? `¿Cuál es el nombre del servicio, la duración en minutos y el precio? (Ej.: Consulta inicial, 30 min, ${examplePrice})` : isPtPt ? `Qual é o nome do serviço, a duração em minutos e o preço? (Ex.: Consulta inicial, 30 min, ${examplePrice})` : `Qual é o nome do serviço, a duração em minutos e o valor? (Ex.: Consulta inicial, 30 min, ${examplePrice})`}`;
    case 'professional':
      return `${prefix}${isEn ? 'What is the provider’s name and, optionally, specialty? (e.g. Dr. Alex, dermatologist)' : isEs ? '¿Cuál es el nombre del profesional y, si quieres, su especialidad? (Ej.: Dra. Paula, dermatóloga)' : isPtPt ? 'Qual é o nome do profissional e, se quiser, a especialidade? (Ex.: Dra. Paula, dermatologista)' : 'Qual é o nome do profissional (e a especialidade, se quiser)? (Ex.: Dra. Paula, dermatologista)'}`;
    case 'unit':
      return `${prefix}${isEn ? 'What is the name of the clinic location or room? (e.g. Downtown)' : isEs ? '¿Cuál es el nombre de la sede o sala de la clínica? (Ej.: Centro)' : isPtPt ? 'Qual é o nome da unidade ou sala da clínica? (Ex.: Unidade Centro)' : 'Qual é o nome da unidade ou sala da clínica? (Ex.: Unidade Centro)'}`;
  }
}

function setupConfirmPrompt(item: z.infer<typeof setupState>, continuingBooking: boolean, locale = 'pt-BR', currency = 'BRL') {
  const isEn = locale === 'en-US';
  const isEs = locale === 'es-ES';
  const isPtPt = locale === 'pt-PT';
  const tail = isEn
    ? (continuingBooking ? ' and continue the booking?' : ' in this clinic?')
    : isEs
      ? (continuingBooking ? ' y continuar con la cita?' : ' en esta clínica?')
      : (continuingBooking ? ' e continuar o agendamento?' : ' nesta clínica?');
  if (item.kind === 'service') {
    const mins = item.durationMinutes ?? 30;
    const price = new Intl.NumberFormat(locale, { style: 'currency', currency }).format((item.priceCents ?? 0) / 100);
    if (isEn) return `Can I add the service ${item.name} (${mins} min · ${price})${tail}`;
    if (isEs) return `¿Puedo registrar el servicio ${item.name} (${mins} min · ${price})${tail}`;
    if (isPtPt) return `Posso registar o serviço ${item.name} (${mins} min · ${price})${tail}`;
    return `Posso cadastrar o serviço ${item.name} (${mins} min · ${price})${tail}`;
  }
  if (item.kind === 'professional') {
    const specialty = item.specialty ? ` (${item.specialty})` : '';
    if (isEn) return `Can I add the provider ${item.name}${specialty}${tail}`;
    if (isEs) return `¿Puedo registrar al profesional ${item.name}${specialty}${tail}`;
    if (isPtPt) return `Posso registar o profissional ${item.name}${specialty}${tail}`;
    return `Posso cadastrar o profissional ${item.name}${specialty}${tail}`;
  }
  const address = item.address ? ` (${item.address})` : '';
  if (isEn) return `Can I add the clinic location ${item.name}${address}${tail}`;
  if (isEs) return `¿Puedo registrar la sede ${item.name}${address}${tail}`;
  if (isPtPt) return `Posso registar a unidade ${item.name}${address}${tail}`;
  return `Posso cadastrar a unidade ${item.name}${address}${tail}`;
}

function bookingText(locale: string, key: string, values: Record<string, string | number> = {}) {
  const messages: Record<string, Record<string, string>> = {
    'pt-BR': {
      cancelled: 'Tudo bem, cancelei o pedido.', invalidSetupService: 'Não consegui identificar o nome do serviço. ', invalidSetupProfessional: 'Não consegui identificar o nome do profissional. ', invalidSetupUnit: 'Não consegui identificar o nome da unidade. ',
      confirmSetup: 'Para salvar {name}, confirme (pode responder “sim”) ou diga “cancelar”.', registeredService: 'Cadastrei o serviço {name}. ', registeredProfessional: 'Cadastrei o profissional {name}. ', registeredUnit: 'Cadastrei a unidade {name}. ',
      askPatientName: 'Qual é o nome completo do paciente?', confirmPatient: 'Posso cadastrar {name} em Pacientes desta clínica?', registeredPatient: 'Cadastrei {name}. ', confirmPatientSave: 'Para salvar {name}, confirme o cadastro (pode responder “sim”) ou diga “cancelar”.', duplicatePatient: 'Já existe cadastro com esse nome. Confira a identidade em Pacientes antes de continuar.',
      askReminderPhone: 'Informe “lembrete autorizado” e o número com DDI e DDD.', invalidDate: 'Essa data não existe no calendário. Qual dia você prefere?', newPatient: 'Sem problema! Posso fazer o cadastro aqui. Qual é o nome do paciente?',
      multiplePatients: 'Encontrei mais de um paciente com esse nome: {names}. Qual deles você quer agendar?', notFoundPatient: 'Não encontrei {name} em Pacientes. Posso cadastrar {name} como paciente e continuar o agendamento?',
      registerAndContinue: 'Posso cadastrar {name} como paciente e continuar a marcação?', askPatient: 'Qual é o nome do paciente? Se for novo, posso cadastrá-lo aqui.',
      missingService: 'Ainda não há nenhum serviço cadastrado na clínica. Posso cadastrar por aqui mesmo! ', missingProfessional: 'Ainda não há nenhum profissional cadastrado na clínica. Posso cadastrar por aqui mesmo! ', missingUnit: 'Ainda não há nenhuma unidade cadastrada na clínica. Posso cadastrar por aqui mesmo! ',
      askField: 'Qual {field} devo usar? {choices}.', askDayAndTime: '{prefix}Certo, vamos agendar para {patient}. Para qual dia e horário você quer marcar? (Ex.: amanhã às 14h ou 28/11 às 10h)', askDay: '{prefix}Para qual dia devo marcar {patient} às {time}?', askTime: '{prefix}Para que horas você quer marcar {patient} em {day}?',
      passed: '{prefix}O horário de {when} já passou. Quer manter {time} em qual dia?', occupied: '{prefix}Esse horário já está ocupado. Que outro horário funciona?', proposal: '{prefix}{summary}. Posso confirmar o agendamento? ', reminderInfo: 'Se o paciente autorizou WhatsApp, informe “lembrete autorizado” e o número com DDI antes de confirmar.',
      booked: 'Agendado! {summary}.', serviceField: 'serviço', professionalField: 'profissional', unitField: 'unidade',
    },
    'pt-PT': {
      cancelled: 'Está bem, cancelei o pedido.', invalidSetupService: 'Não consegui identificar o nome do serviço. ', invalidSetupProfessional: 'Não consegui identificar o nome do profissional. ', invalidSetupUnit: 'Não consegui identificar o nome da unidade. ',
      confirmSetup: 'Para guardar {name}, confirme (pode responder «sim») ou diga «cancelar».', registeredService: 'Registei o serviço {name}. ', registeredProfessional: 'Registei o profissional {name}. ', registeredUnit: 'Registei a unidade {name}. ',
      askPatientName: 'Qual é o nome completo do paciente?', confirmPatient: 'Posso registar {name} em Pacientes desta clínica?', registeredPatient: 'Registei {name}. ', confirmPatientSave: 'Para guardar {name}, confirme o registo (pode responder «sim») ou diga «cancelar».', duplicatePatient: 'Já existe um registo com este nome. Confirme a identidade em Pacientes antes de continuar.',
      askReminderPhone: 'Indique «lembrete autorizado» e o número com indicativo do país e da região.', invalidDate: 'Esta data não existe no calendário. Que dia prefere?', newPatient: 'Sem problema. Posso fazer o registo aqui. Qual é o nome do paciente?',
      multiplePatients: 'Encontrei mais do que um paciente com este nome: {names}. Qual pretende marcar?', notFoundPatient: 'Não encontrei {name} em Pacientes. Posso registar {name} como paciente e continuar a marcação?',
      registerAndContinue: 'Posso registar {name} como paciente e continuar a marcação?', askPatient: 'Qual é o nome do paciente? Se for novo, posso registá-lo aqui.',
      missingService: 'Ainda não há serviços registados na clínica. Posso registar um por aqui! ', missingProfessional: 'Ainda não há profissionais registados na clínica. Posso registar um por aqui! ', missingUnit: 'Ainda não há unidades registadas na clínica. Posso registar uma por aqui! ',
      askField: 'Que {field} devo utilizar? {choices}.', askDayAndTime: '{prefix}Certo, vamos marcar para {patient}. Para que dia e hora pretende a marcação? (Ex.: amanhã às 14:00 ou 28/11 às 10:00)', askDay: '{prefix}Em que dia devo marcar {patient} às {time}?', askTime: '{prefix}A que horas pretende marcar {patient} no dia {day}?',
      passed: '{prefix}A hora de {when} já passou. Em que dia quer manter as {time}?', occupied: '{prefix}Esta hora já está ocupada. Que outra hora lhe dá jeito?', proposal: '{prefix}{summary}. Posso confirmar a marcação? ', reminderInfo: 'Se o paciente autorizou WhatsApp, indique «lembrete autorizado» e o número com os indicativos antes de confirmar.',
      booked: 'Marcação confirmada! {summary}.', serviceField: 'serviço', professionalField: 'profissional', unitField: 'unidade',
    },
    'es-ES': {
      cancelled: 'De acuerdo, he cancelado la solicitud.', invalidSetupService: 'No he podido identificar el nombre del servicio. ', invalidSetupProfessional: 'No he podido identificar el nombre del profesional. ', invalidSetupUnit: 'No he podido identificar el nombre de la sede. ',
      confirmSetup: 'Para guardar {name}, confirma (puedes responder «sí») o di «cancelar».', registeredService: 'He registrado el servicio {name}. ', registeredProfessional: 'He registrado al profesional {name}. ', registeredUnit: 'He registrado la sede {name}. ',
      askPatientName: '¿Cuál es el nombre completo del paciente?', confirmPatient: '¿Puedo registrar a {name} en Pacientes de esta clínica?', registeredPatient: 'He registrado a {name}. ', confirmPatientSave: 'Para guardar a {name}, confirma el registro (puedes responder «sí») o di «cancelar».', duplicatePatient: 'Ya existe un registro con ese nombre. Comprueba su identidad en Pacientes antes de continuar.',
      askReminderPhone: 'Indica «recordatorio autorizado» y el número con prefijo del país y de la zona.', invalidDate: 'Esa fecha no existe en el calendario. ¿Qué día prefieres?', newPatient: 'No pasa nada. Puedo registrarlo aquí. ¿Cuál es el nombre del paciente?',
      multiplePatients: 'He encontrado varios pacientes con ese nombre: {names}. ¿A cuál quieres citar?', notFoundPatient: 'No he encontrado a {name} en Pacientes. ¿Puedo registrarlo como paciente y continuar con la cita?',
      registerAndContinue: '¿Puedo registrar a {name} como paciente y continuar con la cita?', askPatient: '¿Cuál es el nombre del paciente? Si es nuevo, puedo registrarlo aquí.',
      missingService: 'La clínica aún no tiene servicios registrados. ¡Puedo registrar uno aquí! ', missingProfessional: 'La clínica aún no tiene profesionales registrados. ¡Puedo registrar uno aquí! ', missingUnit: 'La clínica aún no tiene sedes registradas. ¡Puedo registrar una aquí! ',
      askField: '¿Qué {field} debo usar? {choices}.', askDayAndTime: '{prefix}De acuerdo, vamos a reservar para {patient}. ¿Para qué día y hora quieres la cita? (Ej.: mañana a las 14:00 o 28/11 a las 10:00)', askDay: '{prefix}¿Qué día reservo para {patient} a las {time}?', askTime: '{prefix}¿A qué hora quieres reservar para {patient} el {day}?',
      passed: '{prefix}La hora del {when} ya ha pasado. ¿Qué día quieres mantener las {time}?', occupied: '{prefix}Esa hora ya está ocupada. ¿Qué otro horario te viene bien?', proposal: '{prefix}{summary}. ¿Confirmo la cita? ', reminderInfo: 'Si el paciente autorizó WhatsApp, indica «recordatorio autorizado» y el número con prefijo internacional antes de confirmar.',
      booked: '¡Cita reservada! {summary}.', serviceField: 'servicio', professionalField: 'profesional', unitField: 'sede',
    },
    'en-US': {
      cancelled: 'All right, I canceled that request.', invalidSetupService: 'I couldn’t identify the service name. ', invalidSetupProfessional: 'I couldn’t identify the provider’s name. ', invalidSetupUnit: 'I couldn’t identify the clinic location name. ',
      confirmSetup: 'To save {name}, confirm (you can reply “yes”) or say “cancel”.', registeredService: 'I added the service {name}. ', registeredProfessional: 'I added the provider {name}. ', registeredUnit: 'I added the clinic location {name}. ',
      askPatientName: 'What is the patient’s full name?', confirmPatient: 'Can I add {name} to this clinic’s Patients?', registeredPatient: 'I added {name}. ', confirmPatientSave: 'To save {name}, confirm the registration (you can reply “yes”) or say “cancel”.', duplicatePatient: 'A record with that name already exists. Check the identity in Patients before continuing.',
      askReminderPhone: 'Enter “reminder authorized” and the number with country and area codes.', invalidDate: 'That date does not exist on the calendar. Which day works for you?', newPatient: 'No problem. I can add the patient here. What is their name?',
      multiplePatients: 'I found more than one patient with that name: {names}. Which one should I schedule?', notFoundPatient: 'I couldn’t find {name} in Patients. Can I add them as a patient and continue scheduling?',
      registerAndContinue: 'Can I add {name} as a patient and continue scheduling?', askPatient: 'What is the patient’s name? If they’re new, I can add them here.',
      missingService: 'The clinic has no services set up yet. I can add one here! ', missingProfessional: 'The clinic has no providers set up yet. I can add one here! ', missingUnit: 'The clinic has no locations set up yet. I can add one here! ',
      askField: 'Which {field} should I use? {choices}.', askDayAndTime: '{prefix}Okay, let’s schedule {patient}. What day and time work for you? (e.g. tomorrow at 2:00 PM or 11/28 at 10:00 AM)', askDay: '{prefix}What day should I schedule {patient} at {time}?', askTime: '{prefix}What time should I schedule {patient} on {day}?',
      passed: '{prefix}The time on {when} has already passed. What day should I keep {time} for?', occupied: '{prefix}That time is already booked. What other time works?', proposal: '{prefix}{summary}. Can I confirm the appointment? ', reminderInfo: 'If the patient authorized WhatsApp, enter “reminder authorized” and the number with country and area codes before confirming.',
      booked: 'Scheduled! {summary}.', serviceField: 'service', professionalField: 'provider', unitField: 'location',
    },
  };
  const template = (messages[locale] ?? messages['pt-BR'])[key] ?? messages['pt-BR'][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name] ?? ''));
}

function formatClinicDate(day: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${day}T12:00:00Z`));
}

function formatClinicTime(time: string, locale: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC', hour: 'numeric', minute: '2-digit', ...(locale === 'en-US' ? { hourCycle: 'h12' as const } : { hourCycle: 'h23' as const }),
  }).format(new Date(Date.UTC(2020, 0, 1, hours, minutes)));
}

type Scope = { organizationId: string; actorId: string; agentId: string };

export type BookingHints = {
  forceBooking?: boolean;
  forceRegister?: boolean;
  setupKind?: SetupKind;
  setupName?: string;
  durationMinutes?: number;
  priceCents?: number;
  specialty?: string;
  address?: string;
  patientName?: string;
  dateText?: string;
  timeText?: string;
};

export async function handleBooking(
  db: Database,
  scope: Scope,
  id: string,
  text: string,
  timezone: string,
  hints?: BookingHints,
) {
  const register = /^(?:(?:ol[aá]|oi|bom dia|boa tarde|boa noite|clara|por favor|hola|buenos dias|buenas tardes|hello|hi|please)[,!. ]+)*(?:(?:pode|quero|preciso|queria|vamos|puedes|quiero|necesito|can you|please|add|create|register) )?(?:cadastre|cadastra|cadastrar|registre|registra|registrar|adicione|adiciona|adicionar|registra|registrar|agrega|agregar|add|create|register)\s+(?:(?:um|uma|o|a|novo|nova|un|una|el|la|new|a|the)\s+)*paciente\b[\s:,-]*(.*)$/iu.exec(text.trim());
  const standaloneSetup = ['main', 'agenda', 'operations'].includes(scope.agentId) ? detectStandaloneSetup(text) : undefined;
  const startsRegister = Boolean(register || hints?.forceRegister);
  const startsSetup = Boolean(standaloneSetup || (hints?.setupKind && ['main', 'agenda', 'operations'].includes(scope.agentId)));
  const starts = startsRegister || startsSetup || (['main', 'agenda'].includes(scope.agentId) && (Boolean(hints?.forceBooking) || bookingRequest(text)));
  const where = {
    ...scope,
    tool: { in: ['booking_draft', 'booking_proposal', 'patient_proposal', 'setup_draft', 'setup_proposal'] },
    proposalExpiresAt: { gt: new Date() },
  };
  if (!starts && !await db.assistantTurn.findFirst({ where, select: { id: true } })) return;

  return db.$transaction(async (tx) => {
    await lockChatAccess(tx, scope);
    const prev = await tx.assistantTurn.findFirst({ where, orderBy: { createdAt: 'desc' } });
    if (!prev && !starts) return;
    const draft = state.parse(prev?.actionDraft ?? {});
    if (prev) await tx.assistantTurn.update({ where: { id: prev.id }, data: { proposalExpiresAt: null } });

    const reply = (answer: string, pending = true) => {
      let tool: string;
      if (draft.setup) {
        tool = pending ? (draft.setup.stage === 'confirm' ? 'setup_proposal' : 'setup_draft') : 'setup_finished';
      } else {
        tool = pending
          ? (draft.registration === 'confirm' ? 'patient_proposal' : draft.ready ? 'booking_proposal' : 'booking_draft')
          : draft.standalone
            ? 'patient_finished'
            : 'booking_finished';
      }
      const responderId = draft.standalone
        ? (draft.setup && scope.agentId === 'main' ? 'operations' : scope.agentId)
        : 'agenda';
      return tx.assistantTurn.update({
        where: { id },
        data: {
          answer,
          responderId,
          tool,
          metrics: [],
          ...(pending && { actionDraft: draft, proposalExpiresAt: new Date(Date.now() + 900000) }),
        },
        select: { id: true, userText: true, answer: true, responderId: true, metrics: true, createdAt: true, tool: true, proposalExpiresAt: true },
      });
    };

    const msg = clean(text).replace(/[.!?]+$/, '');
    const { organizationId, actorId } = scope;
    const market = await tx.organization.findUnique({ where: { id: organizationId }, select: { locale: true, currency: true } });
    const clinicLocale = market?.locale ?? 'pt-BR';
    const clinicCurrency = market?.currency ?? 'BRL';
    if (/^(?:cancelar|cancele|cancela|nao|deixa pra la|esquece|cancel|cancel it|cancel appointment|cancel registration|never mind|leave it|no|olvidalo|dejalo|cancelar cita|cancelar la cita|cancela la cita)(?: o (?:agendamento|cadastro)| the (?:appointment|registration))?$/.test(msg)) {
      return reply(bookingText(clinicLocale, 'cancelled'), false);
    }

    const confirm = isBookingConfirm(msg);
    let registered = '';

    // 1. Handle clinic setup (service / professional / unit) either standalone or inside a booking flow
    if (startsSetup || draft.setup) {
      if (startsSetup && !draft.setup) {
        draft.standalone = draft.standalone ?? !prev;
        const kind = hints?.setupKind ?? standaloneSetup!.kind;
        draft.setup = { kind, stage: 'collect' };
        if (hints?.setupName && validEntityName(hints.setupName)) {
          draft.setup.name = formatNameCase(hints.setupName);
          if (kind === 'service') {
            draft.setup.durationMinutes = hints.durationMinutes ?? 30;
            draft.setup.priceCents = hints.priceCents ?? 0;
          } else if (kind === 'professional') {
            draft.setup.specialty = hints.specialty ?? null;
          } else if (kind === 'unit') {
            draft.setup.address = hints.address ?? null;
          }
          draft.setup.stage = 'confirm';
          return reply(setupConfirmPrompt(draft.setup, !draft.standalone, clinicLocale, clinicCurrency));
        }
      }

      const setup = draft.setup!;
      if (setup.stage === 'collect') {
        const rawSource = standaloneSetup ? standaloneSetup.rest : text;
        if (!rawSource || isJustConsentToStart(msg)) {
          return reply(setupCollectPrompt(setup.kind, '', clinicLocale, clinicCurrency));
        }
        if (setup.kind === 'service') {
          const parsed = parseServiceDetails(rawSource, clinicLocale);
          if (!parsed) return reply(setupCollectPrompt('service', bookingText(clinicLocale, 'invalidSetupService'), clinicLocale, clinicCurrency));
          setup.name = parsed.name;
          setup.durationMinutes = parsed.durationMinutes;
          setup.priceCents = parsed.priceCents;
        } else if (setup.kind === 'professional') {
          const parsed = parseProfessionalDetails(rawSource);
          if (!parsed) return reply(setupCollectPrompt('professional', bookingText(clinicLocale, 'invalidSetupProfessional'), clinicLocale, clinicCurrency));
          setup.name = parsed.name;
          setup.specialty = parsed.specialty;
        } else {
          const parsed = parseUnitDetails(rawSource);
          if (!parsed) return reply(setupCollectPrompt('unit', bookingText(clinicLocale, 'invalidSetupUnit'), clinicLocale, clinicCurrency));
          setup.name = parsed.name;
          setup.address = parsed.address;
        }
        setup.stage = 'confirm';
        return reply(setupConfirmPrompt(setup, !draft.standalone, clinicLocale, clinicCurrency));
      }

      if (!isRegistrationConfirm(msg)) {
        return reply(bookingText(clinicLocale, 'confirmSetup', { name: setup.name ?? '' }));
      }

      if (setup.kind === 'service') {
        const service = await tx.service.create({
          data: {
            id: randomUUID(),
            organizationId,
            name: setup.name!,
            durationMinutes: setup.durationMinutes ?? 30,
            priceCents: setup.priceCents ?? 0,
          },
          select: { id: true, name: true },
        });
        await tx.auditEvent.create({ data: { organizationId, actorId, action: 'assistant.service.created', resourceId: service.id } });
        registered = bookingText(clinicLocale, 'registeredService', { name: service.name });
        draft.service = service.id;
      } else if (setup.kind === 'professional') {
        const professional = await tx.professional.create({
          data: {
            id: randomUUID(),
            organizationId,
            name: setup.name!,
            specialty: setup.specialty ?? null,
          },
          select: { id: true, name: true },
        });
        await tx.auditEvent.create({ data: { organizationId, actorId, action: 'assistant.professional.created', resourceId: professional.id } });
        registered = bookingText(clinicLocale, 'registeredProfessional', { name: professional.name });
        draft.professional = professional.id;
      } else {
        const unit = await tx.unit.create({
          data: {
            id: randomUUID(),
            organizationId,
            name: setup.name!,
            address: setup.address ?? null,
          },
          select: { id: true, name: true },
        });
        await tx.auditEvent.create({ data: { organizationId, actorId, action: 'assistant.unit.created', resourceId: unit.id } });
        registered = bookingText(clinicLocale, 'registeredUnit', { name: unit.name });
        draft.unit = unit.id;
      }

      const finishedStandalone = Boolean(draft.standalone);
      delete draft.setup;
      draft.ready = false;
      if (finishedStandalone) {
        return tx.assistantTurn.update({
          where: { id },
          data: { answer: registered.trim(), responderId: scope.agentId === 'main' ? 'operations' : scope.agentId, tool: 'setup_finished', metrics: [] },
          select: { id: true, userText: true, answer: true, responderId: true, metrics: true, createdAt: true, tool: true, proposalExpiresAt: true },
        });
      }
    }

    // 2. Handle patient registration
    if (startsRegister || draft.registration) {
      if (startsRegister) {
        draft.standalone = draft.standalone ?? !prev;
        draft.registration = 'name';
        delete draft.candidate;
      }
      if (draft.registration === 'name') {
        const rawCandidate = (register ? register[1] : hints?.patientName ?? text).trim().replace(/[.!?]+$/, '');
        if (!validName(rawCandidate)) return reply(bookingText(clinicLocale, 'askPatientName'));
        const candidate = formatNameCase(rawCandidate);
        draft.candidate = candidate;
        draft.registration = 'confirm';
        return reply(bookingText(clinicLocale, 'confirmPatient', { name: candidate }));
      }
      if (!isRegistrationConfirm(msg)) {
        return reply(bookingText(clinicLocale, 'confirmPatientSave', { name: draft.candidate ?? '' }));
      }
      const candidate = draft.candidate!;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId + clean(candidate)}, 0))`;
      const existing = (await tx.patient.findMany({ where: { organizationId }, select: { id: true, name: true } }))
        .filter((p) => clean(p.name) === clean(candidate));
      if (existing.length) {
        return reply(bookingText(clinicLocale, 'duplicatePatient'), false);
      }
      const patient = await tx.patient.create({ data: { organizationId, id: randomUUID(), name: candidate } });
      await tx.auditEvent.create({ data: { organizationId, actorId, action: 'assistant.patient.created', resourceId: patient.id } });
      registered += bookingText(clinicLocale, 'registeredPatient', { name: candidate });
      if (draft.standalone) return reply(registered.trim(), false);
      draft.patient = patient.id;
      draft.ready = false;
      delete draft.registration;
      delete draft.candidate;
    }

    if (draft.ready && /^(?:lembrete autorizado|reminder authorized|recordatorio autorizado)\b/.test(msg)) {
      const phone = /^(?:lembrete autorizado|reminder authorized|recordatorio autorizado)\s*:?\s*\+?([1-9]\d{7,14})$/.exec(msg);
      if (!phone) return reply(bookingText(clinicLocale, 'askReminderPhone'));
      draft.reminderPhone = phone[1];
    }

    const dateSource = [text, hints?.dateText, hints?.timeText].filter(Boolean).join(' ');
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const parts = dateParts(dateSource, today, clinicLocale);
    if (parts.invalidDate) {
      delete draft.day;
      draft.ready = false;
      if (parts.time) draft.time = parts.time;
      return reply(bookingText(clinicLocale, 'invalidDate'));
    }
    if (parts.relative !== undefined) {
      const [row] = await tx.$queryRaw<{ day: string }[]>`SELECT to_char((now() AT TIME ZONE ${timezone})::date + ${parts.relative}::int, 'YYYY-MM-DD') AS day`;
      draft.day = row.day;
    }
    if (parts.day) draft.day = parts.day;
    if (parts.time) draft.time = parts.time;

    const options = { where: { organizationId }, select: { id: true, name: true } };
    const choices = {
      patient: await tx.patient.findMany(options),
      professional: await tx.professional.findMany(options),
      service: await tx.service.findMany({ ...options, select: { ...options.select, durationMinutes: true } }),
      unit: await tx.unit.findMany(options),
    };

    const searchHaystack = ` ${clean([text, hints?.patientName].filter(Boolean).join(' '))} `;
    for (const field of fields) {
      const rows = choices[field];
      const matches = rows.filter((r) => searchHaystack.includes(` ${clean(r.name)} `));
      if (matches.length === 1) draft[field] = matches[0].id;
      else if (rows.length === 1 && field !== 'patient') draft[field] = rows[0].id;
      if (!rows.some((r) => r.id === draft[field])) delete draft[field];
    }

    if (!draft.patient) {
      if (/\b(?:nao (?:esta |foi |e )?(?:cadastrad[oa]|registrad[oa])|nao (?:tem|possui) cadastro|paciente nov[oa]|not registered|new patient|is not in the system|no tiene ficha|no esta registrado|paciente nuevo)\b/.test(msg)) {
        draft.registration = 'name';
        return reply(bookingText(clinicLocale, 'newPatient'));
      }

      const mentioned = hints?.patientName && validName(hints.patientName)
        ? formatNameCase(hints.patientName)
        : extractPatientCandidate(text);
      if (mentioned) {
        const cleanMentioned = clean(mentioned);
        const partialMatches = choices.patient.filter((p) => {
          const cleanName = clean(p.name);
          return cleanName === cleanMentioned || cleanName.startsWith(`${cleanMentioned} `);
        });
        if (partialMatches.length === 1) {
          draft.patient = partialMatches[0].id;
        } else if (partialMatches.length > 1) {
          draft.waitingPatient = true;
          return reply(bookingText(clinicLocale, 'multiplePatients', { names: partialMatches.slice(0, 5).map((p) => p.name).join(', ') }));
        } else {
          draft.registration = 'confirm';
          draft.candidate = mentioned;
          return reply(bookingText(clinicLocale, 'notFoundPatient', { name: mentioned }));
        }
      }
    }

    if (!draft.patient) {
      const candidate = text.trim().replace(/[.!?]+$/, '');
      if (draft.waitingPatient && validName(candidate) && !bookingRequest(text) && !confirm && !parts.day && parts.relative === undefined) {
        draft.registration = 'confirm';
        draft.candidate = formatNameCase(candidate);
        return reply(bookingText(clinicLocale, 'registerAndContinue', { name: draft.candidate }));
      }
      draft.waitingPatient = true;
      return reply(bookingText(clinicLocale, 'askPatient'));
    }

    const setupMissingLead: Record<SetupKind, string> = {
      service: bookingText(clinicLocale, 'missingService'),
      professional: bookingText(clinicLocale, 'missingProfessional'),
      unit: bookingText(clinicLocale, 'missingUnit'),
    };
    const fieldLabel: Record<SetupKind, string> = {
      service: bookingText(clinicLocale, 'serviceField'),
      professional: bookingText(clinicLocale, 'professionalField'),
      unit: bookingText(clinicLocale, 'unitField'),
    };

    for (const field of ['service', 'professional', 'unit'] as const) {
      if (draft[field]) continue;
      draft.ready = false;
      if (!choices[field].length) {
        draft.setup = { kind: field, stage: 'collect' };
        return reply(setupCollectPrompt(field, `${registered}${setupMissingLead[field]}`, clinicLocale, clinicCurrency));
      }
      return reply(`${registered}${bookingText(clinicLocale, 'askField', { field: fieldLabel[field], choices: choices[field].slice(0, 6).map((r) => r.name).join(', ') })}`);
    }

    const patientName = choices.patient.find((r) => r.id === draft.patient)!.name;
    if (!draft.day || !draft.time) {
      if (!draft.day && !draft.time) {
        return reply(bookingText(clinicLocale, 'askDayAndTime', { prefix: registered, patient: patientName }));
      }
      return reply(
        !draft.day
          ? bookingText(clinicLocale, 'askDay', { prefix: registered, patient: patientName, time: formatClinicTime(draft.time!, clinicLocale) })
          : bookingText(clinicLocale, 'askTime', { prefix: registered, patient: patientName, day: formatClinicDate(draft.day!, clinicLocale) }),
      );
    }

    const [instant] = await tx.$queryRaw<{ epoch: number }[]>`SELECT extract(epoch FROM (${draft.day + ' ' + draft.time}::timestamp AT TIME ZONE ${timezone}))::float8 AS epoch`;
    const startAt = new Date(instant.epoch * 1000);
    const service = choices.service.find((r) => r.id === draft.service)!;
    const endAt = new Date(startAt.getTime() + service.durationMinutes * 60000);
    const occupied = await tx.appointment.count({
      where: {
        organizationId,
        status: { not: 'CANCELLED' },
        OR: [{ patientId: draft.patient }, { professionalId: draft.professional }],
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
    });
    if (startAt.getTime() < Date.now()) {
      const when = `${formatClinicDate(draft.day, clinicLocale)} ${clinicLocale === 'en-US' ? 'at' : clinicLocale === 'es-ES' ? 'a las' : 'às'} ${formatClinicTime(draft.time, clinicLocale)}`;
      delete draft.day;
      draft.ready = false;
      return reply(bookingText(clinicLocale, 'passed', { prefix: registered, when, time: formatClinicTime(draft.time, clinicLocale) }));
    }
    if (occupied) {
      delete draft.time;
      draft.ready = false;
      return reply(bookingText(clinicLocale, 'occupied', { prefix: registered }));
    }

    const details = fields.map((field) => choices[field].find((r) => r.id === draft[field])!.name).join(' · ');
    const dateLabel = formatClinicDate(draft.day, clinicLocale);
    const timeLabel = formatClinicTime(draft.time, clinicLocale);
    const summary = clinicLocale === 'en-US'
      ? `${details} on ${dateLabel} at ${timeLabel}`
      : clinicLocale === 'es-ES'
        ? `${details} el ${dateLabel} a las ${timeLabel}`
        : `${details} em ${dateLabel} às ${timeLabel}`;
    if (!draft.ready || !confirm) {
      draft.ready = true;
      const reminder = draft.reminderPhone
        ? (clinicLocale === 'en-US' ? ` Reminder authorized for +${draft.reminderPhone}.` : clinicLocale === 'es-ES' ? ` Recordatorio autorizado para +${draft.reminderPhone}.` : ` Lembrete autorizado para +${draft.reminderPhone}.`)
        : bookingText(clinicLocale, 'reminderInfo');
      return reply(`${bookingText(clinicLocale, 'proposal', { prefix: registered, summary })}${reminder}`);
    }

    const appointment = await tx.appointment.create({
      data: {
        id: randomUUID(),
        organizationId,
        patientId: draft.patient!,
        professionalId: draft.professional!,
        unitId: draft.unit!,
        reminderPhone: draft.reminderPhone,
        serviceId: service.id,
        startAt,
        endAt,
      },
    });
    await tx.auditEvent.create({ data: { organizationId, actorId, action: 'assistant.appointment.created', resourceId: appointment.id } });
    return reply(bookingText(clinicLocale, 'booked', { summary }), false);
  });
}
