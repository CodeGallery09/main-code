import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";

export function AuthField({
  label,
  htmlFor,
  error,
  errorId,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  errorId: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13.5px] font-medium text-ink">
        {label}
      </label>
      {children}
      {error && (
        <p id={errorId} className="field-error mt-1.5 flex items-center gap-1.5 text-[12.5px] text-alert">
          <AlertCircle size={13} aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
