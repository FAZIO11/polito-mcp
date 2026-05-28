import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from '../logger.js';
import { loadConfig } from '../config.js';
import { PolitoApiError } from '../polito/client.js';
import { deleteUserCompletely } from '../db/users.js';
import {
  ToolAuthError,
  clientForUser,
  getPolitoAuthExtra,
  withPoliTo,
} from './auth-context.js';

/**
 * Helper that wraps a tool callback with consistent error handling and JSON
 * response formatting. The MCP convention is to return `isError: true` with
 * a textual content for tool-level errors, while protocol errors propagate.
 */
function makeJsonResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  };
}

function makeError(message: string, kind?: string) {
  const text = kind ? `[${kind}] ${message}` : message;
  return {
    isError: true,
    content: [{ type: 'text' as const, text }],
  };
}

function handleError(err: unknown, toolName: string) {
  if (err instanceof ToolAuthError) {
    if (err.code === 'not_authenticated') {
      if (err.sessionId) {
        const loginUrl = `${loadConfig().PUBLIC_ORIGIN}/connect?s=${err.sessionId}`;
        return {
          content: [{
            type: 'text' as const,
            text: `To use polito-mcp you need to connect your PoliTO account first.\n\nOpen this link in your browser, sign in with your PoliTO credentials, then come back here and ask again:\n\n${loginUrl}`,
          }],
        };
      }
      return makeError('Not authenticated. Please connect your PoliTO account.', 'not_authenticated');
    }
    if (err.code === 're_auth_required' || err.code === 'no_active_token') {
      return makeError(
        'Your PoliTO session has expired. Please re-authorize the polito-mcp connection in your MCP client.',
        're_auth_required',
      );
    }
  }
  if (err instanceof PolitoApiError) {
    logger.warn({ status: err.status, path: err.path }, `tool ${toolName} upstream error`);
    return makeError(
      `PoliTO API returned ${err.status}${err.politoMessage ? `: ${err.politoMessage}` : ''}`,
      'polito_error',
    );
  }
  logger.error({ err, toolName }, 'unexpected tool error');
  return makeError(err instanceof Error ? err.message : 'unknown error', 'internal');
}

/** Registers every v1 MCP tool against the given McpServer instance. */
export function registerTools(server: McpServer): void {
  // ---------- Profile ----------

  server.registerTool(
    'get_profile',
    {
      title: 'Get my PoliTO profile',
      description:
        'Returns the authenticated student profile: name, degree, current career, credits, averages, and on-time-exam points.',
      inputSchema: {},
    },
    async (_args, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getStudent());
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'get_profile');
      }
    },
  );

  // ---------- Grades ----------

  server.registerTool(
    'get_grades',
    {
      title: 'List exam grades',
      description: 'Lists all recorded exam grades for the authenticated student.',
      inputSchema: {},
    },
    async (_args, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getStudentGrades());
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'get_grades');
      }
    },
  );

  // ---------- Provisional grades ----------

  server.registerTool(
    'get_provisional_grades',
    {
      title: 'List provisional grades',
      description:
        'Lists provisional exam grades the student can still accept or reject, plus the available state codes.',
      inputSchema: {},
    },
    async (_args, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getProvisionalGrades());
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'get_provisional_grades');
      }
    },
  );

  server.registerTool(
    'accept_provisional_grade',
    {
      title: 'Accept a provisional grade',
      description: 'Accepts a provisional grade by id. Irreversible on PoliTO side.',
      inputSchema: {
        id: z.number().int().positive().describe('Provisional grade id (from get_provisional_grades).'),
      },
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    async ({ id }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        await withPoliTo(userId, (c) => c.acceptProvisionalGrade(id));
        return makeJsonResult({ accepted: true, id });
      } catch (err) {
        return handleError(err, 'accept_provisional_grade');
      }
    },
  );

  server.registerTool(
    'reject_provisional_grade',
    {
      title: 'Reject a provisional grade',
      description: 'Rejects a provisional grade by id. Irreversible on PoliTO side.',
      inputSchema: {
        id: z.number().int().positive().describe('Provisional grade id (from get_provisional_grades).'),
      },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ id }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        await withPoliTo(userId, (c) => c.rejectProvisionalGrade(id));
        return makeJsonResult({ rejected: true, id });
      } catch (err) {
        return handleError(err, 'reject_provisional_grade');
      }
    },
  );

  // ---------- Deadlines ----------

  server.registerTool(
    'list_deadlines',
    {
      title: 'List academic deadlines',
      description:
        'Lists academic and administrative deadlines. Both bounds are optional and default to 7 days before/after today.',
      inputSchema: {
        fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      },
    },
    async ({ fromDate, toDate }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getDeadlines(fromDate, toDate));
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'list_deadlines');
      }
    },
  );

  // ---------- Today’s lectures ----------

  server.registerTool(
    'list_today_lectures',
    {
      title: 'List today’s lectures',
      description:
        'Returns the lectures scheduled for the student today (UTC date), including time, place, and the related course.',
      inputSchema: {},
    },
    async (_args, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const today = new Date().toISOString().slice(0, 10);
        const data = await withPoliTo(userId, (c) => c.getMyLectures(today, today));
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'list_today_lectures');
      }
    },
  );

  // ---------- Courses ----------

  server.registerTool(
    'list_courses',
    {
      title: 'List enrolled courses',
      description: 'Lists all courses the student is currently enrolled in.',
      inputSchema: {},
    },
    async (_args, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getCourses());
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'list_courses');
      }
    },
  );

  server.registerTool(
    'get_course',
    {
      title: 'Get course details',
      description: 'Returns details for one course (info, instructors, notices, files).',
      inputSchema: {
        id: z.number().int().positive().describe('Course id (from list_courses).'),
      },
    },
    async ({ id }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getCourse(id));
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'get_course');
      }
    },
  );

  // ---------- Messages ----------

  server.registerTool(
    'list_messages',
    {
      title: 'List inbox messages',
      description: 'Lists messages from PoliTO (teachers, secretariat, exams, system events).',
      inputSchema: {},
    },
    async (_args, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getMessages());
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'list_messages');
      }
    },
  );

  server.registerTool(
    'mark_message_read',
    {
      title: 'Mark message as read',
      description: 'Marks a single message as read.',
      inputSchema: {
        id: z.number().int().positive().describe('Message id (from list_messages).'),
      },
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    async ({ id }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        await withPoliTo(userId, (c) => c.markMessageRead(id));
        return makeJsonResult({ markedRead: true, id });
      } catch (err) {
        return handleError(err, 'mark_message_read');
      }
    },
  );

  // ---------- Notifications ----------

  server.registerTool(
    'list_notifications',
    {
      title: 'List push notifications',
      description: 'Lists in-app/push notifications delivered to the student.',
      inputSchema: {},
    },
    async (_args, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getNotifications());
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'list_notifications');
      }
    },
  );

  // ---------- Exams & bookings ----------

  server.registerTool(
    'list_exams',
    {
      title: 'List exams',
      description: 'Lists exam appellations available to the student.',
      inputSchema: {},
    },
    async (_args, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getExams());
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'list_exams');
      }
    },
  );

  server.registerTool(
    'list_bookings',
    {
      title: 'List active bookings',
      description: 'Lists bookings the student has made (exams, lectures, library, etc.).',
      inputSchema: {},
    },
    async (_args, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getBookings());
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'list_bookings');
      }
    },
  );

  // ---------- Unread emails ----------

  server.registerTool(
    'get_unread_emails_count',
    {
      title: 'Get unread emails count',
      description: 'Returns the badge count for the student PoliTO webmail.',
      inputSchema: {},
    },
    async (_args, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getUnreadEmailsNumber());
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'get_unread_emails_count');
      }
    },
  );

  // ---------- Account control ----------

  server.registerTool(
    'delete_my_account',
    {
      title: 'Delete my polito-mcp account',
      description:
        'Revokes the upstream PoliTO bearer token and wipes all stored data for this account on this server.',
      inputSchema: {
        confirm: z.literal(true).describe('Set to true to confirm the irreversible deletion.'),
      },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    async ({ confirm }, extra) => {
      if (confirm !== true) {
        return makeError('Pass `confirm: true` to actually delete the account.', 'confirm_required');
      }
      try {
        const { userId } = getPolitoAuthExtra(extra);
        // Best-effort upstream logout before deleting the local token.
        try {
          const client = clientForUser(userId);
          await client.logout();
        } catch (err) {
          logger.warn({ err }, 'Upstream logout failed during account deletion');
        }
        deleteUserCompletely(userId);
        return makeJsonResult({ deleted: true });
      } catch (err) {
        return handleError(err, 'delete_my_account');
      }
    },
  );
}
