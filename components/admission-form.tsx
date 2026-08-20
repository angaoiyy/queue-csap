"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createReservation,
  type CreateReservationInput,
} from "@/lib/actions/reservation";
import type { SettingsItem } from "@/lib/actions/settings";
import { PRIORITY_TYPES, MINUTES_PER_SLOT } from "@/lib/constants";

type AdmissionFormProps = {
  departments: SettingsItem[];
  degreePrograms: SettingsItem[];
  termsSchoolYear: SettingsItem[];
  inquiryTypes: SettingsItem[];
};

const INITIAL_FORM_DATA: CreateReservationInput = {
  application_type: "new",
  student_name: "",
  department: "",
  degree_program: "",
  term_school_year: "",
  inquiry_type: "",
  priority_type: "",
};

export function AdmissionForm({
  departments,
  degreePrograms,
  termsSchoolYear,
  inquiryTypes,
}: AdmissionFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateReservationInput>(INITIAL_FORM_DATA);
  const [isPriority, setIsPriority] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError(null);
    setIsLoading(true);
    try {
      const result = await createReservation(formData);

      if (result.success) {
        const r = result.reservation;
        const estimatedMinutes = (r.position - 1) * MINUTES_PER_SLOT;
        const params = new URLSearchParams({
          queue: r.queue_number,
          name: r.student_name,
          department: r.department,
          inquiryType: r.inquiry_type,
          window: r.window_name ?? "",
          position: String(r.position),
          wait: String(estimatedMinutes),
          date: r.created_at,
          ...(result.printError ? { printError: result.printError } : {}),
        });
        setFormData(INITIAL_FORM_DATA);
        setIsPriority(false);
        router.push(`/reserve/confirmation?${params.toString()}`);
      } else {
        setError(result.error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>New Student Admission</CardTitle>
        <CardDescription>
          Fill in your details to get a priority number for the selected
          inquiry type.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="grid gap-2">
            <Label htmlFor="student_name">Student Name</Label>
            <Input
              id="student_name"
              placeholder="Juan Dela Cruz"
              required
              value={formData.student_name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, student_name: e.target.value }))
              }
            />
          </div>

          <div className="grid gap-2">
            <Label>Department</Label>
            <Select
              required
              value={formData.department}
              onValueChange={(v) => {
                setFormData((prev) => ({
                  ...prev,
                  department: v,
                  degree_program: "",
                }));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.label}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(() => {
            const selectedDept = departments.find((d) => d.label === formData.department);
            if (!selectedDept?.requires_degree_program) return null;
            return (
              <div className="grid gap-2">
                <Label>Degree Program</Label>
                <Select
                  required
                  value={formData.degree_program}
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, degree_program: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select degree program" />
                  </SelectTrigger>
                  <SelectContent>
                    {degreePrograms
                      .filter((program) => program.department_id === selectedDept.id)
                      .map((program) => (
                        <SelectItem key={program.id} value={program.label}>
                          {program.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })()}

          <div className="grid gap-2">
            <Label>Terms / School Year</Label>
            <Select
              required
              value={formData.term_school_year}
              onValueChange={(v) =>
                setFormData((prev) => ({ ...prev, term_school_year: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select term" />
              </SelectTrigger>
              <SelectContent>
                {termsSchoolYear.map((t) => (
                  <SelectItem key={t.id} value={t.label}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Type of Inquiry</Label>
            <Select
              required
              value={formData.inquiry_type}
              onValueChange={(v) =>
                setFormData((prev) => ({ ...prev, inquiry_type: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select inquiry type" />
              </SelectTrigger>
              <SelectContent>
                {inquiryTypes.map((type) => (
                  <SelectItem key={type.id} value={type.label}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="is_priority"
              checked={isPriority}
              onCheckedChange={(checked) => {
                const next = checked === true;
                setIsPriority(next);
                if (!next) {
                  setFormData((prev) => ({ ...prev, priority_type: "" }));
                }
              }}
            />
            <Label htmlFor="is_priority" className="font-normal">
              Are you a PWD, pregnant, or senior citizen?
            </Label>
          </div>

          {isPriority && (
            <div className="grid gap-2">
              <Label>Which one applies to you?</Label>
              <Select
                required
                value={formData.priority_type}
                onValueChange={(v) =>
                  setFormData((prev) => ({ ...prev, priority_type: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select priority type" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Reserving..." : "Reserve Queue Number"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
