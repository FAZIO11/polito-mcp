import { logger } from '../logger.js';
import type {
  DataEnvelope,
  Deadline,
  ExamGrade,
  Identity,
  Lecture,
  LoginRequestBasic,
  Message,
  Notification,
  ProvisionalGrade,
  ProvisionalGradeState,
  Student,
} from './types.js';

/**
 * Typed error returned for any non-2xx response from the upstream PoliTO API.
 *
 *  - `status` is the HTTP status code from upstream.
 *  - `code` mirrors the application-level error code from the response body
 *    when present.
 *  - `politoMessage` is the upstream "message" string when present.
 *
 * Callers should treat `status === 401` as "the stored bearer is no longer
 * valid" (mark token revoked, prompt re-auth).
 */
export class PolitoApiError extends Error {
  readonly status: number;
  readonly code?: number;
  readonly politoMessage?: string;
  readonly path: string;

  constructor(args: {
    status: number;
    code?: number;
    politoMessage?: string;
    path: string;
  }) {
    super(
      `PoliTO ${args.path} → ${args.status}` +
        (args.politoMessage ? `: ${args.politoMessage}` : ''),
    );
    this.name = 'PolitoApiError';
    this.status = args.status;
    this.code = args.code;
    this.politoMessage = args.politoMessage;
    this.path = args.path;
  }

  isUnauthorized(): boolean {
    return this.status === 401;
  }
}

/**
 * Thin typed wrapper over the PoliTO student API. One instance per request:
 * construct with the bearer token (or null for /auth/login), call methods,
 * throw away.
 *
 * Mirrors the surface documented at
 * https://github.com/polito/api-spec/tree/master/src/routes
 */
export class PolitoClient {
  constructor(
    private readonly baseUrl: string,
    private readonly bearer: string | null,
    private readonly language: 'it' | 'en' = 'en',
  ) {}

  private async request<T>(
    path: string,
    init: {
      method?: string;
      body?: unknown;
      query?: Record<string, string | number | undefined>;
      noAuth?: boolean;
    } = {},
  ): Promise<T> {
    const url = new URL(path.replace(/^\//, ''), this.normalisedBase());
    if (init.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = {
      'Accept-Language': this.language,
      Accept: 'application/json',
    };
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    if (!init.noAuth && this.bearer) {
      headers['Authorization'] = `Bearer ${this.bearer}`;
    }

    const start = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method: init.method ?? 'GET',
        headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
    } catch (err) {
      logger.warn({ err, path, ms: Date.now() - start }, 'PoliTO request failed (network)');
      throw new PolitoApiError({
        status: 0,
        path,
        politoMessage: err instanceof Error ? err.message : 'network error',
      });
    }
    const ms = Date.now() - start;
    logger.debug({ path, status: res.status, ms }, 'polito.request');

    if (res.status === 204) return undefined as T;

    let parsed: unknown = undefined;
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      try {
        parsed = await res.json();
      } catch {
        parsed = undefined;
      }
    } else if (!res.ok) {
      parsed = { message: await res.text().catch(() => undefined) };
    }

    if (!res.ok) {
      const errBody = (parsed as { code?: number; message?: string } | undefined) ?? {};
      throw new PolitoApiError({
        status: res.status,
        code: errBody.code,
        politoMessage: errBody.message,
        path,
      });
    }
    return parsed as T;
  }

  private normalisedBase(): string {
    return this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`;
  }

  // ---- Auth ----

  /** POST /auth/login with `loginType: basic`. */
  async loginBasic(input: { username: string; password: string }): Promise<Identity> {
    const body: LoginRequestBasic = {
      username: input.username,
      password: input.password,
      loginType: 'basic',
      preferences: { language: this.language },
      client: { name: 'polito-mcp' },
      device: { platform: 'server', toothPicCompatible: false },
    };
    const env = await this.request<DataEnvelope<Identity>>('/auth/login', {
      method: 'POST',
      body,
      noAuth: true,
    });
    return env.data;
  }

  /** DELETE /auth/logout. */
  async logout(): Promise<void> {
    await this.request<void>('/auth/logout', { method: 'DELETE' });
  }

  // ---- Student ----

  async getStudent(): Promise<Student> {
    const env = await this.request<DataEnvelope<Student>>('/me');
    return env.data;
  }

  async getDeadlines(fromDate?: string, toDate?: string): Promise<Deadline[]> {
    const env = await this.request<DataEnvelope<Deadline[]>>('/deadlines', {
      query: { fromDate, toDate },
    });
    return env.data;
  }

  async getStudentGrades(): Promise<ExamGrade[]> {
    const env = await this.request<DataEnvelope<ExamGrade[]>>('/grades');
    return env.data;
  }

  async getUnreadEmailsNumber(): Promise<{ unreadEmails: string }> {
    const env = await this.request<DataEnvelope<{ unreadEmails: string }>>('/unreadEmails');
    return env.data;
  }

  // ---- Provisional grades ----

  async getProvisionalGrades(): Promise<{
    data: ProvisionalGrade[];
    states: ProvisionalGradeState[];
  }> {
    // This endpoint returns { data, states } at the top level, NOT enveloped.
    return this.request<{ data: ProvisionalGrade[]; states: ProvisionalGradeState[] }>(
      '/provisional-grades',
    );
  }

  async acceptProvisionalGrade(id: number): Promise<void> {
    await this.request<void>(`/provisional-grades/${id}/accept`, { method: 'POST' });
  }

  async rejectProvisionalGrade(id: number): Promise<void> {
    await this.request<void>(`/provisional-grades/${id}/reject`, { method: 'POST' });
  }

  // ---- Messages ----

  async getMessages(): Promise<Message[]> {
    const env = await this.request<DataEnvelope<Message[]>>('/messages');
    return env.data;
  }

  async markMessageRead(id: number): Promise<void> {
    await this.request<void>(`/messages/${id}/read`, { method: 'PUT' });
  }

  async deleteMessage(id: number): Promise<void> {
    await this.request<void>(`/messages/${id}`, { method: 'DELETE' });
  }

  // ---- Notifications ----

  async getNotifications(): Promise<Notification[]> {
    const env = await this.request<DataEnvelope<Notification[]>>('/notifications');
    return env.data;
  }

  // ---- Courses ----

  async getCourses(): Promise<unknown[]> {
    const env = await this.request<DataEnvelope<unknown[]>>('/courses');
    return env.data;
  }

  async getCourse(id: number): Promise<unknown> {
    const env = await this.request<DataEnvelope<unknown>>(`/courses/${id}`);
    return env.data;
  }

  // ---- Exams ----

  async getExams(): Promise<unknown[]> {
    const env = await this.request<DataEnvelope<unknown[]>>('/exams');
    return env.data;
  }

  // ---- Bookings ----

  async getBookings(): Promise<unknown[]> {
    const env = await this.request<DataEnvelope<unknown[]>>('/bookings');
    return env.data;
  }

  // ---- Lectures (derived from /me/lectures) ----

  async getMyLectures(fromDate?: string, toDate?: string): Promise<Lecture[]> {
    const env = await this.request<DataEnvelope<Lecture[]>>('/lectures', {
      query: { fromDate, toDate },
    });
    return env.data;
  }
}
