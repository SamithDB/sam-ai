import { ANONYMOUS_USER_ID, USER_ID_CONTEXT_KEY } from './types';

type ContextLike = { requestContext?: { get(key: string): unknown } };

/** Reads the caller's user id from the Mastra request context set by the host. */
export function getUserId(context: ContextLike | undefined): string {
  const value = context?.requestContext?.get(USER_ID_CONTEXT_KEY);
  return typeof value === 'string' && value.trim() ? value : ANONYMOUS_USER_ID;
}
