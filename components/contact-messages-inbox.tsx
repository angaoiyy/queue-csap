"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ChevronDown,
  Inbox,
  Mail,
  MailOpen,
  Phone,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  deleteContactMessage,
  setContactMessageRead,
  type ContactActionResult,
  type ContactMessage,
} from "@/lib/actions/contact";

type Props = { messages: ContactMessage[] };

type Filter = "all" | "unread" | "read";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ContactMessagesInbox({ messages }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const counts = useMemo(() => {
    const unread = messages.filter((m) => !m.is_read).length;
    return { all: messages.length, unread, read: messages.length - unread };
  }, [messages]);

  const visible = useMemo(
    () =>
      messages.filter(
        (m) =>
          filter === "all" || (filter === "unread" ? !m.is_read : m.is_read)
      ),
    [messages, filter]
  );

  const run = (id: string, action: () => Promise<ContactActionResult>) => {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      let result: ContactActionResult;
      try {
        result = await action();
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

  const toggleExpanded = (message: ContactMessage) => {
    const opening = expandedId !== message.id;
    setExpandedId(opening ? message.id : null);
    if (opening && !message.is_read) {
      run(message.id, () => setContactMessageRead(message.id, true));
    }
  };

  const remove = (message: ContactMessage) => {
    const name = `${message.first_name} ${message.last_name}`;
    if (!window.confirm(`Delete the message from ${name}? This cannot be undone.`)) {
      return;
    }
    if (expandedId === message.id) setExpandedId(null);
    run(message.id, () => deleteContactMessage(message.id));
  };

  const busy = (id: string) => isPending && pendingId === id;

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map(({ value, label }) => (
            <Button
              key={value}
              size="sm"
              variant={filter === value ? "default" : "outline"}
              onClick={() => setFilter(value)}
            >
              {label} ({counts[value]})
            </Button>
          ))}
        </div>
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

      <p className="-mt-3 text-sm text-muted-foreground">
        {counts.unread === 0
          ? "No unread messages."
          : `${counts.unread} unread message${counts.unread === 1 ? "" : "s"}.`}
      </p>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <Inbox className="size-6" />
          <p>
            {messages.length === 0
              ? "No messages yet."
              : `No ${filter} messages.`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((m) => {
            const open = expandedId === m.id;
            return (
              <Card
                key={m.id}
                className={cn(
                  "flex flex-col gap-3 p-4",
                  !m.is_read && "border-primary/40",
                  busy(m.id) && "opacity-60"
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleExpanded(m)}
                  aria-expanded={open}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "truncate",
                          m.is_read ? "font-medium" : "font-semibold"
                        )}
                      >
                        {m.first_name} {m.last_name}
                      </span>
                      {!m.is_read && (
                        <Badge
                          variant="outline"
                          className="border-primary/30 bg-primary/10 text-primary"
                        >
                          New
                        </Badge>
                      )}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDateTime(m.created_at)}
                    </span>
                    <span
                      className={cn(
                        "mt-2 block whitespace-pre-wrap break-words text-sm text-muted-foreground",
                        !open && "line-clamp-2"
                      )}
                    >
                      {m.message}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
                      open && "rotate-180"
                    )}
                  />
                </button>

                <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-sm">
                    {m.email && (
                      <a
                        href={`mailto:${m.email}`}
                        className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground hover:text-primary hover:underline"
                      >
                        <Mail className="size-4 shrink-0" />
                        <span className="truncate">{m.email}</span>
                      </a>
                    )}
                    {m.phone && (
                      <a
                        href={`tel:${m.phone.replace(/[^\d+]/g, "")}`}
                        className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary hover:underline"
                      >
                        <Phone className="size-4 shrink-0" />
                        {m.phone}
                      </a>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        run(m.id, () => setContactMessageRead(m.id, !m.is_read))
                      }
                      disabled={busy(m.id)}
                    >
                      {m.is_read ? (
                        <>
                          <Mail className="size-4" />
                          Mark unread
                        </>
                      ) : (
                        <>
                          <MailOpen className="size-4" />
                          Mark read
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => remove(m)}
                      disabled={busy(m.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
