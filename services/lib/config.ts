export function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function retentionEpoch(days = 7): number {
  return Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
}
