import { serve, type ServerType } from '@hono/node-server';
import { Hono } from 'hono';

/**
 * Tiny stand-in for the upstream PoliTO API. Implements just enough of the
 * spec for the MCP tools to do their job during integration tests.
 */
export interface FakePolito {
  url: string;
  setNextLoginFailure(code: number, message?: string): void;
  setExpectedCredentials(username: string, password: string): void;
  reset(): void;
  stop(): Promise<void>;
  recordedAuthHeaders: string[];
}

const FIXED_TOKEN = 'fake-bearer-001';

export async function startFakePolito(): Promise<FakePolito> {
  let nextLoginFailure: { code: number; message?: string } | null = null;
  let expected = { username: 's000001', password: 'correct-horse-battery' };
  const recordedAuthHeaders: string[] = [];

  const app = new Hono();

  app.post('/auth/login', async (c) => {
    const body = (await c.req.json()) as {
      username?: string;
      password?: string;
      loginType?: string;
    };
    if (nextLoginFailure) {
      const f = nextLoginFailure;
      nextLoginFailure = null;
      return c.json({ message: f.message ?? 'fake error' }, f.code as 400);
    }
    if (
      body.loginType !== 'basic' ||
      body.username !== expected.username ||
      body.password !== expected.password
    ) {
      return c.json({ message: 'Bad credentials' }, 401);
    }
    return c.json({
      data: {
        username: body.username,
        type: 'student',
        clientId: 'fake-client-1',
        token: FIXED_TOKEN,
      },
    });
  });

  app.delete('/auth/logout', (c) => c.body(null, 204));

  // All authenticated endpoints share this middleware.
  const auth = new Hono();
  auth.use('*', async (c, next) => {
    const h = c.req.header('authorization') ?? '';
    recordedAuthHeaders.push(h);
    if (h !== `Bearer ${FIXED_TOKEN}`) {
      return c.json({ message: 'Bad token' }, 401);
    }
    await next();
  });

  auth.get('/me', (c) =>
    c.json({
      data: {
        username: 's000001',
        firstName: 'Test',
        lastName: 'Student',
        status: 'active',
        allCareerIds: ['s000001'],
        degreeId: '99-0',
        degreeCode: 'TEST',
        degreeLevel: 'Master',
        degreeName: 'TEST DEGREE',
        firstEnrollmentYear: 2024,
        lastEnrollmentYear: 2025,
        isCurrentlyEnrolled: true,
        averageGrade: 28.5,
        estimatedFinalGrade: 110,
        averageGradePurged: null,
        estimatedFinalGradePurged: null,
        usePurgedAverageFinalGrade: false,
        mastersAdmissionAverageGrade: null,
        totalOnTimeExamPoints: null,
        maxOnTimeExamPoints: 0,
        excludedCreditsNumber: null,
        totalCredits: 120,
        totalAttendedCredits: 60,
        totalAcquiredCredits: 30,
        enrollmentCredits: 60,
        enrollmentAttendedCredits: 60,
        enrollmentAcquiredCredits: 30,
        smartCardPicture: null,
        europeanStudentCard: { canBeRequested: false, details: null },
      },
    }),
  );

  auth.get('/grades', (c) =>
    c.json({
      data: [
        {
          courseName: 'Test Course',
          credits: 6,
          grade: '30',
          date: '2025-01-15',
          teacherId: 1,
          onTimeExamPoints: null,
          shortcode: 'TEST101',
          academicYear: 2024,
          creditsCountTowardsDegree: true,
        },
      ],
    }),
  );

  auth.get('/deadlines', (c) => c.json({ data: [{ name: 'Demo', type: 'admin', url: null, date: '2025-12-31' }] }));

  auth.get('/provisional-grades', (c) => c.json({ data: [], states: [] }));

  auth.post('/provisional-grades/:id/accept', (c) => c.body(null, 204));
  auth.post('/provisional-grades/:id/reject', (c) => c.body(null, 204));

  auth.get('/messages', (c) => c.json({ data: [] }));
  auth.put('/messages/:id/read', (c) => c.body(null, 204));
  auth.delete('/messages/:id', (c) => c.body(null, 204));

  auth.get('/notifications', (c) => c.json({ data: [] }));

  auth.get('/courses', (c) => c.json({ data: [] }));
  auth.get('/courses/:id', (c) => c.json({ data: { id: c.req.param('id') } }));
  auth.get('/exams', (c) => c.json({ data: [] }));
  auth.get('/bookings', (c) => c.json({ data: [] }));
  auth.get('/unreadEmails', (c) => c.json({ data: { unreadEmails: '0' } }));
  auth.get('/me/lectures', (c) => c.json({ data: [] }));

  app.route('/', auth);

  let serverInstance: ServerType;
  const port = await new Promise<number>((resolve) => {
    serverInstance = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (info) => {
      resolve(info.port);
    });
  });

  return {
    url: `http://127.0.0.1:${port}`,
    setNextLoginFailure(code: number, message?: string) {
      nextLoginFailure = { code, ...(message !== undefined ? { message } : {}) };
    },
    setExpectedCredentials(username: string, password: string) {
      expected = { username, password };
    },
    reset() {
      nextLoginFailure = null;
      recordedAuthHeaders.length = 0;
    },
    async stop() {
      await new Promise<void>((resolve) => serverInstance.close(() => resolve()));
    },
    recordedAuthHeaders,
  };
}
