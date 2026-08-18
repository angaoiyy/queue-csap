"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SettingsListEditor } from "@/components/settings-list-editor";
import { DisplayFeaturesEditor } from "@/components/display-features-editor";
import type { SettingsItem } from "@/lib/actions/settings";
import type { DisplaySettings } from "@/lib/actions/display-settings";

type Props = {
  schoolYears: SettingsItem[];
  departments: SettingsItem[];
  inquiryTypes: SettingsItem[];
  degreePrograms: SettingsItem[];
  purposeOptions: SettingsItem[];
  displaySettings: DisplaySettings;
};

const SECTIONS = [
  { key: "school_years", label: "School Year" },
  { key: "departments", label: "Departments" },
  { key: "inquiry_types", label: "Type of Inquiry" },
  { key: "degree_programs", label: "Degree Programs" },
  { key: "purpose_of_request_options", label: "Purpose of Request" },
  { key: "display", label: "Display Screen" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

export function SettingsPanel({
  schoolYears,
  departments,
  inquiryTypes,
  degreePrograms,
  purposeOptions,
  displaySettings,
}: Props) {
  const [activeSection, setActiveSection] = useState<SectionKey>("school_years");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((section) => (
          <Button
            key={section.key}
            type="button"
            variant={activeSection === section.key ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveSection(section.key)}
          >
            {section.label}
          </Button>
        ))}
      </div>

      {activeSection === "school_years" && (
        <SettingsListEditor
          table="school_years"
          title="School Year / Term"
          description="Terms shown on the booking form, e.g. '1st Sem AY 2025-2026'."
          initialItems={schoolYears}
        />
      )}

      {activeSection === "departments" && (
        <SettingsListEditor
          table="departments"
          title="Departments"
          description="Departments students can select. Mark a department if it should prompt for a degree program."
          initialItems={departments}
          extraFields={[
            {
              key: "requires_degree_program",
              label: "Requires degree program",
              type: "checkbox",
            },
          ]}
        />
      )}

      {activeSection === "inquiry_types" && (
        <SettingsListEditor
          table="inquiry_types"
          title="Type of Inquiry"
          description="Inquiry types and their queue-number prefix (e.g. COE001). Mark one if it should prompt for a purpose of request."
          initialItems={inquiryTypes}
          extraFields={[
            { key: "prefix", label: "Queue prefix (e.g. COE)", type: "text" },
            {
              key: "requires_purpose",
              label: "Requires purpose of request",
              type: "checkbox",
            },
          ]}
        />
      )}

      {activeSection === "degree_programs" && (
        <SettingsListEditor
          table="degree_programs"
          title="Degree Programs"
          description="Shown when the selected department requires a degree program."
          initialItems={degreePrograms}
        />
      )}

      {activeSection === "purpose_of_request_options" && (
        <SettingsListEditor
          table="purpose_of_request_options"
          title="Purpose of Request"
          description="Shown when the selected inquiry type requires a purpose of request."
          initialItems={purposeOptions}
        />
      )}

      {activeSection === "display" && (
        <DisplayFeaturesEditor initialSettings={displaySettings} />
      )}
    </div>
  );
}
