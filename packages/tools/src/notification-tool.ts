import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getUserId } from './context';
import { notificationSchema } from './schemas';
import type { CseToolDeps } from './types';

export function createNotificationTool({ notifier }: CseToolDeps) {
  return createTool({
    id: 'notification',
    description:
      "Send a notification to the current user's dashboard, e.g. when a watchlist price alert triggers. " +
      'Only send notifications the user asked for or that come from a triggered alert.',
    inputSchema: z.object({
      title: z.string().min(1).max(120),
      message: z.string().min(1).max(1000),
      symbol: z.string().optional(),
    }),
    outputSchema: notificationSchema,
    execute: async (input, context) => notifier.notify({ ...input, userId: getUserId(context) }),
  });
}
