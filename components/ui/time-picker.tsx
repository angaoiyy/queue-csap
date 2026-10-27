"use client";

type TimePickerProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
};

// Native selects stay inside the modal's focus boundary and work with touch,
// keyboard navigation, and a parent fieldset's disabled state.
export function TimePicker({ id, label, value, onChange }: TimePickerProps) {
  const [hours, minutes] = (value || "08:00").split(":").map(Number);
  const hour = String(hours % 12 || 12).padStart(2, "0");
  const minute = String(minutes).padStart(2, "0");
  const meridiem = hours >= 12 ? "PM" : "AM";
  const selectClass = "h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed";

  function update(nextHour: string, nextMinute: string, nextMeridiem: string) {
    const hour24 = Number(nextHour) % 12 + (nextMeridiem === "PM" ? 12 : 0);
    onChange(`${String(hour24).padStart(2, "0")}:${nextMinute}`);
  }

  return (
    <fieldset className="min-w-0 space-y-1">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-[1fr_auto_1fr_1.1fr] items-center gap-1.5">
        <label className="sr-only" htmlFor={`${id}-hour`}>{label} hour</label>
        <select id={`${id}-hour`} className={selectClass} value={hour}
          onChange={(event) => update(event.target.value, minute, meridiem)}>
          {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")).map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <span aria-hidden="true" className="text-muted-foreground">:</span>
        <label className="sr-only" htmlFor={`${id}-minute`}>{label} minute</label>
        <select id={`${id}-minute`} className={selectClass} value={minute}
          onChange={(event) => update(hour, event.target.value, meridiem)}>
          {Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0")).map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <label className="sr-only" htmlFor={`${id}-meridiem`}>{label} AM or PM</label>
        <select id={`${id}-meridiem`} className={selectClass} value={meridiem}
          onChange={(event) => update(hour, minute, event.target.value)}>
          <option value="AM">AM</option><option value="PM">PM</option>
        </select>
      </div>
    </fieldset>
  );
}
