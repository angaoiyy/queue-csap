"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  setDisplayAudioEnabled,
  setDisplayVideoEnabled,
  type DisplaySettings,
} from "@/lib/actions/display-settings";

type Props = {
  initialSettings: DisplaySettings;
};

export function DisplayFeaturesEditor({ initialSettings }: Props) {
  const [audioEnabled, setAudioEnabled] = useState(initialSettings.audioEnabled);
  const [videoEnabled, setVideoEnabled] = useState(initialSettings.isEnabled);
  const [isTogglingAudio, setIsTogglingAudio] = useState(false);
  const [isTogglingVideo, setIsTogglingVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggleAudio = async (checked: boolean) => {
    setIsTogglingAudio(true);
    setError(null);
    const previous = audioEnabled;
    setAudioEnabled(checked);
    const result = await setDisplayAudioEnabled(checked);
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
    const result = await setDisplayVideoEnabled(checked);
    if (!result.success) {
      setVideoEnabled(previous);
      setError(result.error);
    }
    setIsTogglingVideo(false);
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
    </div>
  );
}
