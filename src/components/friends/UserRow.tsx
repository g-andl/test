import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { StatusBadge } from "@/components/badges/StatusBadge";

/** Строка пользователя: аватар, имя, подпись, действия справа */
export function UserRow({
  user,
  sub,
  right,
  href,
}: {
  user: { id?: string; username: string; display_name: string; avatar_url: string | null; is_admin?: boolean };
  sub?: React.ReactNode;
  right?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <Avatar src={user.avatar_url} name={user.display_name} size={48} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-bold">{user.display_name}</span>
          <StatusBadge userId={user.id} isAdmin={user.is_admin} />
        </span>
        <span className="block truncate text-[13px] text-muted">{sub ?? `@${user.username}`}</span>
      </span>
    </>
  );
  return (
    <div className="flex items-center gap-3 rounded-[20px] bg-surface p-3 shadow-card">
      {href ? (
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-3">
          {body}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}
