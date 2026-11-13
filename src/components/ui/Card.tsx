export function Card({
  className = "",
  children,
  as: Tag = "section",
  ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "article" }) {
  return (
    <Tag className={`rounded-[24px] bg-surface p-5 shadow-card ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function CardTitle({ children, action, className = "" }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={`mb-4 flex items-center justify-between gap-3 ${className}`}>
      <h2 className="text-[17px] font-bold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}
