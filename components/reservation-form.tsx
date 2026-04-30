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
import {
  INQUIRY_TYPES,
  DEPARTMENTS,
  DEGREE_PROGRAMS,
  TERMS_SCHOOL_YEAR,
  MINUTES_PER_SLOT,
} from "@/lib/constants";

export function ReservationForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateReservationInput>({
    student_name: "",
    student_id: "",
    department: "",
    degree_program: "",
    term_school_year: "",
    inquiry_type: "",
  });

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
          inquiryType: r.inquiry_type,
          window: r.window_name ?? "",
          position: String(r.position),
          wait: String(estimatedMinutes),
        });
        setFormData({
          student_name: "",
          student_id: "",
          department: "",
          degree_program: "",
          term_school_year: "",
          inquiry_type: "",
        });
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
            />
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
            />
          </div>

          <div className="grid gap-2">
            <Label>Department</Label>
            <Select
              required
              value={formData.department}
              onValueChange={(v) =>
                setFormData((prev) => ({
                  ...prev,
                  department: v,
                  degree_program: v === "Baccalaureate-College" ? prev.degree_program : "",
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formData.department === "Baccalaureate-College" && (
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
                  {DEGREE_PROGRAMS.map((program) => (
                    <SelectItem key={program} value={program}>
                      {program}
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
                {TERMS_SCHOOL_YEAR.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
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
                {INQUIRY_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
