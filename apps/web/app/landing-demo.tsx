"use client";

import {
  CalendarDays, CheckCircle2, ClipboardList, ContactRound, Kanban, LayoutDashboard, ListTodo, Sparkles, UsersRound, Wallet,
} from "lucide-react";
import { useState } from "react";

const viewIds = ["agenda", "crm", "finance", "assistant"] as const;

const calendarColumnsPt = [
  {
    day: "Seg 24",
    active: true,
    events: [
      { time: "09:00", patient: "Helena Costa", detail: "Primeira consulta · Dra. Marina", tone: "confirmed" },
      { time: "11:00", patient: "Lucas Ferreira", detail: "Avaliação · Dr. Rafael", tone: "scheduled" },
      { time: "14:30", patient: "Beatriz Ramos", detail: "Sessão 4/10 · Fisioterapia", tone: "confirmed" },
    ],
  },
  {
    day: "Ter 25",
    active: false,
    events: [
      { time: "09:30", patient: "Gabriel Alves", detail: "Retorno · Dra. Marina", tone: "confirmed" },
      { time: "15:00", patient: "Camila Duarte", detail: "Consulta inicial · Unidade Sul", tone: "scheduled" },
    ],
  },
];

export function LandingDemo({ lang }: { lang: "pt" | "en" }) {
  const isEn = lang === "en";
  const [view, setView] = useState<(typeof viewIds)[number]>("agenda");
  const views = viewIds.map((id, index) => ({
    id,
    label: (isEn
      ? ["Visual schedule", "Inbox & CRM", "Finance & packages", "Assistants"]
      : ["Agenda visual", "Atendimento e CRM", "Financeiro e pacotes", "Assistentes"])[index],
    icon: [CalendarDays, Kanban, Wallet, Sparkles][index],
  }));
  const pipeline = isEn
    ? [
      { stage: "New", title: "Orthodontic assessment", detail: "Source: Instagram · today" },
      { stage: "In contact", title: "Physiotherapy package", detail: "Follow-up set for 4 pm" },
      { stage: "Booked", title: "First appointment", detail: "Time reserved on the schedule" },
    ]
    : [
      { stage: "Nova", title: "Avaliação ortodôntica", detail: "Origem: Instagram · hoje" },
      { stage: "Em contato", title: "Pacote fisioterapia", detail: "Retorno marcado para 16h" },
      { stage: "Agendada", title: "Primeira consulta", detail: "Horário reservado na agenda" },
    ];
  const financeCards = isEn
    ? [
      { label: "Received this month", value: "$42,680.00" },
      { label: "Net collected", value: "$29,410.00" },
      { label: "Active packages", value: "18 patients" },
    ]
    : [
      { label: "Recebido no mês", value: "R$ 42.680,00" },
      { label: "Saldo realizado", value: "R$ 29.410,00" },
      { label: "Pacotes ativos", value: "18 pacientes" },
    ];
  const financeItems = isEn
    ? [
      { title: "10-session package — Beatriz Ramos", detail: "Pix · Reconciled", status: "Reconciled", good: true },
      { title: "First appointment — Helena Costa", detail: "Card · Today", status: "Received", good: true },
      { title: "Clinical supplies vendor", detail: "Due tomorrow", status: "To pay", good: false },
    ]
    : [
      { title: "Pacote 10 sessões — Beatriz Ramos", detail: "Pix · Caixa conferido", status: "Conferido", good: true },
      { title: "Consulta inicial — Helena Costa", detail: "Cartão · Hoje", status: "Recebido", good: true },
      { title: "Fornecedor materiais clínicos", detail: "Vence amanhã", status: "A pagar", good: false },
    ];
  const calendarColumns = isEn
    ? [
      { ...calendarColumnsPt[0], day: "Mon 24", events: calendarColumnsPt[0].events.map((event, index) => ({ ...event, detail: ["First visit · Dr. Marina", "Assessment · Dr. Rafael", "Session 4/10 · Physiotherapy"][index] })) },
      { ...calendarColumnsPt[1], day: "Tue 25", events: calendarColumnsPt[1].events.map((event, index) => ({ ...event, detail: ["Follow-up · Dr. Marina", "First visit · South location"][index] })) },
    ]
    : calendarColumnsPt;
  return (
    <div className="lp-demo">
      <div className="lp-demo-tabs" role="group" aria-label={isEn ? "Explore Clara features" : "Explorar recursos da Clara"}>
        {views.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={view === id}
            aria-controls="demo-content"
            onClick={() => setView(id)}
          >
            <Icon aria-hidden="true" size={16} />
            {label}
          </button>
        ))}
      </div>
      <div className="lp-bezel">
        <div className="lp-demo-window">
          <div className="lp-demo-side" aria-hidden="true">
            <LayoutDashboard size={19} />
            <CalendarDays size={19} className={view === "agenda" ? "active-ico" : ""} />
            <UsersRound size={19} />
            <ContactRound size={19} className={view === "crm" ? "active-ico" : ""} />
            <Wallet size={19} className={view === "finance" ? "active-ico" : ""} />
            <Sparkles size={19} className={view === "assistant" ? "active-ico" : ""} />
            <ClipboardList size={19} />
          </div>
          <div className="lp-demo-content" id="demo-content" aria-live="polite">
            <div className="lp-demo-head">
              <div>
                <span>{isEn ? "Horizon Clinic" : "Clínica Horizonte"}</span>
                <h3>
                  {view === "agenda"
                    ? (isEn ? "Team weekly schedule" : "Calendário semanal da equipe")
                    : view === "crm"
                      ? (isEn ? "Opportunities and follow-ups" : "Oportunidades e retornos")
                      : view === "finance"
                        ? (isEn ? "Finance and session packages" : "Financeiro e pacotes de sessões")
                        : (isEn ? "My Assistant · Schedule" : "Meu Assistente · Agenda")}
                </h3>
              </div>
              <span className="lp-example">{isEn ? "Illustrative example" : "Exemplo ilustrativo"}</span>
            </div>

            {view === "agenda" && (
              <div className="lp-mini-cal">
                {calendarColumns.map((col) => (
                  <section key={col.day} className={col.active ? "lp-mini-col today" : "lp-mini-col"}>
                    <header>
                      <strong>{col.day}</strong>
                      <span>{col.events.length} {isEn ? "appointments" : "horários"}</span>
                    </header>
                    <div className="lp-mini-events">
                      {col.events.map((ev) => (
                        <article key={`${col.day}-${ev.time}`} className={`lp-mini-event ${ev.tone}`}>
                          <time>{ev.time}</time>
                          <div>
                            <strong>{ev.patient}</strong>
                            <small>{ev.detail}</small>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {view === "crm" && (
              <div className="lp-pipeline">
                {pipeline.map(({ stage, title, detail }) => (
                  <section key={stage}>
                    <h4>{stage}</h4>
                    <div>
                      <strong>{title}</strong>
                      <small>{detail}</small>
                    </div>
                  </section>
                ))}
              </div>
            )}

            {view === "finance" && (
              <div className="lp-demo-finance">
                <div className="lp-demo-kpis">
                  {financeCards.map((card) => (
                    <div key={card.label}>
                      <small>{card.label}</small>
                      <strong>{card.value}</strong>
                    </div>
                  ))}
                </div>
                <ul className="lp-demo-list">
                  {financeItems.map(({ title, detail, status, good }) => (
                    <li key={title}>
                      <ListTodo size={18} aria-hidden="true" />
                      <div>
                        <strong>{title}</strong>
                        <small>{detail}</small>
                      </div>
                      <span className={good ? "lp-status done" : "lp-status"}>{status}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {view === "assistant" && (
              <div className="lp-demo-chat">
                <div className="lp-demo-bubble user">{isEn ? "Confirm Helena Costa's appointment and show me her package balance" : "Confirma a consulta da Helena Costa e me mostra o saldo do pacote dela"}</div>
                <div className="lp-demo-bubble bot">
                  <div className="lp-demo-bubble-head">
                    <CheckCircle2 size={15} aria-hidden="true" />
                    <strong>{isEn ? "Schedule · audited confirmation" : "Agenda · confirmação com auditoria"}</strong>
                  </div>
                  <p>
                    {isEn
                      ? "I found Helena Costa's appointment today at 9:00 am with Dr. Marina. Should I mark it as confirmed? She has 6 of 10 sessions remaining in her active package."
                      : "Encontrei o horário de Helena Costa hoje às 09:00 com Dra. Marina. Posso marcar como confirmado? Ela tem 6 de 10 sessões restantes no pacote ativo."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
