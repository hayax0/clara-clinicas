import type { ChatAgentId } from './assistant-routing.js';

export type ConversationAction =
  | { kind: 'answer'; answer: string }
  | { kind: 'remember'; note: string }
  | { kind: 'recall' }
  | { kind: 'propose_task'; title: string }
  | { kind: 'confirm_task' }
  | { kind: 'cancel_task' };

const profileHelp: Record<ChatAgentId, string> = {
  main: 'Posso ver o que pede atenção hoje, orientar você na Clara ou encaminhar a consulta ao ajudante certo.',
  agenda: 'Posso conferir os horários de hoje e mostrar onde agendar ou confirmar um atendimento.',
  crm: 'Posso conferir as oportunidades em aberto e explicar como acompanhar cada contato.',
  operations: 'Posso revisar as pendências e ajudar a registrar uma tarefa para a equipe.',
};

const rememberCommand = /^(?:por favor[,.\s]+)?(?:(?:quero que voc[eê] |me )?lembr[ea](?:-se)? (?:de )?que|(?:anote|guarde|salve) (?:na mem[oó]ria )?que)\s+([\s\S]+)$/iu;
const taskCommand = /^(?:por favor[,.\s]+)?(?:(?:agende|agendar|marque|crie|criar|adicion[ea]r?|regist(?:re|rar)|cadast(?:re|rar)|anot[ea]r?)|(?:pode|preciso|quero)\s+(?:agendar|criar|adicionar|registrar|cadastrar|anotar))\s+(?:(?:uma|nova|uma nova)\s+)?tarefa(?:\s*[:—-]\s*|\s+(?:para|pra|de|chamada|com o t[ií]tulo)\s+|\s+)([\s\S]+)$/iu;

const sensitiveNote = /\b(cpf|cnpj|rg|passaporte|documentos? de identidade|cartao|pix|senha|chave de api|api key|telefone|celular|e-?mail|endereco|cep|nascimento|pacientes?|prontuarios?|diagnosticos?|sintomas?|medicamentos?|receitas?|prescric(?:ao|oes)|exames?|cid|tratamentos?|nome (completo|do paciente|da paciente)|minh[ao] (filh[ao]|marido|esposa))\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\d[ .()-]*){8,}/i;

const faq = [
  {
    id: 'agenda',
    topic: /\b(marcar|agendar|agendamentos?|consultas?|agenda|horarios?|schedule|book|appointments?|calendar|citas?|reservar|horarios?)\b/,
    other: [
      [/\b(cancel\w*|anul\w*)\b/, 'Em Agenda, edite o agendamento e selecione Cancelada no campo Status. Depois salve a alteração.', 'cancel'],
      [/\b(reagend\w*|reschedul\w*|cambi\w* la fecha|cambi\w* la cita)\b/, 'Em Agenda, edite o agendamento e ajuste o início e o fim. O sistema avisa se houver conflito de horário.', 'reschedule'],
      [/\b(confirm\w*|confirma\w*)\b/, 'Em Agenda, edite o agendamento e selecione Confirmada no campo Status. Depois salve a alteração.', 'confirm'],
    ],
    answer: 'Abra Agenda e escolha Novo agendamento. Selecione o paciente, o profissional, o serviço e a unidade, preencha o horário e salve.',
  },
  {
    id: 'tasks',
    topic: /\b(tarefas?|pendencias?|tasks?|to-dos?|tareas?)\b/,
    other: [
      [/\b(conclu\w*|finaliz\w*|complet\w*|mark\w* as done)\b/, 'Em Tarefas, encontre a pendência, clique em Editar e selecione Concluída no campo Status. Depois salve a alteração.', 'complete'],
    ],
    answer: 'Abra Tarefas e clique em Nova tarefa. Preencha o título e, se precisar, defina um prazo. Também posso preparar uma tarefa aqui para você confirmar.',
  },
  {
    id: 'patients',
    topic: /\b(pacientes?|patients?)\b/,
    answer: 'Em Pacientes, clique em Novo paciente para registrar um cadastro. Para consultar ou editar um cadastro, procure o paciente nessa mesma tela.',
  },
  {
    id: 'opportunities',
    topic: /\b(oportunidades?|crm|funil|opportunities|pipeline)\b/,
    answer: 'Abra Atendimento e selecione Oportunidades. Use Nova oportunidade para registrar uma negociação e escolha o contato e a etapa do funil.',
  },
  {
    id: 'contacts',
    topic: /\b(contatos?|leads?|contacts?)\b/,
    answer: 'Abra Atendimento, vá à aba Contatos e clique em Novo contato. Depois você pode vincular esse contato a uma oportunidade.',
  },
  {
    id: 'services',
    topic: /\b(servicos?|catalogo|services?|catalog)\b/,
    answer: 'Abra Configurações, depois Serviços e Novo serviço. Preencha os dados do serviço para poder escolhê-lo num novo agendamento.',
  },
  {
    id: 'access',
    topic: /\b(acessos?|permissoes?|usuarios?|access|permissions?|users?)\b/,
    answer: 'Se você gerencia a clínica, abra Configurações e vá à aba Acessos. A equipe precisa ter uma conta na Clara antes de receber acesso à clínica.',
  },
  {
    id: 'professionals',
    topic: /\b(profissiona(?:l|is)|equipe|providers?|professionals?|team)\b/,
    answer: 'Abra Configurações e vá à aba Profissionais. Use Novo profissional para incluir alguém na agenda. As permissões da conta ficam na aba Acessos.',
  },
  {
    id: 'units',
    topic: /\b(unidades?|locations?|branches?|sedes?)\b/,
    answer: 'Abra Configurações, vá à aba Unidades e clique em Nova unidade. As unidades cadastradas aparecem no formulário de agendamento.',
  },
] as const;

const faqTranslations: Record<string, Record<string, { answer: string; cancel?: string; reschedule?: string; confirm?: string; complete?: string }>> = {
  'pt-PT': {
    agenda: { answer: 'Abra Agenda e escolha Novo agendamento. Selecione o paciente, o profissional, o serviço e a unidade, indique a data e a hora e guarde.', cancel: 'Em Agenda, edite a marcação, escolha Cancelada no campo Estado e guarde.', reschedule: 'Em Agenda, edite a marcação e altere a hora de início e de fim. O sistema avisa se houver conflito.', confirm: 'Em Agenda, edite a marcação, escolha Confirmada no campo Estado e guarde.' },
    tasks: { answer: 'Abra Tarefas e escolha Nova tarefa. Indique o título e, se necessário, defina um prazo. Também posso preparar uma tarefa aqui para confirmar.', complete: 'Em Tarefas, abra a pendência, escolha Editar, altere o Estado para Concluída e guarde.' },
    patients: { answer: 'Em Pacientes, escolha Novo paciente para criar um registo. Para consultar ou editar um registo, procure o paciente nessa página.' },
    opportunities: { answer: 'Abra Atendimento e escolha Oportunidades. Use Nova oportunidade para registar uma negociação e associe o contacto e a etapa do funil.' },
    contacts: { answer: 'Abra Atendimento, aceda ao separador Contactos e escolha Novo contacto. Depois, pode associá-lo a uma oportunidade.' },
    services: { answer: 'Abra Configurações, escolha Serviços e depois Novo serviço. Preencha os dados para o poder selecionar numa marcação.' },
    access: { answer: 'Se gere a clínica, abra Configurações e escolha Acessos. Cada pessoa da equipa precisa de uma conta Clara antes de receber acesso à clínica.' },
    professionals: { answer: 'Abra Configurações e escolha Profissionais. Use Novo profissional para o incluir na agenda. As permissões da conta ficam em Acessos.' },
    units: { answer: 'Abra Configurações, escolha Unidades e depois Nova unidade. As unidades ficam disponíveis ao criar uma marcação.' },
  },
  'es-ES': {
    agenda: { answer: 'Abre Agenda y elige Nueva cita. Selecciona al paciente, al profesional, el servicio y la sede; indica la fecha y la hora y guarda.', cancel: 'En Agenda, edita la cita, selecciona Cancelada en Estado y guarda el cambio.', reschedule: 'En Agenda, edita la cita y cambia la hora de inicio y de fin. El sistema avisa si hay un conflicto.', confirm: 'En Agenda, edita la cita, selecciona Confirmada en Estado y guarda el cambio.' },
    tasks: { answer: 'Abre Tareas y elige Nueva tarea. Escribe el título y, si hace falta, añade una fecha límite. También puedo preparar una tarea aquí para que la confirmes.', complete: 'En Tareas, abre la tarea pendiente, selecciona Editar, cambia el Estado a Completada y guarda.' },
    patients: { answer: 'En Pacientes, elige Nuevo paciente para crear una ficha. Para consultar o editar una ficha, busca al paciente en esa misma página.' },
    opportunities: { answer: 'Abre Atención y selecciona Oportunidades. Usa Nueva oportunidad para registrar una negociación y vincúlala a un contacto y a una fase.' },
    contacts: { answer: 'Abre Atención, ve a la pestaña Contactos y selecciona Nuevo contacto. Después puedes vincularlo a una oportunidad.' },
    services: { answer: 'Abre Configuración, elige Servicios y después Nuevo servicio. Completa los datos para poder seleccionarlo en una cita.' },
    access: { answer: 'Si gestionas la clínica, abre Configuración y ve a Accesos. Cada persona del equipo necesita una cuenta de Clara antes de recibir acceso a la clínica.' },
    professionals: { answer: 'Abre Configuración y ve a Profesionales. Usa Nuevo profesional para incluirlo en la agenda. Los permisos de la cuenta están en Accesos.' },
    units: { answer: 'Abre Configuración, ve a Sedes y selecciona Nueva sede. Las sedes aparecerán al crear una cita.' },
  },
  'en-US': {
    agenda: { answer: 'Open Schedule and select New appointment. Choose the patient, provider, service, and location, enter a date and time, then save.', cancel: 'In Schedule, edit the appointment, set Status to Cancelled, and save.', reschedule: 'In Schedule, edit the appointment and change its start and end times. Clara will warn you if the new time conflicts.', confirm: 'In Schedule, edit the appointment, set Status to Confirmed, and save.' },
    tasks: { answer: 'Open Tasks and select New task. Enter a title and, if needed, a due date. I can also prepare a task here for you to confirm.', complete: 'In Tasks, open the item, select Edit, set Status to Completed, and save.' },
    patients: { answer: 'In Patients, select New patient to create a record. To view or edit a record, search for the patient on the same page.' },
    opportunities: { answer: 'Open Inbox and select Opportunities. Choose New opportunity to record a deal, then link its contact and pipeline stage.' },
    contacts: { answer: 'Open Inbox, go to Contacts, and select New contact. You can link the contact to an opportunity afterward.' },
    services: { answer: 'Open Settings, select Services, then New service. Add the service details so it can be selected for appointments.' },
    access: { answer: 'If you manage the clinic, open Settings and select Access. Each team member needs a Clara account before they can be added to the clinic.' },
    professionals: { answer: 'Open Settings and select Providers. Choose New provider to add someone to the schedule. Account permissions are managed under Access.' },
    units: { answer: 'Open Settings, select Locations, then New location. The locations will be available when you create an appointment.' },
  },
};

function answer(text: string): ConversationAction {
  return { kind: 'answer', answer: text };
}

export function interpretConversation(message: string, agent: ChatAgentId, locale = 'pt-BR'): ConversationAction | undefined {
  const original = message.trim();
  const normalized = normalize(original);
  const latest = normalized.replace(/[.!?]+$/, '').trim();
  const isEn = locale === 'en-US';
  const isEs = locale === 'es-ES';
  const isPtPt = locale === 'pt-PT';

  if (/^(?:(?:sim|ok|pode|yes|sure|vale|si)[, ]+)?(?:(?:confirmar?|confirme|crie|criar|salve|salvar|confirm) (?:a |the |la )?(?:tarefa|task)|pode (?:criar|salvar|registrar)(?: (?:a )?tarefa)|(?:please )?(?:confirm|approve) (?:the )?task)$/.test(latest)) {
    return { kind: 'confirm_task' };
  }
  if (/^(?:(?:nao|por favor|no|please)[, ]+)?(?:(?:cancelar?|cancele|descarte|descartar|cancel|discard) (?:a |the |la )?(?:tarefa|task|proposta|proposal)|nao (?:crie|salve) (?:a )?tarefa)$/.test(latest)) {
    return { kind: 'cancel_task' };
  }

  const localizedRemember = isEn
    ? /^(?:please[, ]+)?(?:remember(?: that)?|note(?: that)?|save(?: this)?)\s+([\s\S]+)$/i.exec(original)
    : isEs
      ? /^(?:por favor[, ]+)?(?:recuerda(?: que)?|anota(?: que)?|guarda(?: que)?)\s+([\s\S]+)$/i.exec(original)
      : rememberCommand.exec(original);
  const note = localizedRemember?.[1].trim();
  if (note) {
    if (note.length > 180) return answer(isEn ? 'Could you shorten that to 180 characters so I can save the useful part?' : isEs ? '¿Puedes resumirlo en un máximo de 180 caracteres para guardar lo importante?' : isPtPt ? 'Pode resumir em até 180 caracteres para eu guardar o essencial?' : 'Pode resumir em até 180 caracteres? Assim consigo guardar o que importa para a sua rotina.');
    if (sensitiveNote.test(normalize(note))) {
      return answer(isEn ? 'I can save work preferences. Identity documents, credentials, and clinical information should stay in Clara’s designated records.' : isEs ? 'Puedo guardar preferencias de trabajo. Los documentos de identidad, credenciales e información clínica deben mantenerse en los registros correspondientes de Clara.' : isPtPt ? 'Posso guardar preferências de trabalho. Documentos de identificação, credenciais e informação clínica devem ficar nos espaços próprios da Clara.' : 'Posso guardar preferências de trabalho. Dados de identificação, credenciais e informações clínicas devem ficar nos espaços próprios da Clara.');
    }
    return { kind: 'remember', note };
  }
  if (/^(?:o que (?:voce )?(?:lembra(?: de mim)?|guardou|salvou)(?: (?:sobre mim|na memoria))?|(?:quais sao )?(?:as )?minhas preferencias|mostre (?:minhas preferencias|o que (?:voce )?lembra)|what do you remember(?: about me)?|show (?:me )?(?:my preferences|my notes)|what have you saved|que recuerdas(?: de mi)?|muestrame (?:mis preferencias|mis notas)|que has guardado)$/.test(latest)) {
    return { kind: 'recall' };
  }

  const localizedTask = isEn
    ? /^(?:(?:please )?(?:create|add|schedule|make)|(?:can you|could you) create) (?:a )?task(?:\s*[:—-]\s*|\s+called\s+|\s+to\s+)([\s\S]+)$/i.exec(original)
    : isEs
      ? /^(?:(?:por favor )?(?:crea|crear|añade|agrega|programa)|(?:puedes|podrias) crear) (?:una )?tarea(?:\s*[:—-]\s*|\s+llamada\s+|\s+para\s+)?([\s\S]+)$/i.exec(original)
      : taskCommand.exec(original);
  const task = localizedTask?.[1].trim();
  if (task) {
    if (task.length < 2 || task.length > 120) return answer(isEn ? 'Send me a task title between 2 and 120 characters.' : isEs ? 'Envíame un título de tarea de entre 2 y 120 caracteres.' : isPtPt ? 'Envie um título de tarefa entre 2 e 120 caracteres.' : 'Me manda um título entre 2 e 120 caracteres para eu preparar a tarefa.');
    return { kind: 'propose_task', title: task };
  }

  const asksForHelp = isEn
    ? /\b(how|where|can i|how do i|how can i)\b.*\b(add|create|confirm|cancel|reschedule|organize|use|find|register|access|check|complete|finish|book|schedule|manage)\b/.test(normalized)
    : isEs
      ? /\b(como|donde|puedo)\b.*\b(agregar|anadir|crear|confirmar|cancelar|anular|cambiar|reagendar|reprogramar|organizar|usar|encontrar|registrar|acceder|consultar|completar|finalizar|reservar|agendar|gestionar)\b/.test(normalized)
      : /\b(como|onde) (?:(?:e que|eu|que eu|posso|faco para|fazer para|consigo|devo|pode) )*(?:adicion[oa]r?|cadastr[oa]r?|cri[oa]r?|confirm[oa]r?|cancel[oa]r?|organiz[oa]r?|us[oa]r?|fica|abro|abri[ra]?|encontr[oa]r?|registr[oa]r?|acess[oa]r?|consult[oa]r?|conclu[oi]r?|finaliz[oa]r?|marc[oa]r?|agendo|agendar|reagendo|reagendar|vejo|ver)\b/.test(normalized);
  if (asksForHelp) {
    const matches = faq.flatMap((entry) => {
      const match = entry.topic.exec(normalized);
      return match ? [{ entry, position: match.index }] : [];
    });
    matches.sort((first, second) => first.position - second.position);
    const first = matches[0]?.entry;
    if (first) {
      const matched = 'other' in first ? first.other.find(([pattern]) => pattern.test(normalized)) : undefined;
      const translation = faqTranslations[locale]?.[first.id];
      const translatedSpecific = matched?.[2] && translation
        ? translation[matched[2] as 'cancel' | 'reschedule' | 'confirm' | 'complete']
        : undefined;
      return answer(translatedSpecific ?? translation?.answer ?? matched?.[1] ?? first.answer);
    }
  }

  if (/^(ola|oi|ola clara|oi clara|bom dia|boa tarde|boa noite|tudo bem|hello|hi|hey|good morning|good afternoon|good evening|hola|buenos dias|buenas tardes|buenas noches)(?:[,! ]+tudo bem)?$/.test(latest)) {
    const help = isEn
      ? ({ main: 'I can flag what needs attention, help you use Clara, or route a request to the right assistant.', agenda: 'I can check today’s schedule and help you book or confirm an appointment.', crm: 'I can check open opportunities and help you follow up with contacts.', operations: 'I can review pending work and prepare a task for the team.' }[agent])
      : isEs
        ? ({ main: 'Puedo señalar lo que requiere atención, ayudarte con Clara o dirigir tu solicitud al asistente adecuado.', agenda: 'Puedo revisar la agenda de hoy y ayudarte a reservar o confirmar una cita.', crm: 'Puedo revisar las oportunidades abiertas y ayudarte con el seguimiento de contactos.', operations: 'Puedo revisar las tareas pendientes y preparar una para el equipo.' }[agent])
        : isPtPt
          ? ({ main: 'Posso indicar o que precisa de atenção, ajudar a usar a Clara ou encaminhar o pedido para o assistente certo.', agenda: 'Posso consultar a agenda de hoje e ajudar a marcar ou confirmar uma consulta.', crm: 'Posso consultar as oportunidades em aberto e ajudar a acompanhar os contactos.', operations: 'Posso rever as tarefas pendentes e preparar uma para a equipa.' }[agent])
          : profileHelp[agent];
    return answer(isEn ? `Hi! ${help} Where would you like to start?` : isEs ? `¡Hola! ${help} ¿Por dónde te gustaría empezar?` : isPtPt ? `Olá! ${help} Por onde pretende começar?` : `Oi! ${help} Por onde você quer começar?`);
  }
  if (/^(?:(?:beleza|show|otimo|perfeito|great|perfect|thanks|thank you|vale|genial|perfecto|gracias)[, ]+)?(?:obrigad[oa]|valeu|brigad[oa]|agradeco|thanks|thank you|gracias|vale gracias)(?:[, ]+(?:pela ajuda|mesmo|clara|for your help|clara))?$/.test(latest)) {
    return answer(isEn ? 'You’re welcome. I’m here if you need anything else.' : isEs ? 'De nada. Aquí estoy si necesitas algo más.' : isPtPt ? 'De nada. Estou por aqui se precisar de mais alguma coisa.' : 'De nada! Estou por aqui se precisar de mais alguma coisa.');
  }
  if (/^(?:me ajuda|preciso de ajuda|como voce pode me ajudar|o que (?:voce )?(?:faz|consegue fazer|pode fazer))(?: na clara)?$/.test(latest) || /^(?:help|what can you do|how can you help me|what can you help with|ayuda|que puedes hacer|como puedes ayudarme|en que me puedes ayudar)$/.test(latest)) {
    if (isEn) return answer(({ main: 'I can summarize the clinic, check its records, and hand tasks to the right assistant.', agenda: 'I can check appointments, look up patient records, and help schedule, confirm, or cancel appointments.', crm: 'I can review opportunities, contact follow-ups, and patient records.', operations: 'I can review tasks, services, and financial summaries, and prepare tasks for confirmation.' }[agent]));
    if (isEs) return answer(({ main: 'Puedo resumir la actividad de la clínica, consultar sus datos y derivar tareas al asistente adecuado.', agenda: 'Puedo consultar citas y fichas administrativas, y ayudar a reservar, confirmar o cancelar citas.', crm: 'Puedo revisar oportunidades, seguimientos de contactos y fichas de pacientes.', operations: 'Puedo revisar tareas, servicios y resúmenes financieros, y preparar tareas para confirmar.' }[agent]));
    if (isPtPt) return answer(({ main: 'Posso resumir a atividade da clínica, consultar os seus dados e encaminhar tarefas para o assistente adequado.', agenda: 'Posso consultar marcações e fichas administrativas, e ajudar a marcar, confirmar ou cancelar consultas.', crm: 'Posso consultar oportunidades, retornos de contactos e fichas de pacientes.', operations: 'Posso rever tarefas, serviços e resumos financeiros, e preparar tarefas para confirmação.' }[agent]));
    return answer(profileHelp[agent]);
  }

  return undefined;
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ');
}
