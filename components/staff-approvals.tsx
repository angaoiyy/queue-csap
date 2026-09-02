"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  Clock,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  setStaffStatus,
  type StaffActionResult,
  type StaffProfile,
} from "@/lib/actions/staff";
import type { StaffStatus } from "@/lib/offices";

type Props = { initialStaff: StaffProfile[] };

const STATUS_BADGE: Record<
  StaffStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "Pending",
    className:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  },
  approved: {
    label: "Approved",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  },
  rejected: {
    label: "Declined",
    className:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300",
  },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function StaffApprovals({ initialStaff }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const groups = useMemo(() => {
    const staff = [...initialStaff].filter((s) => s.role !== "super_admin");
    return {
      pending: staff.filter((s) => s.status === "pending"),
      approved: staff.filter((s) => s.status === "approved"),
      rejected: staff.filter((s) => s.status === "rejected"),
      superAdmin: initialStaff.find((s) => s.role === "super_admin") ?? null,
    };
  }, [initialStaff]);

  const run = (id: string, status: StaffStatus) => {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      let result: StaffActionResult;
      try {
        result = await setStaffStatus(id, status);
      } catch {
        result = { success: false, error: "Something went wrong. Try again." };
      }
      setPendingId(null);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const busy = (id: string) => isPending && pendingId === id;

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {groups.pending.length === 0
            ? "No accounts waiting for approval."
            : `${groups.pending.length} account${
                groups.pending.length === 1 ? "" : "s"
              } waiting for approval.`}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.refresh()}
          disabled={isPending}
        >
          <RefreshCw className={cn("size-4", isPending && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <Section
        icon={Clock}
        title="Pending"
        count={groups.pending.length}
        emptyLabel="Nothing pending."
      >
        {groups.pending.map((s) => (
          <StaffRow key={s.id} staff={s} busy={busy(s.id)}>
            <Button
              size="sm"
              onClick={() => run(s.id, "approved")}
              disabled={busy(s.id)}
            >
              <Check className="size-4" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => run(s.id, "rejected")}
              disabled={busy(s.id)}
            >
              <X className="size-4" />
              Decline
            </Button>
          </StaffRow>
        ))}
      </Section>

      <Section
        icon={UserCheck}
        title="Approved"
        count={groups.approved.length}
        emptyLabel="No approved staff yet."
      >
        {groups.approved.map((s) => (
          <StaffRow key={s.id} staff={s} busy={busy(s.id)}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => run(s.id, "pending")}
              disabled={busy(s.id)}
            >
              <UserX className="size-4" />
              Revoke access
            </Button>
          </StaffRow>
        ))}
      </Section>

      {groups.rejected.length > 0 && (
        <Section
          icon={UserX}
          title="Declined"
          count={groups.rejected.length}
          emptyLabel=""
        >
          {groups.rejected.map((s) => (
            <StaffRow key={s.id} staff={s} busy={busy(s.id)}>
              <Button
                size="sm"
                variant="outline"
                onClick={() => run(s.id, "approved")}
                disabled={busy(s.id)}
              >
                <Check className="size-4" />
                Approve
              </Button>
            </StaffRow>
          ))}
        </Section>
      )}

      {groups.superAdmin && (
        <Card className="flex items-center gap-3 p-4 text-sm">
          <ShieldCheck className="size-5 text-primary" />
          <div>
            <p className="font-medium">
              {groups.superAdmin.email ?? "Super admin"}
            </p>
            <p className="text-muted-foreground">
              Super admin — approves and manages all staff accounts.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  count,
  emptyLabel,
  children,
}: {
  icon: typeof Clock;
  title: string;
  count: number;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-muted-foreground" />
        {title}
        <span className="text-muted-foreground">({count})</span>
      </div>
      {count === 0 ? (
        emptyLabel ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : null
      ) : (
        <div className="flex flex-col gap-2">{children}</div>
      )}
    </div>
  );
}

function StaffRow({
  staff,
  busy,
  children,
}: {
  staff: StaffProfile;
  busy: boolean;
  children: React.ReactNode;
}) {
  const badge = STATUS_BADGE[staff.status];
  return (
    <Card
      className={cn(
        "flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between",
        busy && "opacity-60"
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">
            {staff.email ?? "Unknown email"}
          </span>
          <Badge variant="outline" className={cn("gap-1", badge.className)}>
            {badge.label}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {staff.officeLabel ?? "No office"} • signed up{" "}
          {formatDate(staff.created_at)}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">{children}</div>
    </Card>
  );
}
