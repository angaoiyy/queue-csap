"use client";

import { useRef, useState } from "react";
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
  lookupStudent,
  type CreateReservationInput,
} from "@/lib/actions/reservation";
import type { SettingsItem } from "@/lib/actions/settings";
import { PRIORITY_TYPES, MINUTES_PER_SLOT } from "@/lib/constants";

type ReservationFormProps = {
  departments: SettingsItem[];
  degreePrograms: SettingsItem[];
  termsSchoolYear: SettingsItem[];
  inquiryTypes: SettingsItem[];
  purposeOptions: SettingsItem[];
};

export function ReservationForm({
  departments,
  degreePrograms,
  termsSchoolYear,
  inquiryTypes,
  purposeOptions,
}: ReservationFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasAutofilled, setWasAutofilled] = useState(false);
  const [formData, setFormData] = useState<CreateReservationInput>({
    student_name: "",
    student_id: "",
    department: "",
    degree_program: "",
    term_school_year: "",
    inquiry_type: "",
    purpose_of_request: "",
    priority_type: "",
  });
  const [purposeSelection, setPurposeSelection] = useState("");
  const [purposeOther, setPurposeOther] = useState("");
  const [isPriority, setIsPriority] = useState(false);
  const touchedRef = useRef<Set<"department" | "degree_program">>(new Set());
  const lookupSeq = useRef(0);

  const runLookup = async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    const seq = ++lookupSeq.current;
    setIsLookingUp(true);
    try {
      const result = await lookupStudent(trimmed);
      if (!result || seq !== lookupSeq.current) return;
      setFormData((prev) => {
        const next = {
          ...prev,
          student_name: result.student_name,
          student_id: result.student_id,
        };
        if (!touchedRef.current.has("department")) {
          next.department = result.department;
        }
        if (!touchedRef.current.has("degree_program")) {
          const dept = departments.find((d) => d.label === next.department);
          next.degree_program = dept?.requires_degree_program
            ? result.degree_program ?? ""
            : "";
        }
        return next;
      });
      setWasAutofilled(true);
    } finally {
      if (seq === lookupSeq.current) setIsLookingUp(false);
    }
  };

  const handleLookupKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    runLookup(e.currentTarget.value);
  };

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
          studentId: r.student_id,
          department: r.department,
          inquiryType: r.inquiry_type,
          window: r.window_name ?? "",
          position: String(r.position),
          wait: String(estimatedMinutes),
          date: r.created_at,
          ...(result.printError ? { printError: result.printError } : {}),
        });
        setFormData({
          student_name: "",
          student_id: "",
          department: "",
          degree_program: "",
          term_school_year: "",
          inquiry_type: "",
          purpose_of_request: "",
          priority_type: "",
        });
        setPurposeSelection("");
        setPurposeOther("");
        setIsPriority(false);
        touchedRef.current = new Set();
        lookupSeq.current += 1;
        setWasAutofilled(false);
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
        <CardTitle>Reserve Queue Number</CardTitle>
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
              onKeyDown={handleLookupKeyDown}
            />
            <p className="text-xs text-muted-foreground">
              Press Enter to autofill from a previous reservation
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="student_id">Student ID</Label>
            <Input
              id="student_id"
              placeholder="2024-00123"
              required
              value={formData.student_id}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, student_id: e.target.value }))
              }
              onKeyDown={handleLookupKeyDown}
            />
          </div>

          <div className="grid gap-2">
            <Label>Department</Label>
            <Select
              required
              value={formData.department}
              onValueChange={(v) => {
                touchedRef.current.add("department");
                const dept = departments.find((d) => d.label === v);
                setFormData((prev) => ({
                  ...prev,
                  department: v,
                  degree_program: dept?.requires_degree_program ? prev.degree_program : "",
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
            {wasAutofilled && (
              <p className="text-xs text-muted-foreground">
                Auto-filled from a previous reservation
              </p>
            )}
          </div>

          {departments.find((d) => d.label === formData.department)
            ?.requires_degree_program && (
            <div className="grid gap-2">
              <Label>Degree Program</Label>
              <Select
                required
                value={formData.degree_program}
                onValueChange={(v) => {
                  touchedRef.current.add("degree_program");
                  setFormData((prev) => ({ ...prev, degree_program: v }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select degree program" />
                </SelectTrigger>
                <SelectContent>
                  {degreePrograms.map((program) => (
                    <SelectItem key={program.id} value={program.label}>
                      {program.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
              onValueChange={(v) => {
                setPurposeSelection("");
                setPurposeOther("");
                setFormData((prev) => ({
                  ...prev,
                  inquiry_type: v,
                  purpose_of_request: "",
                }));
              }}
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

          {inquiryTypes.find((type) => type.label === formData.inquiry_type)
            ?.requires_purpose && (
            <div className="grid gap-2">
              <Label>Purpose of Request</Label>
              <Select
                required
                value={purposeSelection}
                onValueChange={(v) => {
                  setPurposeSelection(v);
                  if (v === "Others") {
                    setFormData((prev) => ({
                      ...prev,
                      purpose_of_request: purposeOther,
                    }));
                  } else {
                    setPurposeOther("");
                    setFormData((prev) => ({ ...prev, purpose_of_request: v }));
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select purpose" />
                </SelectTrigger>
                <SelectContent>
                  {purposeOptions.map((option) => (
                    <SelectItem key={option.id} value={option.label}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {purposeSelection === "Others" && (
                <Input
                  placeholder="Please specify"
                  required
                  value={purposeOther}
                  onChange={(e) => {
                    setPurposeOther(e.target.value);
                    setFormData((prev) => ({
                      ...prev,
                      purpose_of_request: e.target.value,
                    }));
                  }}
                />
              )}
            </div>
          )}

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

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Reserving..." : "Reserve Queue Number"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
