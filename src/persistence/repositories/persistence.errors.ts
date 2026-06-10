export class DuplicateEntityError extends Error {
  constructor(message = "Entity already exists") {
    super(message);
    this.name = "DuplicateEntityError";
  }
}
