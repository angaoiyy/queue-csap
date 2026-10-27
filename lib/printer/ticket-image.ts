// Browser-side ticket renderer. Reproduces what lib/printer/ticket.ts makes the
// printer draw with its built-in font (ESC/POS Font A, 12x24 dots) as a 1-bit
// bitmap at the printer's native 384 dots (48mm @ 203dpi, 8 dots/mm).

export type TicketImageData = {
  queueNumber: string;
  studentName: string;
  claimOrRequest: string;
  windowName: string;
};

export type TicketImage = {
  url: string;
  heightMm: number;
};

export const TICKET_WIDTH_MM = 48;
const DOTS_PER_MM = 8;
const WIDTH_DOTS = TICKET_WIDTH_MM * DOTS_PER_MM;

const CELL_WIDTH = 12;
const CELL_HEIGHT = 24;
const CHARS_PER_LINE = WIDTH_DOTS / CELL_WIDTH;
// ESC/POS default line spacing is 1/6 inch.
const LINE_SPACING = 34;
// setTextSize(4, w) in ticket.ts sets GS ! to 5x width, 4x height.
const BIG_SCALE_X = 5;
const BIG_SCALE_Y = 4;
const BIG_CHARS_PER_LINE = Math.floor(CHARS_PER_LINE / BIG_SCALE_X);
// node-thermal-printer's drawLine() emits 48 dashes; the printer wraps them
// into a full line plus a 16-dash line.
const DRAWLINE_DASHES = 48;
const TOP_PADDING = 8;
const BOTTOM_PADDING = LINE_SPACING;

// Lucida Console has Font A's plain (unslashed) zero.
const FONT_FAMILY = '"Lucida Console", Consolas, "Courier New", monospace';
// Font A glyphs are taller than a monospace font at the same advance width.
const GLYPH_STRETCH_Y = 1.25;
const GLYPH_BASELINE = 19;
const INK_THRESHOLD = 160;

type Line = {
  text: string;
  align: "left" | "center";
  emphasized?: boolean;
  big?: boolean;
};

function wrapWords(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    while (current.length > maxChars) {
      lines.push(current.slice(0, maxChars));
      current = current.slice(maxChars);
    }
  }
  if (current) lines.push(current);
  return lines;
}

// The printer itself wraps at the column limit, mid-word.
function wrapHard(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    lines.push(text.slice(i, i + maxChars));
  }
  return lines;
}

function buildLines(data: TicketImageData): Line[] {
  const drawLine = (align: Line["align"]) =>
    wrapHard("-".repeat(DRAWLINE_DASHES), CHARS_PER_LINE).map(
      (text): Line => ({ text, align }),
    );
  const left = (text: string) =>
    wrapWords(text, CHARS_PER_LINE).map((t): Line => ({ text: t, align: "left" }));

  const match = data.queueNumber.match(/^([A-Za-z]+)(\d+)$/);
  const numberParts = match ? [match[1], match[2]] : [data.queueNumber];

  return [
    { text: "CSAP QUEUE TICKET", align: "center", emphasized: true },
    ...drawLine("center"),
    ...numberParts
      .flatMap((part) => wrapHard(part, BIG_CHARS_PER_LINE))
      .map((t): Line => ({ text: t, align: "center", big: true })),
    ...left(`Name: ${data.studentName}`),
    ...(data.claimOrRequest ? left(`Transaction: ${data.claimOrRequest}`) : []),
    ...left(`Window: ${data.windowName || "To be announced"}`),
    ...drawLine("left"),
    ...wrapWords("Please wait for your number to be called.", CHARS_PER_LINE).map(
      (t): Line => ({ text: t, align: "center" }),
    ),
  ];
}

// Draws text at Font A's 12x24 cell size and snaps it to black/white, so that
// magnifying it later stays blocky like the printer's own scaled font.
function renderCells(text: string, emphasized: boolean): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, text.length * CELL_WIDTH);
  canvas.height = CELL_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.font = `bold 100px ${FONT_FAMILY}`;
  const size = (100 * CELL_WIDTH) / ctx.measureText("0").width;
  ctx.font = `bold ${size}px ${FONT_FAMILY}`;
  ctx.fillStyle = "#000";
  ctx.textBaseline = "alphabetic";
  ctx.scale(1, GLYPH_STRETCH_Y);
  const baseline = GLYPH_BASELINE / GLYPH_STRETCH_Y;
  // ESC E (emphasized) prints each dot column twice, one dot to the right.
  for (let i = 0; i < text.length; i++) {
    const x = i * CELL_WIDTH;
    ctx.fillText(text[i], x, baseline);
    if (emphasized) ctx.fillText(text[i], x + 1, baseline);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = image.data;
  for (let i = 0; i < px.length; i += 4) {
    const ink = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114 < INK_THRESHOLD;
    px[i] = px[i + 1] = px[i + 2] = ink ? 0 : 255;
    px[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export function renderTicketImage(data: TicketImageData): TicketImage {
  const lines = buildLines(data);
  const pitch = (line: Line) => (line.big ? CELL_HEIGHT * BIG_SCALE_Y : LINE_SPACING);
  const height =
    TOP_PADDING + lines.reduce((sum, l) => sum + pitch(l), 0) + BOTTOM_PADDING;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH_DOTS;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  let y = TOP_PADDING;
  for (const line of lines) {
    const cells = renderCells(line.text, !!line.emphasized);
    const scaleX = line.big ? BIG_SCALE_X : 1;
    const scaleY = line.big ? BIG_SCALE_Y : 1;
    const width = cells.width * scaleX;
    const x = line.align === "center" ? Math.floor((WIDTH_DOTS - width) / 2) : 0;
    ctx.drawImage(cells, x, y, width, cells.height * scaleY);
    y += pitch(line);
  }

  return { url: canvas.toDataURL("image/png"), heightMm: height / DOTS_PER_MM };
}
