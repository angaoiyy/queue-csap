"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { setOfficeRequiresClaimRequest } from "@/lib/actions/office-settings";

type Props = {
  officeSlug: string;
  initialRequiresClaimRequest: boolean;
};

export function BookingFormEditor({
  officeSlug,
  initialRequiresClaimRequest,
}: Props) {
  const [requiresClaimRequest, setRequiresClaimRequest] = useState(
    initialRequiresClaimRequest
  );
  const [isToggling, setIsToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async (checked: boolean) => {
    setIsToggling(true);
    setError(null);
    const previous = requiresClaimRequest;
    setRequiresClaimRequest(checked);
    const result = await setOfficeRequiresClaimRequest(officeSlug, checked);
    if (!result.success) {
      setRequiresClaimRequest(previous);
      setError(result.error);
    }
    setIsToggling(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-semibold">Booking Form</h3>
        <p className="text-sm text-muted-foreground">
          Extra fields shown on the public queue reservation form.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="requires_claim_request" className="text-sm font-normal">
            Ask &ldquo;Claim or Request?&rdquo;
          </Label>
          <Switch
            id="requires_claim_request"
            checked={requiresClaimRequest}
            onCheckedChange={(checked) => handleToggle(checked)}
            disabled={isToggling}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          When on, students must pick whether they are here to <b>Claim</b> a
          finished document or <b>Request</b> a new one. The choice is printed on
          the ticket and shown in the admin queue.
        </p>
      </div>
    </div>
  );
}
