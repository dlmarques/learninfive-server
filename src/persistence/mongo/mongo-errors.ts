export const MONGO_DUPLICATE_KEY_CODE = 11000;

export const isDuplicateKeyError = (error: unknown) => {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === MONGO_DUPLICATE_KEY_CODE
  );
};
