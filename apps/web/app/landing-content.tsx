"use client";

import {
  ArrowUpRight, Building2, CalendarDays, Check, ChevronDown, ClipboardCheck, Globe, Kanban, LockKeyhole,
  ShieldCheck, Sparkles, UsersRound, Wallet,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { ClaraLogo } from "./brand-logo";
import { LandingDemo } from "./landing-demo";
import { LandingMotion } from "./landing-motion";

type Lang = "pt" | "en";
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

function getUiLocaleSnapshot(): Lang {
  return window.localStorage.getItem(uiLocaleStorageKey) === "en-US" ? "en" : "pt";
}

function getServerUiLocaleSnapshot(): Lang {
  return "pt";
}

const copy = {
  pt: {
    suffix: "para clínicas",
    nav: {
      features: "Recursos",
      demo: "Demonstração",
      install: "Implantação",
      faq: "Dúvidas",
      cta: "Acessar sistema",
    },
    hero: {
      eyebrow: "Gestão clínica com implantação assistida",
      titleStart: "Clareza diária na rotina ",
      titleEm: "da sua clínica.",
      description:
        "Reúna agenda visual, pacientes, atendimento, financeiro, pacotes de sessões e assistentes inteligentes no mesmo painel vendido por preço fixo e configurado para a sua equipe.",
      secondaryCta: "Ver o sistema em ação",
      trust1: "Dados isolados por clínica",
      trust2: "Preço fixo, sem assinatura",
      photoAlt: "Duas profissionais de uma clínica organizam a rotina no computador da recepção",
      floatTitle: "Agenda semanal integrada",
      floatSub: "Pacientes, pacotes e confirmações em um clique",
    },
    pillars: [
      "Calendário visual conectado ao paciente",
      "Financeiro, relatórios CSV e pacotes",
      "Isolamento e permissões por clínica",
    ],
    featuresSection: {
      eyebrow: "Feita para a recepção e a gestão",
      title: "Tudo que a clínica precisa para conduzir o dia com leveza.",
      description:
        "Do primeiro contato à conferência do caixa, cada módulo conversa entre si sem telas poluídas nem menus desnecessários.",
      items: [
        {
          icon: CalendarDays,
          tag: "Calendário visual",
          title: "Agenda com ficha completa do paciente",
          text: "Navegue por dia, semana ou mês, filtre por profissional e unidade, clique em qualquer horário para marcar e abra os dados e pacotes do paciente sem sair da grade.",
        },
        {
          icon: Sparkles,
          tag: "Equipe inteligente",
          title: "Assistentes que entendem a rotina",
          text: "Agente Principal, Agenda, CRM e Operações consultam horários, cadastram pacientes, confirmam consultas e preparam tarefas sempre com sua confirmação.",
        },
        {
          icon: Wallet,
          tag: "Caixa e relatórios",
          title: "Financeiro, relatórios CSV e pacotes",
          text: "Contas a receber e a pagar, relatórios por forma de pagamento e profissional, exportação CSV, fechamento diário de caixa e saldo de pacotes.",
        },
        {
          icon: Kanban,
          tag: "Comercial",
          title: "Captação, retornos e campanhas",
          text: "Formulário público por clínica, fila de retornos, origem do lead e campanhas manuais respeitando o consentimento vigente.",
        },
        {
          icon: UsersRound,
          tag: "Permissões",
          title: "Pacientes, equipe e dados isolados",
          text: "Cada clínica mantém pacientes, conversas, financeiro e acessos separados — de proprietário e gestor até recepção e leitura.",
        },
        {
          icon: ClipboardCheck,
          tag: "Dia a dia",
          title: "Tarefas com prazo e lembretes 24h",
          text: "Prepare lembretes de consultas autorizadas, revise o texto antes de enviar por WhatsApp, SMS ou e-mail e acompanhe pendências da equipe.",
        },
      ],
    },
    demoSection: {
      eyebrow: "Painel integrado",
      title: "Veja como o dia se organiza em um só lugar.",
      description:
        "Alterne entre o calendário semanal, o funil comercial, o controle financeiro com pacotes e os assistentes da clínica.",
      cta: "Abrir painel",
    },
    specialtiesSection: {
      eyebrow: "Especialidades",
      title: "Adaptada a diferentes rotinas de atendimento.",
      items: [
        { title: "Odontologia", text: "Acompanhe avaliações, planos, retornos e oportunidades de novos tratamentos." },
        { title: "Estética", text: "Controle pacotes de sessões, agendamentos por profissional e campanhas autorizadas." },
        { title: "Fisioterapia", text: "Gerencie saldo de sessões contratadas, horários recorrentes e evolução de retornos." },
        { title: "Clínicas médicas", text: "Visualize a agenda por especialista, confirme consultas e organize o caixa diário." },
      ],
    },
    installSection: {
      eyebrow: "Implantação assistida",
      title: "Da proposta ao primeiro atendimento.",
      steps: [
        { num: "01", title: "Definir o escopo", text: "Alinhamos unidades, equipe, idioma, moeda e rotina da clínica. A proposta traz o preço fixo da venda." },
        { num: "02", title: "Configurar o sistema", text: "Preparamos a organização, os serviços, o calendário, o financeiro e os perfis de acesso." },
        { num: "03", title: "Entregar para a equipe", text: "A equipe recebe o acesso e começa a operar a clínica com acompanhamento inicial." },
      ],
    },
    faqSection: {
      eyebrow: "Dúvidas frequentes",
      title: "Perguntas frequentes",
      items: [
        {
          title: "Como funciona a implantação?",
          text: "O responsável pela implantação configura a clínica, as unidades, os serviços e os acessos. Com a estrutura pronta, a equipe entra no painel para operar a agenda, o atendimento, o financeiro e os assistentes.",
        },
        {
          title: "Posso organizar mais de uma unidade ou clínica?",
          text: "Sim. Cadastre unidades dentro da sua clínica e filtre a agenda por unidade ou profissional. Se você participa de mais de uma clínica, alterne entre elas mantendo todos os registros isolados.",
        },
        {
          title: "Como funcionam os lembretes por WhatsApp, SMS e e-mail?",
          text: "A equipe revisa o texto sugerido para lembretes ou campanhas autorizadas, abre o canal escolhido (WhatsApp, SMS ou e-mail) e confirma o envio manualmente.",
        },
        {
          title: "Como funcionam os assistentes de IA?",
          text: "Com o Gemini configurado no servidor, os assistentes ajudam em consultas administrativas, agendamentos, confirmações e tarefas — sempre validando permissões e pedindo confirmação antes de gravar qualquer alteração.",
        },
        {
          title: "Como a Clara é vendida?",
          text: "A Clara é vendida por preço fixo, com implantação assistida na sua clínica. O valor e o escopo são definidos na proposta comercial, sem planos de assinatura recorrente.",
        },
      ],
    },
    finalCta: {
      eyebrow: "Acesso da equipe",
      title: "Sua clínica já usa a Clara?",
      description: "Entre com a conta da sua equipe para acessar agenda, pacientes e financeiro.",
      cta: "Acessar sistema",
    },
    footer: {
      features: "Recursos",
      demo: "Demonstração",
      faq: "Perguntas frequentes",
      login: "Acessar minha clínica",
    },
  },
  en: {
    suffix: "for clinics",
    nav: {
      features: "Features",
      demo: "Demo",
      install: "Onboarding",
      faq: "FAQ",
      cta: "Open App",
    },
    hero: {
      eyebrow: "Clinic management with guided onboarding",
      titleStart: "Daily clarity for ",
      titleEm: "your clinic's routine.",
      description:
        "Bring visual scheduling, patients, inbox, multi-currency finance (USD, EUR, GBP, BRL), session packages, and AI assistants into one workspace — sold for a fixed price with assisted setup.",
      secondaryCta: "See it in action",
      trust1: "Strict per-clinic data isolation",
      trust2: "Fixed price, no monthly SaaS lock-in",
      photoAlt: "Two clinic professionals organizing the daily schedule at the front desk",
      floatTitle: "Integrated weekly schedule",
      floatSub: "Patients, session packages & confirmations in one click",
    },
    pillars: [
      "Visual calendar linked to patient records",
      "Multi-currency finance, CSV reports & packages",
      "Strict isolation and role-based access per clinic",
    ],
    featuresSection: {
      eyebrow: "Built for front desk & management",
      title: "Everything your clinic needs to run smoothly every day.",
      description:
        "From first inquiry to daily cash closing, every module works together without cluttered screens or unnecessary menus.",
      items: [
        {
          icon: CalendarDays,
          tag: "Visual calendar",
          title: "Schedule with complete patient drawer",
          text: "Switch between day, week, or month views, filter by provider and location, click any open slot to book, and inspect patient packages without leaving the calendar.",
        },
        {
          icon: Sparkles,
          tag: "Smart team",
          title: "Multilingual AI assistants for daily ops",
          text: "Main, Schedule, CRM, and Operations assistants check availability, register patients, confirm appointments, and stage tasks — always with explicit confirmation.",
        },
        {
          icon: Wallet,
          tag: "Cash & reports",
          title: "Multi-currency finance, CSV & packages",
          text: "Accounts receivable and payable in USD, EUR, GBP, or BRL, payment method and provider breakdowns, CSV export, daily cash closings, and session package balances.",
        },
        {
          icon: Kanban,
          tag: "Growth",
          title: "Lead capture, follow-ups & campaigns",
          text: "Public clinic intake form, follow-up queue, lead source tracking, and opt-in manual outreach respecting active patient consent.",
        },
        {
          icon: UsersRound,
          tag: "Permissions",
          title: "Isolated patients, team & financial data",
          text: "Each clinic keeps its own patients, conversations, finances, and permissions — from Owner and Manager to Staff and Viewer.",
        },
        {
          icon: ClipboardCheck,
          tag: "Daily ops",
          title: "Tasks with deadlines & 24h reminders",
          text: "Prepare authorized appointment reminders, review the message before sending via SMS, Email, or WhatsApp, and track team follow-ups.",
        },
      ],
    },
    demoSection: {
      eyebrow: "Unified workspace",
      title: "See how your entire day comes together in one place.",
      description:
        "Switch between the weekly calendar, commercial pipeline, financial dashboard with packages, and clinic assistants.",
      cta: "Open workspace",
    },
    specialtiesSection: {
      eyebrow: "Specialties",
      title: "Tailored to diverse outpatient practices.",
      items: [
        { title: "Dentistry", text: "Track evaluations, treatment plans, follow-ups, and patient recall opportunities." },
        { title: "Aesthetics & MedSpa", text: "Manage session packages, provider schedules, and consent-based outreach." },
        { title: "Physical Therapy", text: "Control remaining session balances, recurring slots, and follow-up progress." },
        { title: "Medical Clinics", text: "View schedules by specialist, confirm appointments, and reconcile daily cash flow." },
      ],
    },
    installSection: {
      eyebrow: "Assisted onboarding",
      title: "From proposal to your first appointment.",
      steps: [
        { num: "01", title: "Define scope", text: "We align locations, team roles, timezone, currency (USD/EUR/GBP/BRL), and workflow under a fixed-price proposal." },
        { num: "02", title: "Configure workspace", text: "We set up your organization, services, providers, calendar, finance categories, and access roles." },
        { num: "03", title: "Hand off to your team", text: "Your team receives direct access and starts running daily operations with guided onboarding." },
      ],
    },
    faqSection: {
      eyebrow: "FAQ",
      title: "Frequently asked questions",
      items: [
        {
          title: "How does onboarding work?",
          text: "Our onboarding specialist configures your clinic, locations, services, currency, timezone, and user roles. Once ready, your team logs in and operates scheduling, inbox, finance, and AI assistants.",
        },
        {
          title: "Can I manage multiple locations or clinics?",
          text: "Yes. Add multiple locations inside your clinic and filter the schedule by location or provider. Users belonging to multiple clinics can switch between them with strict data isolation.",
        },
        {
          title: "How do SMS, Email, and WhatsApp reminders work?",
          text: "Your staff reviews the suggested reminder text for authorized appointments, opens the preferred channel (SMS, Email, or WhatsApp), and manually confirms delivery.",
        },
        {
          title: "How do the AI assistants work?",
          text: "Powered by Gemini on the backend, the assistants help with administrative lookups, booking, confirmations, and tasks in English or Portuguese — always checking permissions and requiring confirmation before writing.",
        },
        {
          title: "How is Clara priced?",
          text: "Clara is sold for a fixed price with assisted implementation for your clinic. Scope and pricing are agreed upfront in the commercial proposal, with no recurring subscription lock-in.",
        },
      ],
    },
    finalCta: {
      eyebrow: "Team access",
      title: "Already using Clara at your clinic?",
      description: "Sign in with your team account to access scheduling, patients, and finance.",
      cta: "Open App",
    },
    footer: {
      features: "Features",
      demo: "Demo",
      faq: "FAQ",
      login: "Access my clinic",
    },
  },
} as const;

export function LandingContent() {
  const lang = useSyncExternalStore(subscribeToUiLocale, getUiLocaleSnapshot, getServerUiLocaleSnapshot);
  const c = copy[lang];

  useEffect(() => {
    document.documentElement.lang = lang === "en" ? "en" : "pt-BR";
  }, [lang]);

  function switchLanguage() {
    const next = lang === "pt" ? "en" : "pt";
    window.localStorage.setItem(uiLocaleStorageKey, next === "en" ? "en-US" : "pt-BR");
    window.dispatchEvent(new Event(uiLocaleChangeEvent));
  }

  return (
    <LandingMotion>
      <header className="lp-header">
        <div className="lp-container lp-bar">
          <ClaraLogo href="/" size={34} suffix={c.suffix} />
          <nav className="lp-nav" aria-label="Page sections">
            <a href="#recursos">{c.nav.features}</a>
            <a href="#demonstracao">{c.nav.demo}</a>
            <a href="#implantacao">{c.nav.install}</a>
            <a href="#perguntas">{c.nav.faq}</a>
          </nav>
          <div className="lp-actions">
            <button
              type="button"
              className="button ghost"
              onClick={switchLanguage}
              aria-label={lang === "pt" ? "Switch to English" : "Mudar para Português"}
              title={lang === "pt" ? "Switch to English (US / EU / UK)" : "Mudar para Português (BR)"}
            >
              <Globe size={15} aria-hidden="true" />
              {lang === "pt" ? "EN" : "PT"}
            </button>
            <Link href="/clinica" className="button primary lp-nav-cta">
              {c.nav.cta} <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="lp-container lp-hero" aria-labelledby="lp-title">
          <div className="lp-hero-copy">
            <span className="lp-eyebrow" data-hero-stagger>
              <ShieldCheck size={14} aria-hidden="true" /> {c.hero.eyebrow}
            </span>
            <h1 id="lp-title" data-hero-stagger>
              {c.hero.titleStart}
              <em>{c.hero.titleEm}</em>
            </h1>
            <p data-hero-stagger>{c.hero.description}</p>
            <div className="lp-actions lp-hero-actions" data-hero-stagger>
              <a href="#demonstracao" className="button secondary">
                {c.hero.secondaryCta}
              </a>
            </div>
            <div className="lp-trust-row" data-hero-stagger>
              <span><LockKeyhole size={15} aria-hidden="true" /> {c.hero.trust1}</span>
              <span><Building2 size={15} aria-hidden="true" /> {c.hero.trust2}</span>
            </div>
          </div>

          <div className="lp-hero-visual" data-hero-visual>
            <Image
              src="/landing/clinic-team.webp"
              alt={c.hero.photoAlt}
              fill
              preload
              sizes="(max-width: 760px) 92vw, (max-width: 1200px) 50vw, 610px"
              className="lp-hero-photo"
            />
            <div className="lp-floating-card" data-hero-float>
              <span className="feature-icon"><CalendarDays size={20} aria-hidden="true" /></span>
              <div>
                <strong>{c.hero.floatTitle}</strong>
                <small>{c.hero.floatSub}</small>
              </div>
              <span className="lp-check-dot" aria-hidden="true"><Check size={15} /></span>
            </div>
          </div>
        </section>

        <section className="lp-quick" aria-label="Clara pillars" data-reveal-group>
          <div className="lp-container lp-quick-grid">
            <div data-reveal><CalendarDays size={19} aria-hidden="true" />{c.pillars[0]}</div>
            <div data-reveal><Wallet size={19} aria-hidden="true" />{c.pillars[1]}</div>
            <div data-reveal><LockKeyhole size={19} aria-hidden="true" />{c.pillars[2]}</div>
          </div>
        </section>

        <section className="lp-container lp-section" id="recursos" aria-labelledby="lp-feature-title" data-reveal-group>
          <div className="lp-heading" data-reveal>
            <span className="lp-eyebrow">{c.featuresSection.eyebrow}</span>
            <h2 id="lp-feature-title">{c.featuresSection.title}</h2>
            <p>{c.featuresSection.description}</p>
          </div>
          <div className="lp-feature-grid">
            {c.featuresSection.items.map(({ icon: Icon, tag, title, text }) => (
              <article className="lp-card" key={title} data-reveal>
                <div className="lp-card-top">
                  <span className="feature-icon"><Icon size={21} aria-hidden="true" /></span>
                  <span className="lp-tag">{tag}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-demo-section lp-section" id="demonstracao" aria-labelledby="lp-demo-title" data-reveal-group>
          <div className="lp-container lp-demo-grid">
            <div className="lp-heading" data-reveal>
              <span className="lp-eyebrow">{c.demoSection.eyebrow}</span>
              <h2 id="lp-demo-title">{c.demoSection.title}</h2>
              <p>{c.demoSection.description}</p>
              <div className="lp-actions" style={{ marginTop: "1.4rem" }}>
                <Link href="/clinica" className="button primary">
                  {c.demoSection.cta} <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>
            <div data-reveal>
              <LandingDemo lang={lang} />
            </div>
          </div>
        </section>

        <section className="lp-container lp-section lp-specialties" aria-labelledby="lp-specialties-title" data-reveal-group>
          <div className="lp-heading" data-reveal>
            <span className="lp-eyebrow">{c.specialtiesSection.eyebrow}</span>
            <h2 id="lp-specialties-title">{c.specialtiesSection.title}</h2>
          </div>
          <div className="lp-specialty-grid">
            {c.specialtiesSection.items.map(({ title, text }) => (
              <article key={title} className="lp-card" data-reveal>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-container lp-section lp-install" id="implantacao" aria-labelledby="lp-install-title" data-reveal-group>
          <div className="lp-heading" data-reveal>
            <span className="lp-eyebrow">{c.installSection.eyebrow}</span>
            <h2 id="lp-install-title">{c.installSection.title}</h2>
          </div>
          <ol className="lp-install-steps">
            {c.installSection.steps.map((step) => (
              <li className="lp-card" key={step.num} data-reveal>
                <span className="lp-step-num">{step.num}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-container lp-section lp-faq" id="perguntas" aria-labelledby="lp-faq-title" data-reveal-group>
          <div className="lp-heading" data-reveal>
            <span className="lp-eyebrow">{c.faqSection.eyebrow}</span>
            <h2 id="lp-faq-title">{c.faqSection.title}</h2>
          </div>
          <div className="lp-faq-list" data-reveal>
            {c.faqSection.items.map(({ title, text }) => (
              <details key={title}>
                <summary>
                  {title}
                  <ChevronDown size={18} aria-hidden="true" />
                </summary>
                <p>{text}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="lp-container lp-section-sm" data-reveal-group>
          <div className="lp-final" data-reveal>
            <div>
              <span className="lp-eyebrow">{c.finalCta.eyebrow}</span>
              <h2>{c.finalCta.title}</h2>
              <p>{c.finalCta.description}</p>
            </div>
            <Link href="/clinica" className="button primary">
              {c.finalCta.cta} <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="lp-container lp-footer">
        <ClaraLogo href="#inicio" size={30} ariaLabel="Back to top" />
        <nav aria-label="Footer links">
          <a href="#recursos">{c.footer.features}</a>
          <a href="#demonstracao">{c.footer.demo}</a>
          <a href="#perguntas">{c.footer.faq}</a>
          <Link href="/clinica">{c.footer.login}</Link>
        </nav>
      </footer>
    </LandingMotion>
  );
}
