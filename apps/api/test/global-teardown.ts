export default async function globalTeardown(): Promise<void> {
  await (globalThis as any).__HORAH_PG__?.parar();
}
