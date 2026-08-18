declare module "qz-tray" {
  type PrintData = Array<{
    type: string;
    format: string;
    flavor: string;
    data: string;
  }>;

  const qz: {
    security: {
      setSignatureAlgorithm: (algorithm: string) => void;
      setSignaturePromise: (
        promiser: (toSign: string) => (
          resolve: (value?: string) => void,
          reject: (reason?: unknown) => void,
        ) => void,
      ) => void;
    };
    websocket: {
      connect: (options?: Record<string, unknown>) => Promise<void>;
      disconnect: () => Promise<void>;
      isActive: () => boolean;
    };
    printers: {
      find: (query?: string) => Promise<string | string[]>;
      getDefault: () => Promise<string>;
    };
    configs: {
      create: (printer: string, options?: Record<string, unknown>) => unknown;
    };
    print: (config: unknown, data: PrintData) => Promise<void>;
  };

  export default qz;
}
