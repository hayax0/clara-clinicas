"use client";

import { ArrowUp, AudioLines, ChevronRight, CornerDownLeft, LockKeyhole, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorText, LoadError, Loading, useLoad } from "./components";
import { api, ApiError, displayDate, errorMessage, type Organization, type Role } from "./data";

const agentsEn = {
  main: {
    name: "Main Agent",
    area: "Clinic overview",
    greeting: "Where shall we start?",
    description: "I track your schedule, patients, CRM, tasks, and monthly financial summary.",
    prompts: ["What needs my attention today?", "What appointments do we have this week?", "How is our cash flow this month?"],
  },
  agenda: {
    name: "Schedule",
    area: "Bookings & confirmations",
    greeting: "Let's check the schedule?",
    description: "I can book, confirm, or cancel appointments, review the week, and show patient summaries.",
    prompts: ["What appointments do we have today?", "What appointments do we have this week?", "Schedule an appointment tomorrow at 2pm"],
  },
  crm: {
    name: "CRM",
    area: "Opportunities & inbox",
    greeting: "Let's review your CRM?",
    description: "I can show open opportunities, commercial follow-ups, and patient contact details.",
    prompts: ["How many open opportunities do we have?", "Who is waiting for a follow-up?"],
  },
  operations: {
    name: "Operations",
    area: "Tasks, services & finance",
    greeting: "What shall we organize?",
    description: "I can organize pending tasks, check monthly payment methods/overdue bills, and register services or providers.",
    prompts: ["Which tasks are open?", "Create a task: review tomorrow's schedule"],
  },
} as const;

const agents = {
  main: {
    name: "Agente Principal",
    area: "Visão geral da clínica",
    greeting: "Por onde começamos?",
    description: "Acompanho a agenda, pacientes, CRM, tarefas e resumo financeiro da clínica.",
    prompts: ["O que precisa da minha atenção hoje?", "Quais consultas temos esta semana?", "Como está o financeiro do mês?"],
  },
  agenda: {
    name: "Agenda",
    area: "Agendamentos e confirmações",
    greeting: "Vamos ver a agenda?",
    description: "Posso marcar, confirmar ou cancelar consultas, consultar a semana e mostrar a ficha de um paciente.",
    prompts: ["Quais agendamentos temos hoje?", "Quais consultas temos esta semana?", "Quero agendar uma consulta amanhã às 14h"],
  },
  crm: {
    name: "CRM",
    area: "Oportunidades e atendimento",
    greeting: "Vamos conferir seu CRM?",
    description: "Posso mostrar oportunidades em aberto, retornos comerciais e dados administrativos dos pacientes.",
    prompts: ["Quantas oportunidades em aberto?", "Quem está esperando retorno?"],
  },
  operations: {
    name: "Operações",
    area: "Tarefas e serviços",
    greeting: "O que vamos organizar?",
    description: "Posso organizar pendências, criar tarefas com confirmação e cadastrar serviços, profissionais ou unidades.",
    prompts: ["Quais tarefas estão em aberto?", "Crie uma tarefa: conferir a agenda de amanhã"],
  },
} as const;

export type AgentId = keyof typeof agents;
type ChatMessage = {
  id: string;
  userText: string;
  answer: string;
  responderId: string;
  metrics: { label: string; value: number }[];
  createdAt: string;
  tool?: string | null;
  proposalExpiresAt?: string | null;
};
type ChatState = { available: boolean; modelAvailable?: boolean; messages: ChatMessage[] };

const messageLimit = 320;
const agentIds = Object.keys(agents) as AgentId[];

function AgentAvatar({ id }: { id: AgentId }) {
  return <span className="clara-agent-avatar" data-agent={id} aria-hidden="true">
    <svg viewBox="0 0 64 64" fill="none">
      {id === "main" && <>
        <path d="M14 36c0-11 8-19 18-19s18 8 18 19c0 9-7 17-18 17s-18-8-18-17Z" fill="currentColor"/>
        <path d="M33 18c1-6 6-9 12-8-1 6-5 9-12 8Z" fill="currentColor"/>
        <path d="M13 19v8m-4-4h8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
      </>}
      {id === "agenda" && <>
        <rect x="13" y="18" width="38" height="33" rx="10" fill="currentColor"/>
        <path d="M23 13v10m18-10v10" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
        <path d="M15 27h34" stroke="var(--avatar-paper)" strokeWidth="2" opacity=".6"/>
      </>}
      {id === "crm" && <>
        <path d="M12 32c0-9 7-15 17-15h7c9 0 16 7 16 15s-7 16-16 16h-8l-10 5 1-8c-5-3-7-7-7-13Z" fill="currentColor"/>
        <path d="M47 11v8m-4-4h8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
      </>}
      {id === "operations" && <>
        <path d="M13 35c0-9 5-16 13-16 2 0 4 1 6 2 2-1 4-2 6-2 8 0 13 7 13 16 0 10-8 17-19 17s-19-7-19-17Z" fill="currentColor"/>
        <path d="m27 17 5-6 5 6" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
      </>}
      <path d="M25 34v2m14-2v2m-11 6c2 3 6 3 8 0" stroke="var(--avatar-paper)" strokeWidth="2.6" strokeLinecap="round"/>
    </svg>
  </span>;
}

function normalizedAgent(id: string): AgentId {
  return Object.hasOwn(agents, id) ? id as AgentId : "main";
}

function presentError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) return "Seu perfil não tem acesso ao Meu Assistente nesta clínica.";
    if (error.status === 429) return "A clínica atingiu o limite de consultas. Tente novamente mais tarde.";
  }
  return errorMessage(error);
}

function Reply({ message, timezone, locale }: { message: ChatMessage; timezone: string; locale: string }) {
  const responder = normalizedAgent(message.responderId);
  const time = displayDate(message.createdAt, timezone, { hour: "2-digit", minute: "2-digit" }, locale);
  return <li className="clara-chat-turn">
    <div className="clara-chat-user">
      <p>{message.userText}</p>
      <time dateTime={message.createdAt}>{time}</time>
    </div>
    <div className="clara-chat-reply">
      <AgentAvatar id={responder} />
      <div className="clara-chat-reply-copy">
        <strong>{agents[responder].name}</strong>
        <p>{message.answer}</p>
        {message.metrics.length > 0 && <dl className="clara-chat-metrics">
          {message.metrics.map(({ label, value }) => <div key={label}>
            <dt>{label}</dt><dd>{value.toLocaleString(locale)}</dd>
          </div>)}
        </dl>}
      </div>
    </div>
  </li>;
}

function Thread({ agentId, organization, role, onBusy }: {
  agentId: AgentId;
  organization: Organization;
  role: Role;
  onBusy: (busy: boolean) => void;
}) {
  const isEn = organization.locale === "en-US";
  const profile = (isEn ? agentsEn : agents)[agentId];
  const path = `/organizations/${organization.id}/assistant/chats/${agentId}`;
  const load = useCallback((signal: AbortSignal) => api<ChatState>(path, "GET", undefined, signal), [path]);
  const { data, error, reload } = useLoad(load);
  const [draft, setDraft] = useState("");
  const [pendingText, setPendingText] = useState("");
  const [sent, setSent] = useState<ChatMessage[]>([]);
  const [requestError, setRequestError] = useState("");
  const active = useRef<AbortController | null>(null);
  const lastRequest = useRef<{ text: string; id: string } | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const textbox = useRef<HTMLTextAreaElement>(null);
  const available = !error && data?.available === true;
  const persisted = data?.messages ?? [];
  const messages = [...persisted, ...sent.filter((entry) => !persisted.some(({ id }) => id === entry.id))];

  const latest = messages.at(-1);
  const bookingProposal = latest?.tool === "booking_proposal";
  const followUpProposal = latest?.tool === "followup_proposal";
  const patientProposal = latest?.tool === "patient_proposal";
  const setupProposal = latest?.tool === "setup_proposal";
  const confirmApptProposal = latest?.tool === "appointment_confirm_proposal";
  const cancelApptProposal = latest?.tool === "appointment_cancel_proposal";
  const needsConfirmation =
    (followUpProposal ||
      patientProposal ||
      bookingProposal ||
      setupProposal ||
      confirmApptProposal ||
      cancelApptProposal ||
      latest?.tool === "task_proposal") &&
    Boolean(latest.proposalExpiresAt);

  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    const element = log.current;
    if (element && (messages.length || pendingText)) element.scrollTop = element.scrollHeight;
  }, [messages.length, pendingText]);

  async function send(text: string) {
    const value = text.trim();
    if (!available || !value || value.length > messageLimit || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const requestId = lastRequest.current?.text === value ? lastRequest.current.id : crypto.randomUUID();
    lastRequest.current = { text: value, id: requestId };
    onBusy(true);
    setRequestError("");
    setDraft("");
    setPendingText(value);
    try {
      const result = await api<ChatMessage>(path, "POST", { message: value, requestId }, controller.signal);
      if (!controller.signal.aborted) {
        setSent((current) => [...current, result]);
        lastRequest.current = null;
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setDraft(value);
        setRequestError(presentError(err));
      }
    } finally {
      active.current = null;
      if (!controller.signal.aborted) {
        setPendingText("");
        onBusy(false);
      }
    }
  }

  return <section className="clara-chat-thread" aria-labelledby="clara-chat-thread-title">
    <header className="clara-chat-thread-head">
      <AgentAvatar id={agentId} />
      <div>
        <h2 id="clara-chat-thread-title">{profile.name}</h2>
        <p>{profile.area}</p>
      </div>
      <span className="clara-chat-scope"><LockKeyhole size={13} aria-hidden="true" />{organization.name}</span>
    </header>

    <div className="clara-chat-log" ref={log} aria-label={isEn ? "Conversation" : "Conversa"} role="log">
      {error ? <LoadError message={error} retry={reload} /> : !data ? <Loading label={isEn ? "Opening conversation…" : "Abrindo conversa…"} /> : <>
        <ol className="clara-chat-messages">
          {messages.map((message) => <Reply key={message.id} message={message} timezone={organization.timezone} locale={organization.locale ?? "pt-BR"} />)}
          {pendingText && <li className="clara-chat-turn">
            <div className="clara-chat-user"><p>{pendingText}</p></div>
            <div className="clara-chat-reply">
              <AgentAvatar id={agentId} />
              <span className="clara-chat-thinking"><AudioLines size={16} aria-hidden="true" />{isEn ? "Just a moment…" : "Só um instante…"}</span>
            </div>
          </li>}
        </ol>
        {!messages.length && !pendingText && <div className="clara-chat-intro">
          <AgentAvatar id={agentId} />
          <h3>{profile.greeting}</h3>
          <p>{profile.description}</p>
          {available && <ul className="clara-chat-prompts" aria-label={isEn ? "Suggested prompts" : "Sugestões de perguntas"}>
            {profile.prompts.map((prompt) => <li key={prompt}>
              <button type="button" onClick={() => { setDraft(prompt); textbox.current?.focus(); }}>
                <span>{prompt}</span><CornerDownLeft size={14} aria-hidden="true" />
              </button>
            </li>)}
          </ul>}
        </div>}
        {!available && <p className="clara-chat-unavailable">
          {role === "VIEWER"
            ? (isEn ? "Your role has read-only access. Contact clinic management to send messages." : "Seu perfil tem acesso de leitura ao sistema. Fale com a gestão para enviar mensagens.")
            : (isEn ? "The assistant is unavailable on this installation." : "O assistente está indisponível nesta instalação.")}
        </p>}
      </>}
    </div>

    <div className="clara-chat-controls">
      {requestError && <ErrorText>{requestError}</ErrorText>}
      {needsConfirmation && available && <div className="clara-chat-actions" aria-label="Confirmar ou cancelar proposta">
        <button
          className="button compact primary"
          type="button"
          disabled={Boolean(pendingText) || Boolean(draft.trim())}
          onClick={() =>
            void send(
              followUpProposal
                ? "Confirmar retorno"
                : patientProposal
                  ? "Confirmar o cadastro"
                  : bookingProposal
                    ? "Confirmar o agendamento"
                    : setupProposal || confirmApptProposal || cancelApptProposal
                      ? "Sim"
                      : "Confirmar tarefa",
            )
          }
        >
          {followUpProposal
            ? "Confirmar retorno"
            : patientProposal || setupProposal
              ? "Confirmar cadastro"
              : bookingProposal
                ? "Confirmar agendamento"
                : confirmApptProposal
                  ? "Confirmar consulta"
                  : cancelApptProposal
                    ? "Confirmar cancelamento"
                    : "Confirmar tarefa"}
        </button>
        <button
          className="button compact secondary"
          type="button"
          disabled={Boolean(pendingText) || Boolean(draft.trim())}
          onClick={() =>
            void send(
              followUpProposal
                ? "Cancelar retorno"
                : patientProposal || setupProposal
                  ? "Cancelar o cadastro"
                  : bookingProposal
                    ? "Cancelar o agendamento"
                    : confirmApptProposal || cancelApptProposal
                      ? "Não"
                      : "Cancelar a tarefa",
            )
          }
        >
          Cancelar
        </button>
      </div>}
      <form className="clara-chat-compose" onSubmit={(event) => { event.preventDefault(); void send(draft); }}>
        <textarea ref={textbox} aria-label={isEn ? `Message ${profile.name}` : `Mensagem para ${profile.name}`}
          placeholder={isEn ? `Message ${profile.name}…` : `Escreva para ${profile.name}…`} value={draft} rows={1} maxLength={messageLimit}
          disabled={!available || Boolean(pendingText)}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send(draft);
            }
          }}
        />
        <button className="clara-chat-send" type="submit" aria-label={isEn ? "Send message" : "Enviar mensagem"}
          disabled={!available || !draft.trim() || Boolean(pendingText)}>
          <ArrowUp size={19} aria-hidden="true" />
        </button>
      </form>
      <p className="clara-chat-hint">
        {data?.modelAvailable === false
          ? (isEn ? "Questions and tasks available. Smart queries require Gemini configured." : "Dúvidas e tarefas disponíveis. Consultas inteligentes precisam do Gemini.")
          : (isEn ? "You can register a patient by name. Avoid sharing ID documents or clinical notes." : "Você pode cadastrar um paciente pelo nome. Evite incluir documentos e informações clínicas.")}
      </p>
    </div>
  </section>;
}

export function Assistant({ organization, role, initialAgent = "main" }: { organization: Organization; role: Role; initialAgent?: AgentId }) {
  const [selected, setSelected] = useState<AgentId>(initialAgent);
  const [busy, setBusy] = useState(false);
  const isEn = organization.locale === "en-US";
  const catalog = isEn ? agentsEn : agents;

  return <>
    <div className="clara-chat-page-heading">
      <div><h1>{isEn ? "My Assistant" : "Meu Assistente"}</h1><p>{isEn ? "Chat with your clinic's AI agent team." : "Converse com a equipe de agentes da sua clínica."}</p></div>
    </div>
    <div className="clara-chat">
      <nav className="clara-chat-directory" aria-label={isEn ? "Clinic agents" : "Agentes da clínica"}>
        <div className="clara-chat-directory-title"><Sparkles size={16} aria-hidden="true" /><h2>{isEn ? "Agent team" : "Equipe de agentes"}</h2></div>
        <ul className="clara-chat-agent-list">
          {agentIds.map((id) => <li key={id}>
            <button type="button" aria-pressed={selected === id} disabled={busy && selected !== id}
              onClick={() => setSelected(id)} title={catalog[id].area}>
              <AgentAvatar id={id} />
              <span className="clara-chat-agent-copy"><strong>{catalog[id].name}</strong><small>{catalog[id].area}</small></span>
              <ChevronRight size={15} className="clara-chat-agent-chevron" aria-hidden="true" />
            </button>
          </li>)}
        </ul>
      </nav>

      <Thread key={`${organization.id}:${selected}`} agentId={selected} organization={organization} role={role} onBusy={setBusy} />
    </div>
  </>;
}
