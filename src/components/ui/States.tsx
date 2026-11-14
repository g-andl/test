import { Loader2, AlertTriangle } from "lucide-react";

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 className={`size-6 animate-spin text-muted ${className}`} aria-label="Загрузка" />;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-surface-3/80 ${className}`} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && (
        <div className="mb-4 flex size-16 items-center justify-center rounded-[22px] bg-accent-soft text-accent [&_svg]:size-7">
          {icon}
        </div>
      )}
      <p className="text-[17px] font-bold">{title}</p>
      {text && <p className="mt-1 max-w-xs text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-8 text-center">
      <div className="mb-3 flex size-14 items-center justify-center rounded-[20px] bg-danger-soft text-danger">
        <AlertTriangle className="size-6" />
      </div>
      <p className="text-sm text-text-2">{text}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-4 h-11 rounded-xl bg-surface-2 px-5 text-sm font-semibold">
          Повторить
        </button>
      )}
    </div>
  );
}
