export type ActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  /** echo of submitted values so forms keep input after a validation error */
  values?: Record<string, string>;
} | null;
