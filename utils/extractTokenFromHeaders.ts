export const extractTokenFromHeaders = (req: any): string | null => {
  return req.headers["authorization"]
    ? req.headers["authorization"]?.replace("Bearer ", "")
    : null;
};
