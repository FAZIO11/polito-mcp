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
 * Generic output schema shared by every tool.  The outer { result } wrapper
 * lets the SDK validate the shape without us needing a Zod schema per tool.
 */
const RESULT_SCHEMA = { result: z.unknown() };

function makeJsonResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: { result: value } as Record<string, unknown>,
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
  // Network-level failure (Node fetch throws TypeError when the host is
  // unreachable or the connection is reset before an HTTP response arrives).
  if (
    err instanceof TypeError &&
    (err.message.toLowerCase().includes('fetch') ||
      err.message.toLowerCase().includes('network') ||
      err.message.toLowerCase().includes('connect'))
  ) {
    return makeError(
      'Network error: could not reach the PoliTO API. Check your connection and try again.',
      'network_error',
    );
  }
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
  // ---------- Current time (no auth needed) ----------

  server.registerTool(
    'get_current_datetime',
    {
      title: 'Get current date and time',
      description:
        'Returns the current UTC date and time as an ISO string. Call this before any time-sensitive query such as "free rooms in 2 hours", "lectures this afternoon", or "upcoming deadlines this week".',
      inputSchema: {},
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => {
      return makeJsonResult({ utc: new Date().toISOString() });
    },
  );

  // ---------- Profile ----------

  server.registerTool(
    'get_profile',
    {
      title: 'Get my PoliTO profile',
      description:
        'Returns the authenticated student profile: name, degree, current career, credits, averages, and on-time-exam points.',
      inputSchema: {},
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
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
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
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
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
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
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: true },
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
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true, idempotentHint: true },
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
        fromDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('Start date filter in YYYY-MM-DD format (inclusive). Defaults to 7 days before today.'),
        toDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('End date filter in YYYY-MM-DD format (inclusive). Defaults to 7 days after today.'),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
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

  // ---------- Today's lectures ----------

  server.registerTool(
    'list_today_lectures',
    {
      title: 'List today\'s lectures',
      description:
        'Returns the lectures scheduled for the student today (UTC date), including time, place, and the related course.',
      inputSchema: {},
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
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
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
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
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
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
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
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
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: true },
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
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
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
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
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
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
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
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
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

  // ---------- Course content ----------

  server.registerTool(
    'list_course_notices',
    {
      title: 'List course notices',
      description: 'Returns notices/announcements posted by the professor for a specific course.',
      inputSchema: {
        courseId: z.number().int().positive().describe('Course id (from list_courses).'),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ courseId }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getCourseNotices(courseId));
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'list_course_notices');
      }
    },
  );

  server.registerTool(
    'list_course_files',
    {
      title: 'List course files',
      description:
        'Returns the file/folder tree for a course. Directories contain nested files. Each file includes a download URL.',
      inputSchema: {
        courseId: z.number().int().positive().describe('Course id (from list_courses).'),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ courseId }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getCourseFiles(courseId));
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'list_course_files');
      }
    },
  );

  server.registerTool(
    'list_course_videolectures',
    {
      title: 'List course video lectures',
      description:
        'Returns recorded video lectures for a course, including title, duration, and streaming URL.',
      inputSchema: {
        courseId: z.number().int().positive().describe('Course id (from list_courses).'),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ courseId }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getCourseVideolectures(courseId));
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'list_course_videolectures');
      }
    },
  );

  server.registerTool(
    'list_course_virtual_classrooms',
    {
      title: 'List virtual classroom sessions',
      description:
        'Returns virtual classroom recordings or live sessions for a course. Pass live=true to get only ongoing live sessions.',
      inputSchema: {
        courseId: z.number().int().positive().describe('Course id (from list_courses).'),
        live: z
          .boolean()
          .optional()
          .describe('If true, return only currently-live sessions. Omit to return all.'),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ courseId, live }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getCourseVirtualClassrooms(courseId, live));
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'list_course_virtual_classrooms');
      }
    },
  );

  server.registerTool(
    'list_course_assignments',
    {
      title: 'List submitted assignments',
      description: 'Lists assignments (elaborati) the student has submitted for a course.',
      inputSchema: {
        courseId: z.number().int().positive().describe('Course id (from list_courses).'),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ courseId }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getCourseAssignments(courseId));
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'list_course_assignments');
      }
    },
  );

  server.registerTool(
    'get_next_lecture',
    {
      title: 'Get next upcoming lecture',
      description: 'Returns the next scheduled lecture for a specific course.',
      inputSchema: {
        courseId: z.number().int().positive().describe('Course id (from list_courses).'),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ courseId }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getNextLecture(courseId));
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'get_next_lecture');
      }
    },
  );

  server.registerTool(
    'list_lectures',
    {
      title: 'List lectures in date range',
      description:
        'Returns all lectures in a date range. Defaults to 7 days before/after today if omitted.',
      inputSchema: {
        fromDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('Start date YYYY-MM-DD (inclusive).'),
        toDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('End date YYYY-MM-DD (inclusive).'),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ fromDate, toDate }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getMyLectures(fromDate, toDate));
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'list_lectures');
      }
    },
  );

  // ---------- Exam booking ----------

  server.registerTool(
    'book_exam',
    {
      title: 'Book an exam',
      description:
        'Books an exam session for the student. Get the exam id and courseShortcode from list_exams.',
      inputSchema: {
        examId: z.number().int().positive().describe('Exam id (from list_exams).'),
        courseShortcode: z.string().describe('Course shortcode, e.g. "01UDROV".'),
        questionId: z
          .number()
          .int()
          .optional()
          .describe('Id of the selected question option if the exam requires one.'),
        questionOption: z.number().int().optional().describe('Selected option index.'),
        requestReason: z
          .string()
          .optional()
          .describe('Reason string for requestable exams.'),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false },
    },
    async ({ examId, courseShortcode, questionId, questionOption, requestReason }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        await withPoliTo(userId, (c) =>
          c.bookExam(examId, { courseShortcode, questionId, questionOption, requestReason }),
        );
        return makeJsonResult({ booked: true, examId });
      } catch (err) {
        return handleError(err, 'book_exam');
      }
    },
  );

  server.registerTool(
    'cancel_exam_booking',
    {
      title: 'Cancel an exam booking',
      description: 'Cancels the student\'s booking for an exam session.',
      inputSchema: {
        examId: z.number().int().positive().describe('Exam id (from list_exams).'),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true, idempotentHint: true },
    },
    async ({ examId }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        await withPoliTo(userId, (c) => c.cancelExamBooking(examId));
        return makeJsonResult({ cancelled: true, examId });
      } catch (err) {
        return handleError(err, 'cancel_exam_booking');
      }
    },
  );

  // ---------- Announcements ----------

  server.registerTool(
    'list_announcements',
    {
      title: 'List app announcements',
      description: 'Lists in-app announcements from PoliTO (onboarding tips, app news).',
      inputSchema: {
        onlyNew: z
          .boolean()
          .optional()
          .describe('If true, return only unseen announcements.'),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ onlyNew }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) =>
          c.getAnnouncements(onlyNew !== undefined ? { new: onlyNew } : undefined),
        );
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'list_announcements');
      }
    },
  );

  // ---------- News ----------

  server.registerTool(
    'list_news',
    {
      title: 'List university news',
      description: 'Lists recent news items and events published by Politecnico di Torino.',
      inputSchema: {},
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async (_args, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getNews());
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'list_news');
      }
    },
  );

  server.registerTool(
    'get_news_item',
    {
      title: 'Get full news article',
      description: 'Returns the full HTML content and attachments for a news item.',
      inputSchema: {
        id: z.number().positive().describe('News item id (from list_news).'),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ id }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getNewsItem(id));
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'get_news_item');
      }
    },
  );

  // ---------- Job offers ----------

  server.registerTool(
    'list_job_offers',
    {
      title: 'List internship and job offers',
      description:
        'Lists job/internship offers posted on the PoliTO career portal. AI can filter by location, contract type, or keyword.',
      inputSchema: {},
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async (_args, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getJobOffers());
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'list_job_offers');
      }
    },
  );

  server.registerTool(
    'get_job_offer',
    {
      title: 'Get job offer details',
      description: 'Returns full details for a specific job/internship offer.',
      inputSchema: {
        id: z.number().positive().describe('Job offer id (from list_job_offers).'),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ id }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getJobOffer(id));
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'get_job_offer');
      }
    },
  );

  // ---------- People ----------

  server.registerTool(
    'search_people',
    {
      title: 'Search professors and staff',
      description:
        'Searches for professors or staff by name. Returns id, role, and picture. Use get_person for contact details.',
      inputSchema: {
        search: z.string().min(2).describe('Name fragment to search for (minimum 2 characters).'),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ search }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.searchPeople(search));
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'search_people');
      }
    },
  );

  server.registerTool(
    'get_person',
    {
      title: 'Get professor or staff profile',
      description:
        'Returns full profile for a person: email, phone numbers, department, office URL, and courses taught.',
      inputSchema: {
        id: z.number().positive().describe('Person id (from search_people).'),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ id }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getPerson(id));
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'get_person');
      }
    },
  );

  // ---------- Campus / places ----------

  server.registerTool(
    'list_sites',
    {
      title: 'List campus sites',
      description: 'Lists PoliTO campus sites (e.g. main campus, Cittadella) with coordinates.',
      inputSchema: {},
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async (_args, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getSites());
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'list_sites');
      }
    },
  );

  server.registerTool(
    'list_free_rooms',
    {
      title: 'Find free rooms at a campus',
      description:
        'Lists classrooms/labs that are free at a given site within the requested time window. Get siteId from list_sites.',
      inputSchema: {
        siteId: z.string().describe('Site id from list_sites, e.g. "TO_CIT".'),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Date in YYYY-MM-DD format.'),
        timeFrom: z.string().regex(/^\d{2}:\d{2}$/).describe('Start time in HH:MM format, e.g. "09:00".'),
        timeTo: z.string().regex(/^\d{2}:\d{2}$/).describe('End time in HH:MM format, e.g. "11:00".'),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ siteId, date, timeFrom, timeTo }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getFreeRooms(siteId, date, timeFrom, timeTo));
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'list_free_rooms');
      }
    },
  );

  server.registerTool(
    'search_places',
    {
      title: 'Search rooms and buildings',
      description:
        'Searches for rooms, labs, or buildings by name. Can filter by category (e.g. AULA), site, building, or floor.',
      inputSchema: {
        search: z.string().optional().describe('Text fragment to match against place name.'),
        placeCategoryId: z
          .string()
          .optional()
          .describe('Category filter, e.g. "AULA" for classrooms.'),
        siteId: z.string().optional().describe('Limit to a specific campus site.'),
        buildingId: z.string().optional().describe('Limit to a specific building.'),
        floorId: z.string().optional().describe('Limit to a specific floor.'),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ search, placeCategoryId, siteId, buildingId, floorId }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) =>
          c.searchPlaces({ search, placeCategoryId, siteId, buildingId, floorId }),
        );
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'search_places');
      }
    },
  );

  server.registerTool(
    'get_place',
    {
      title: 'Get place details',
      description:
        'Returns full details for a room or building: capacity, floor, resources (projector, whiteboard, etc.).',
      inputSchema: {
        placeId: z.string().describe('Place id (from search_places).'),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ placeId }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getPlace(placeId));
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'get_place');
      }
    },
  );

  // ---------- Course statistics ----------

  server.registerTool(
    'get_course_statistics',
    {
      title: 'Get course pass-rate statistics',
      description:
        'Returns grade distribution, pass/fail counts, and average grade for a course. Useful for difficulty assessment.',
      inputSchema: {
        courseShortcode: z
          .string()
          .describe('Course shortcode, e.g. "01UDROV". Use list_courses to find it.'),
        year: z
          .string()
          .optional()
          .describe('Academic year, e.g. "2024". Defaults to the most recent.'),
        teacherId: z
          .string()
          .optional()
          .describe('Filter by a specific teacher id.'),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ courseShortcode, year, teacherId }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) =>
          c.getCourseStatistics(courseShortcode, { year, teacherId }),
        );
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'get_course_statistics');
      }
    },
  );

  // ---------- Surveys ----------

  server.registerTool(
    'list_surveys',
    {
      title: 'List pending surveys',
      description:
        'Lists teaching-quality surveys assigned to the student, with completion status and deadlines.',
      inputSchema: {},
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async (_args, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getSurveys());
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'list_surveys');
      }
    },
  );

  // ---------- Tickets ----------

  server.registerTool(
    'list_tickets',
    {
      title: 'List support tickets',
      description: 'Lists the student\'s support tickets to the university secretariat.',
      inputSchema: {},
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async (_args, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getTickets());
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'list_tickets');
      }
    },
  );

  server.registerTool(
    'get_ticket',
    {
      title: 'Get ticket with replies',
      description: 'Returns a full support ticket including all agent and student replies.',
      inputSchema: {
        id: z.number().int().positive().describe('Ticket id (from list_tickets).'),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ id }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getTicket(id));
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'get_ticket');
      }
    },
  );

  server.registerTool(
    'close_ticket',
    {
      title: 'Close a support ticket',
      description: 'Marks a support ticket as closed.',
      inputSchema: {
        id: z.number().int().positive().describe('Ticket id (from list_tickets).'),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: true },
    },
    async ({ id }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        await withPoliTo(userId, (c) => c.closeTicket(id));
        return makeJsonResult({ closed: true, id });
      } catch (err) {
        return handleError(err, 'close_ticket');
      }
    },
  );

  server.registerTool(
    'search_ticket_faqs',
    {
      title: 'Search ticket FAQs',
      description:
        'Searches the secretariat FAQ for answers to common questions. Useful before opening a ticket.',
      inputSchema: {
        search: z.string().min(3).describe('Query string to search FAQs.'),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ search }, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.searchTicketFAQs(search));
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'search_ticket_faqs');
      }
    },
  );

  // ---------- Guides ----------

  server.registerTool(
    'list_guides',
    {
      title: 'List student guides',
      description:
        'Lists official PoliTO student guides with structured sections (e.g. exam procedures, thesis rules).',
      inputSchema: {},
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async (_args, extra) => {
      try {
        const { userId } = getPolitoAuthExtra(extra);
        const data = await withPoliTo(userId, (c) => c.getGuides());
        return makeJsonResult(data);
      } catch (err) {
        return handleError(err, 'list_guides');
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
      outputSchema: RESULT_SCHEMA,
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true, idempotentHint: false },
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
