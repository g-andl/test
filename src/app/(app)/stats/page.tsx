"use client";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatsView } from "@/components/stats/StatsView";
import { MonthCard } from "@/components/stats/MonthCard";
import { Skeleton, ErrorState } from "@/components/ui/States";
import { useMyEntries } from "@/hooks/data";
import { useAuth } from "@/components/providers/AuthProvider";
import { humanError } from "@/lib/errors";

export default function StatsPage() {
  const { profile } = useAuth();
  const { entries, loading, error, refetch } = useMyEntries();
  return (
    <>
      <PageHeader eyebrow="Аналитика" title="Статистика" />
      {loading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-12" />
          <Skeleton className="h-44" />
          <Skeleton className="h-64" />
        </div>
      ) : error ? (
        <ErrorState text={humanError(error)} onRetry={refetch} />
      ) : (
        <StatsView entries={entries} extra={<MonthCard entries={entries} name={profile?.display_name ?? ""} />} />
      )}
    </>
  );
}
