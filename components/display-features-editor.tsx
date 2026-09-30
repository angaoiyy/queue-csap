"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  setDisplayAudioEnabled,
  setDisplayLunchBreak,
  setDisplayVideoEnabled,
  type DisplaySettings,
} from "@/lib/actions/display-settings";

type Props = {
  officeSlug: string;
  initialSettings: DisplaySettings;
};

export function DisplayFeaturesEditor({ officeSlug, initialSettings }: Props) {
  const [audioEnabled, setAudioEnabled] = useState(initialSettings.audioEnabled);
  const [videoEnabled, setVideoEnabled] = useState(initialSettings.isEnabled);
  const [isTogglingAudio, setIsTogglingAudio] = useState(false);
  const [isTogglingVideo, setIsTogglingVideo] = useState(false);
  const [lunchEnabled, setLunchEnabled] = useState(
    initialSettings.lunchBreakEnabled
  );
  const [lunchStart, setLunchStart] = useState(initialSettings.lunchBreakStart);
  const [lunchEnd, setLunchEnd] = useState(initialSettings.lunchBreakEnd);
  const [isSavingLunch, setIsSavingLunch] = useState(false);
  const [lunchError, setLunchError] = useState<string | null>(null);
  const [lunchSaved, setLunchSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggleAudio = async (checked: boolean) => {
    setIsTogglingAudio(true);
    setError(null);
    const previous = audioEnabled;
    setAudioEnabled(checked);
    const result = await setDisplayAudioEnabled(officeSlug, checked);
    if (!result.success) {
      setAudioEnabled(previous);
      setError(result.error);
    }
    setIsTogglingAudio(false);
  };

  const handleToggleVideo = async (checked: boolean) => {
    setIsTogglingVideo(true);
    setError(null);
    const previous = videoEnabled;
    setVideoEnabled(checked);
    const result = await setDisplayVideoEnabled(officeSlug, checked);
    if (!result.success) {
      setVideoEnabled(previous);
      setError(result.error);
    }
    setIsTogglingVideo(false);
  };

  const saveLunchBreak = async (enabled: boolean) => {
    setIsSavingLunch(true);
    setLunchError(null);
    setLunchSaved(false);
    const previous = lunchEnabled;
    setLunchEnabled(enabled);
    const result = await setDisplayLunchBreak(
      officeSlug,
      enabled,
      lunchStart,
      lunchEnd
    );
    if (!result.success) {
      setLunchEnabled(previous);
      setLunchError(result.error);
    } else {
      setLunchSaved(true);
    }
    setIsSavingLunch(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-semibold">Display Screen</h3>
        <p className="text-sm text-muted-foreground">
          Turn features on the public queue display on or off.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="audio_enabled" className="text-sm font-normal">
            Announce ticket number aloud
          </Label>
          <Switch
            id="audio_enabled"
            checked={audioEnabled}
            onCheckedChange={(checked) => handleToggleAudio(checked)}
            disabled={isTogglingAudio}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          When off, the display never speaks the queue number when a ticket is called.
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="video_display_section_enabled" className="text-sm font-normal">
            Show video section on display
          </Label>
          <Switch
            id="video_display_section_enabled"
            checked={videoEnabled}
            onCheckedChange={(checked) => handleToggleVideo(checked)}
            disabled={isTogglingVideo}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          When off, the video sidebar is hidden and the queue takes the full screen. Set the video link in the Admin Panel.
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="lunch_break_enabled" className="text-sm font-normal">
            Show lunch break screen automatically
          </Label>
          <Switch
            id="lunch_break_enabled"
            checked={lunchEnabled}
            onCheckedChange={(checked) => saveLunchBreak(checked)}
            disabled={isSavingLunch}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="lunch_break_start" className="text-sm font-normal">
              Starts
            </Label>
            <Input
              id="lunch_break_start"
              type="time"
              value={lunchStart}
              onChange={(e) => {
                setLunchStart(e.target.value);
                setLunchSaved(false);
              }}
              className="w-36"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lunch_break_end" className="text-sm font-normal">
              Ends
            </Label>
            <Input
              id="lunch_break_end"
              type="time"
              value={lunchEnd}
              onChange={(e) => {
                setLunchEnd(e.target.value);
                setLunchSaved(false);
              }}
              className="w-36"
            />
          </div>
          <Button
            type="button"
            onClick={() => saveLunchBreak(lunchEnabled)}
            disabled={isSavingLunch}
          >
            {isSavingLunch ? "Saving..." : "Save"}
          </Button>
        </div>
        {lunchError && <p className="text-sm text-destructive">{lunchError}</p>}
        {lunchSaved && !lunchError && (
          <p className="text-sm text-muted-foreground">Saved.</p>
        )}
        <p className="text-sm text-muted-foreground">
          Between these times the display replaces the queue with a lunch break notice, then switches back on its own. Uses the clock of the device showing the display.
        </p>
      </div>
    </div>
  );
}
