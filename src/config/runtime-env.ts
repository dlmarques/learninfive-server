export const getRuntimeEnv = (name: string) => {
  return globalThis.process?.env?.[name];
};
