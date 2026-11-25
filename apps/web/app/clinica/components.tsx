"use client";

import { ReminderQueue } from "./reminders";
import { CalendarDays, CircleAlert, ClipboardList, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  api, ApiError, dateKey, displayCell, errorMessage, formPayload, getResourceConfig, initialValue, resources,
  type Organization, type Resource, type Row,
} from "./data";

export function useLoad<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        setError("");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(error));
      });
    return () => controller.abort();
  }, [load, version]);

  return { data, error, reload: () => setVersion((current) => current + 1) };
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="error-text" role="alert"><CircleAlert size={17} />{children}</p>;
}

export function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="panel load-error"><ErrorText>{message}</ErrorText><button className="button secondary" onClick={retry}><RefreshCw size={16} /> Tentar novamente</button></div>;
}

export function Loading({ label = "Carregando…" }: { label?: string }) {
  return <div className="loading" role="status"><span className="spinner" />{label}</div>;
}

export function Empty({ children, calendar = false }: { children: ReactNode; calendar?: boolean }) {
  const Icon = calendar ? CalendarDays : ClipboardList;
  return <div className="empty"><span className="feature-icon"><Icon size={21} /></span><p>{children}</p></div>;
}

export function PageHeading({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="heading-actions">{actions}</div>}</div>;
}

export function Dialog({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} aria-labelledby="dialog-title">
      <div className="dialog-head"><h2 id="dialog-title">{title}</h2><button className="icon-button" onClick={onClose} disabled={busy} aria-label="Fechar"><X size={20} /></button></div>
      {children}
    </dialog>
  );
}

export function Status({ status, children }: { status: string; children: ReactNode }) {
  const tone = ["ACTIVE", "CONFIRMED", "COMPLETED", "DONE", "WON", "BOOKED"].includes(status) ? "good" : ["CANCELLED", "LOST", "SUSPENDED"].includes(status) ? "bad" : "neutral";
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Records({
  resource, organization, canWrite, autoCreate = false, onNotice,
}: {
  resource: Resource; organization: Organization; canWrite: boolean; autoCreate?: boolean; onNotice: (notice: string) => void;
}) {
  const isEn = organization.locale === "en-US";
  const config = getResourceConfig(resource, organization.locale);
  const root = `/organizations/${organization.id}`;
  const path = `${root}/${resource}`;
  const [editor, setEditor] = useState<Row | "new" | undefined>(autoCreate && canWrite ? "new" : undefined);
  const [remove, setRemove] = useState<Row>();
  const [search, setSearch] = useState("");
  const today = dateKey(new Date(), organization.timezone);
  const [day, setDay] = useState(resource === "appointments" ? today : "");
  const [pending, setPending] = useState(false);
  const [mutationError, setMutationError] = useState("");

  const load = useCallback(async (signal: AbortSignal) => {
    const relations = [...new Set(resources[resource].fields.flatMap(({ relation }) => relation ? [relation] : []))];
    const [rows, ...lists] = await Promise.all([api<Row[]>(path, "GET", undefined, signal), ...relations.map((key) => api<Row[]>(`${root}/${key}`, "GET", undefined, signal))]);
    return { rows, related: Object.fromEntries(relations.map((key, index) => [key, lists[index]])) as Partial<Record<Resource, Row[]>> };
  }, [path, resource, root]);
  const { data, error, reload } = useLoad(load);
  const related = data?.related ?? {};
  const fields = config.columns.map((key) => config.fields.find((field) => field.key === key)!);
  const locale = organization.locale ?? "pt-BR";
  const query = search.trim().toLocaleLowerCase(locale);
  const shown = (data?.rows ?? []).filter((row) =>
    (!day || dateKey(String(row.startAt), organization.timezone) === day) &&
    (!query || fields.some((field) => displayCell(row, field, related, organization.timezone, organization.currency, locale).toLocaleLowerCase(locale).includes(query))),
  );
  if (resource === "appointments") shown.sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));

  function open(next: Row | "new") {
    setMutationError("");
    setEditor(next);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setMutationError("");
    try {
      const body = formPayload(config.fields, form, organization.timezone, organization.locale ?? "pt-BR");
      await api(editor === "new" ? path : `${path}/${editor.id}`, editor === "new" ? "POST" : "PATCH", body);
      if (typeof body.startAt === "string") setDay(dateKey(body.startAt, organization.timezone));
      setEditor(undefined);
      onNotice(editor === "new" ? "Cadastro criado." : "Alterações salvas.");
      reload();
    } catch (error) {
      setMutationError(error instanceof ApiError ? error.message : error instanceof Error ? error.message : errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function deleteRow() {
    if (!remove || pending) return;
    setPending(true);
    setMutationError("");
    try {
      await api(`${path}/${remove.id}`, "DELETE");
      setRemove(undefined);
      onNotice("Cadastro removido.");
      reload();
    } catch (error) {
      setMutationError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  const missing = config.fields.filter((field) => field.required && field.relation && !related[field.relation]?.length);
  const row = editor === "new" ? undefined : editor;

  return <>
    {resource === "appointments" && canWrite && <ReminderQueue organization={organization}/>}
    <section className="panel records" aria-label={config.title}>
      <div className="panel-heading records-heading"><h2>{config.title}</h2>
        {canWrite && <button className="button primary" onClick={() => open("new")}><Plus size={17} />{config.add}</button>}
      </div>
      <div className="record-tools">
        <label className="search-field"><Search size={17} /><input type="search" placeholder={isEn ? "Search" : "Pesquisar"} aria-label={isEn ? `Search ${config.title.toLowerCase()}` : `Pesquisar em ${config.title.toLocaleLowerCase("pt-BR")}`} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        {resource === "appointments" && <div className="date-tools"><input aria-label={isEn ? "Schedule date" : "Data da agenda"} type="date" value={day} onChange={(event) => setDay(event.target.value)} /><button className="button secondary" onClick={() => setDay(day ? "" : today)}>{day ? (isEn ? "All dates" : "Todas as datas") : (isEn ? "Today" : "Hoje")}</button></div>}
      </div>
      {error ? <LoadError message={error} retry={reload} /> : !data ? <Loading label={isEn ? "Loading…" : "Carregando…"} /> : shown.length === 0 ? <Empty calendar={resource === "appointments"}>{query || (day && data.rows.length) ? (isEn ? "No results for the selected filters." : "Nenhum resultado para os filtros selecionados.") : config.empty}</Empty> :
        <div className="table-scroll"><table><thead><tr>{fields.map((field) => <th key={field.key} scope="col">{field.label}</th>)}{resource === "contacts" && <th scope="col">{isEn ? "Campaigns" : "Campanhas"}</th>}{canWrite && <th scope="col" className="table-actions">{isEn ? "Actions" : "Ações"}</th>}</tr></thead>
          <tbody>{shown.map((entry) => <tr key={entry.id}>
            {fields.map((field) => { const content = displayCell(entry, field, related, organization.timezone, organization.currency, organization.locale); return <td key={field.key}>{field.options ? <Status status={String(entry[field.key])}>{content}</Status> : content}</td>; })}
            {resource === "contacts" && <td>{entry.marketingRevokedAt ? "Revogada" : entry.marketingConsentAt ? <>Autorizadas {canWrite && <button className="button ghost" onClick={async()=>{
              try {await api(path+"/"+entry.id+"/revoke-marketing","POST",{});reload();onNotice("Autorização revogada.");}
              catch(e){onNotice(errorMessage(e));}
            }}>Revogar</button>}</> : "Sem autorização"}</td>}
            {canWrite && <td className="table-actions"><button className="icon-button" onClick={() => open(entry)} aria-label={`Editar ${config.singular}`}><Pencil size={16}/></button><button className="icon-button danger-icon" onClick={() => { setMutationError(""); setRemove(entry); }} aria-label={`Excluir ${config.singular}`}><Trash2 size={16}/></button></td>}
          </tr>)}</tbody>
        </table></div>}
    </section>
    {editor && <Dialog title={editor === "new" ? config.add : `Editar ${config.singular}`} onClose={() => setEditor(undefined)} busy={pending}>
      {!data ? error ? <LoadError message={error} retry={reload} /> : <Loading /> :
        <form className="form-stack" onSubmit={save}>
          {missing.length > 0 && <p className="form-hint">Cadastre primeiro os itens em {missing.map((field) => resources[field.relation!].title.toLocaleLowerCase("pt-BR")).join(", ")}.</p>}
          {config.fields.map((field) => {
            const options = field.relation ? Object.fromEntries((related[field.relation] ?? []).map(({ id, name }) => [id, String(name)])) : field.options;
            const inputType = field.type === "money" ? "number" : field.type ?? "text";
            const value = initialValue(field, row, organization.timezone);
            return <label key={field.key} className="form-field"><span>{field.label}{field.required && <span className="required"> *</span>}</span>
              {options ? <select name={field.key} defaultValue={value} required={field.required}><option value="">Selecione</option>{Object.entries(options).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select> :
                <input name={field.key} type={inputType} min={field.min} step={field.type === "money" ? "0.01" : undefined} defaultValue={value} required={field.required} />}
            </label>;
          })}
          {config.fields.some((field) => field.type === "datetime-local") && <p className="form-hint">Fuso da clínica: {organization.timezone}</p>}
          {mutationError && <ErrorText>{mutationError}</ErrorText>}
          <div className="dialog-actions"><button type="button" className="button secondary" disabled={pending} onClick={() => setEditor(undefined)}>Cancelar</button><button className="button primary" disabled={pending || missing.length > 0}>{pending ? "Salvando…" : "Salvar"}</button></div>
        </form>}
    </Dialog>}
    {remove && <Dialog title={`Excluir ${config.singular}`} busy={pending} onClose={() => setRemove(undefined)}>
      <p className="confirm-copy">Confirme a exclusão deste registro.</p>
      {mutationError && <ErrorText>{mutationError}</ErrorText>}
      <div className="dialog-actions"><button className="button secondary" disabled={pending} onClick={() => setRemove(undefined)}>Cancelar</button><button className="button danger" disabled={pending} onClick={deleteRow}>{pending ? "Excluindo…" : "Excluir"}</button></div>
    </Dialog>}
  </>;
}
