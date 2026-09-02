"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  email: string;
  officeSlug: string | null;
  officeLabel: string | null;
  role?: "staff" | "super_admin";
};

export function UserNavDropdown({
  email,
  officeSlug,
  officeLabel,
  role = "staff",
}: Props) {
  const router = useRouter();
  const initials = email.slice(0, 2).toUpperCase();
  const base = officeSlug ? `/dashboard/${officeSlug}` : "/dashboard";

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full border border-primary-foreground/30"
        >
          <span className="sr-only">Open user menu</span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/15 text-xs font-semibold">
            {initials || <User className="h-4 w-4" />}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        {officeLabel && (
          <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
            {officeLabel}
          </DropdownMenuLabel>
        )}
        <DropdownMenuSeparator />
        {role === "super_admin" && (
          <DropdownMenuItem asChild>
            <Link href="/dashboard/staff">Staff Approvals</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href={`${base}/admin`}>Admin Panel</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`${base}/activity-logs`}>Activity Logs</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`${base}/settings`}>Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout}>Logout</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
