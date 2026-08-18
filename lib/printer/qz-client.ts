let configured = false;

async function getQz() {
  const qz = (await import("qz-tray")).default;
  if (!configured) {
    qz.security.setSignatureAlgorithm("SHA512");
    qz.security.setSignaturePromise(() => (resolve: (value?: string) => void) => resolve());
    configured = true;
  }
  return qz;
}

export async function printEscPosBase64(
  printerName: string,
  base64Data: string,
): Promise<void> {
  const qz = await getQz();
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect();
  }
  const config = qz.configs.create(printerName);
  await qz.print(config, [
    { type: "raw", format: "command", flavor: "base64", data: base64Data },
  ]);
}
