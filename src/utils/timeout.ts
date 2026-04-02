export async function withTimeout<T>(
  factory: Promise<T>,
  timeoutMs: number,
  errorFactory: () => Error
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      factory,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(errorFactory()), timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}
