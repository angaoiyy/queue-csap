export function parseVideoEmbedUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "");

  const youtubeParams = "autoplay=1&mute=1&playsinline=1";
  const vimeoParams = "autoplay=1&muted=1";

  if (host === "youtube.com" || host === "m.youtube.com") {
    const watchId = parsed.searchParams.get("v");
    if (watchId) return `https://www.youtube.com/embed/${watchId}?${youtubeParams}`;

    const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/]+)/);
    if (shortsMatch)
      return `https://www.youtube.com/embed/${shortsMatch[1]}?${youtubeParams}`;

    const embedMatch = parsed.pathname.match(/^\/embed\/([^/]+)/);
    if (embedMatch)
      return `https://www.youtube.com/embed/${embedMatch[1]}?${youtubeParams}`;

    return null;
  }

  if (host === "youtu.be") {
    const id = parsed.pathname.slice(1);
    return id ? `https://www.youtube.com/embed/${id}?${youtubeParams}` : null;
  }

  if (host === "vimeo.com") {
    const idMatch = parsed.pathname.match(/^\/(\d+)/);
    return idMatch
      ? `https://player.vimeo.com/video/${idMatch[1]}?${vimeoParams}`
      : null;
  }

  return null;
}
