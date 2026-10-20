/** Labelled form field. Server-safe: pass the field error (already translated) in `error`. */
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

interface Base { label: ReactNode; hint?: ReactNode; error?: string | null; name: string; id?: string; affix?: ReactNode }

function wrap(id: string, { label, hint, error }: Base, control: ReactNode) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {control}
      {hint && !error && <span className="hint" id={`${id}-hint`}>{hint}</span>}
      {error && <span className="err" id={`${id}-err`} role="alert">{error}</span>}
    </div>
  );
}
const aria = (id: string, b: Base) => ({
  "aria-invalid": b.error ? (true as const) : undefined,
  "aria-describedby": b.error ? `${id}-err` : b.hint ? `${id}-hint` : undefined,
});

export function Input(props: Base & Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "id">) {
  const { label, hint, error, name, id: idProp, affix, className = "", ...rest } = props;
  const id = idProp ?? `f-${name}`;
  const input = <input id={id} name={name} className={`input ${className}`} {...aria(id, props)} {...rest} />;
  return wrap(id, { label, hint, error, name }, affix ? <div className="input-affix"><span className="affix" aria-hidden="true">{affix}</span>{input}</div> : input);
}

export function Select(props: Base & Omit<SelectHTMLAttributes<HTMLSelectElement>, "name" | "id"> & { children: ReactNode }) {
  const { label, hint, error, name, id: idProp, className = "", children, ...rest } = props;
  const id = idProp ?? `f-${name}`;
  return wrap(id, { label, hint, error, name }, <select id={id} name={name} className={`select ${className}`} {...aria(id, props)} {...rest}>{children}</select>);
}

export function Textarea(props: Base & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "name" | "id">) {
  const { label, hint, error, name, id: idProp, className = "", ...rest } = props;
  const id = idProp ?? `f-${name}`;
  return wrap(id, { label, hint, error, name }, <textarea id={id} name={name} className={`textarea ${className}`} {...aria(id, props)} {...rest} />);
}
