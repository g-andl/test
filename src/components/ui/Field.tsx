"use client";
import { forwardRef, useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, className = "", type, ...rest },
  ref,
) {
  const id = useId();
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-text-2">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={isPassword && show ? "text" : type}
          aria-invalid={!!error || undefined}
          aria-describedby={error || hint ? `${id}-d` : undefined}
          className={`h-13 w-full rounded-2xl border bg-surface-2 px-4 text-base text-text outline-none transition placeholder:text-muted focus:border-accent focus:bg-surface ${error ? "border-danger" : "border-transparent"} ${isPassword ? "pr-12" : ""}`}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-1 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-xl text-muted"
            aria-label={show ? "Скрыть пароль" : "Показать пароль"}
          >
            {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        )}
      </div>
      {(error || hint) && (
        <p id={`${id}-d`} className={`mt-1.5 text-[13px] ${error ? "text-danger" : "text-muted"}`}>
          {error || hint}
        </p>
      )}
    </div>
  );
});

export function TextArea({
  label,
  className = "",
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-text-2">
        {label}
      </label>
      <textarea
        id={id}
        className="min-h-24 w-full resize-none rounded-2xl border border-transparent bg-surface-2 px-4 py-3 text-base text-text outline-none transition placeholder:text-muted focus:border-accent focus:bg-surface"
        {...rest}
      />
    </div>
  );
}
