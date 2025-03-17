export const extractTokenFromHeaders = (req: any): string => {
  return req.headers["authorization"]?.replace("Bearer ", "");
};
