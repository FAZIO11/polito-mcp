import { logger } from '../logger.js';
import type {
  Announcement,
  Booking,
  BookExamRequest,
  BookingSeats,
  BookingSlot,
  BookingTopic,
  Building,
  Course,
  CourseAssignment,
  CourseDirectoryContent,
  CourseNotice,
  CourseOverview,
  CourseStatistics,
  CreateBookingRequest,
  DataEnvelope,
  Deadline,
  Degree,
  Department,
  Exam,
  ExamGrade,
  EuropeanStudentCard,
  FreeRoom,
  Guide,
  GuideSection,
  Identity,
  JobOffer,
  JobOfferOverview,
  Lecture,
  LinkToService,
  LoginRequestBasic,
  Message,
  NewsItem,
  NewsItemOverview,
  Notification,
  NotificationPreferences,
  OfferingCourse,
  OfferingResponse,
  Person,
  PersonOverview,
  Place,
  PlaceOverview,
  ProvisionalGrade,
  ProvisionalGradeState,
  RescheduleExamRequest,
  Site,
  Student,
  Survey,
  Ticket,
  TicketFAQ,
  TicketOverview,
  TicketTopic,
  UpdateBookingRequest,
  VideoLecture,
  VirtualClassroom,
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
      query?: Record<string, string | number | boolean | undefined>;
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

  /** GET /auth/serviceLink/mail */
  async getMailLink(): Promise<string> {
    const env = await this.request<DataEnvelope<LinkToService>>('/auth/serviceLink/mail');
    return env.data.url;
  }

  /** GET /auth/serviceLink/liveClass/:meetingID */
  async getLiveClassLink(meetingId: string): Promise<string> {
    const env = await this.request<DataEnvelope<LinkToService>>(
      `/auth/serviceLink/liveClass/${meetingId}`,
    );
    return env.data.url;
  }

  /** GET /auth/serviceLink/moodle/:course */
  async getMoodleLink(courseId: number): Promise<string> {
    const env = await this.request<DataEnvelope<LinkToService>>(
      `/auth/serviceLink/moodle/${courseId}`,
    );
    return env.data.url;
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

  async getGuides(): Promise<Guide[]> {
    const env = await this.request<DataEnvelope<Guide[]>>('/guides');
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

  async getNotificationPreferences(): Promise<NotificationPreferences> {
    const env = await this.request<DataEnvelope<NotificationPreferences>>(
      '/notifications/preferences',
    );
    return env.data;
  }

  async deleteNotification(id: number): Promise<void> {
    await this.request<void>(`/notifications/${id}`, { method: 'DELETE' });
  }

  async markNotificationRead(id: number): Promise<void> {
    await this.request<void>(`/notifications/${id}/read`, { method: 'PUT' });
  }

  // ---- Announcements ----

  async getAnnouncements(params?: { new?: boolean }): Promise<Announcement[]> {
    const env = await this.request<DataEnvelope<Announcement[]>>('/announcements', {
      query: params?.new !== undefined ? { new: params.new } : undefined,
    });
    return env.data;
  }

  async markAnnouncementRead(id: string): Promise<void> {
    await this.request<void>(`/announcements/${id}/read`, { method: 'PUT' });
  }

  // ---- Courses ----

  /** GET /v2/courses — full list with cfu and modules. */
  async getCourses(): Promise<CourseOverview[]> {
    const env = await this.request<DataEnvelope<CourseOverview[]>>('/v2/courses');
    return env.data;
  }

  async getCourse(id: number): Promise<Course> {
    const env = await this.request<DataEnvelope<Course>>(`/courses/${id}`);
    return env.data;
  }

  async getCourseAssignments(courseId: number): Promise<CourseAssignment[]> {
    const env = await this.request<DataEnvelope<CourseAssignment[]>>(
      `/courses/${courseId}/assignments`,
    );
    return env.data;
  }

  async getCourseFiles(courseId: number): Promise<CourseDirectoryContent> {
    const env = await this.request<DataEnvelope<CourseDirectoryContent>>(
      `/courses/${courseId}/files`,
    );
    return env.data;
  }

  async getCourseGuide(courseId: number): Promise<GuideSection[]> {
    const env = await this.request<DataEnvelope<GuideSection[]>>(`/courses/${courseId}/guide`);
    return env.data;
  }

  async getCourseNotices(courseId: number): Promise<CourseNotice[]> {
    const env = await this.request<DataEnvelope<CourseNotice[]>>(`/courses/${courseId}/notices`);
    return env.data;
  }

  async getCourseVideolectures(courseId: number): Promise<VideoLecture[]> {
    const env = await this.request<DataEnvelope<VideoLecture[]>>(
      `/courses/${courseId}/videolectures`,
    );
    return env.data;
  }

  async getCourseVirtualClassrooms(
    courseId: number,
    live?: boolean,
  ): Promise<VirtualClassroom[]> {
    const env = await this.request<DataEnvelope<VirtualClassroom[]>>(
      `/courses/${courseId}/virtual-classrooms`,
      { query: live !== undefined ? { live } : undefined },
    );
    return env.data;
  }

  async getNextLecture(courseId: number): Promise<Lecture> {
    const env = await this.request<DataEnvelope<Lecture>>(`/courses/${courseId}/nextLecture`);
    return env.data;
  }

  // ---- Exams ----

  async getExams(): Promise<Exam[]> {
    const env = await this.request<DataEnvelope<Exam[]>>('/exams');
    return env.data;
  }

  async bookExam(examId: number, body: BookExamRequest): Promise<void> {
    await this.request<void>(`/exams/${examId}/booking`, { method: 'POST', body });
  }

  async cancelExamBooking(examId: number): Promise<void> {
    await this.request<void>(`/exams/${examId}/booking`, { method: 'DELETE' });
  }

  async rescheduleExam(examId: number, body: RescheduleExamRequest): Promise<void> {
    await this.request<void>(`/exams/${examId}/rescheduleRequest`, { method: 'POST', body });
  }

  // ---- Bookings ----

  async getBookings(): Promise<Booking[]> {
    const env = await this.request<DataEnvelope<Booking[]>>('/bookings');
    return env.data;
  }

  async createBooking(body: CreateBookingRequest): Promise<void> {
    await this.request<void>('/bookings', { method: 'POST', body });
  }

  async deleteBooking(id: number): Promise<void> {
    await this.request<void>(`/bookings/${id}`, { method: 'DELETE' });
  }

  async updateBooking(id: number, body: UpdateBookingRequest): Promise<void> {
    await this.request<void>(`/bookings/${id}`, { method: 'PATCH', body });
  }

  async getBookingTopics(): Promise<BookingTopic[]> {
    const env = await this.request<DataEnvelope<BookingTopic[]>>('/booking-topics');
    return env.data;
  }

  async getBookingSlots(
    topicId: string,
    params?: { fromDate?: string; toDate?: string },
  ): Promise<BookingSlot[]> {
    const env = await this.request<DataEnvelope<BookingSlot[]>>(
      `/booking-topics/${topicId}/slots`,
      { query: params },
    );
    return env.data;
  }

  async getBookingSeats(topicId: string, slotId: string): Promise<BookingSeats> {
    const env = await this.request<DataEnvelope<BookingSeats>>(
      `/booking-topics/${topicId}/slots/${slotId}/seats`,
    );
    return env.data;
  }

  // ---- Lectures (derived from /lectures) ----

  async getMyLectures(fromDate?: string, toDate?: string): Promise<Lecture[]> {
    const env = await this.request<DataEnvelope<Lecture[]>>('/lectures', {
      query: { fromDate, toDate },
    });
    return env.data;
  }

  // ---- News ----

  async getNews(): Promise<NewsItemOverview[]> {
    const env = await this.request<DataEnvelope<NewsItemOverview[]>>('/news');
    return env.data;
  }

  async getNewsItem(id: number): Promise<NewsItem> {
    const env = await this.request<DataEnvelope<NewsItem>>(`/news/${id}`);
    return env.data;
  }

  // ---- Job offers ----

  async getJobOffers(): Promise<JobOfferOverview[]> {
    const env = await this.request<DataEnvelope<JobOfferOverview[]>>('/job-offers');
    return env.data;
  }

  async getJobOffer(id: number): Promise<JobOffer> {
    const env = await this.request<DataEnvelope<JobOffer>>(`/job-offers/${id}`);
    return env.data;
  }

  // ---- People ----

  async searchPeople(search: string): Promise<PersonOverview[]> {
    const env = await this.request<DataEnvelope<PersonOverview[]>>('/people', {
      query: { search },
    });
    return env.data;
  }

  async getPerson(id: number): Promise<Person> {
    const env = await this.request<DataEnvelope<Person>>(`/people/${id}`);
    return env.data;
  }

  // ---- Surveys ----

  async getSurveys(): Promise<Survey[]> {
    const env = await this.request<DataEnvelope<Survey[]>>('/surveys');
    return env.data;
  }

  // ---- Tickets ----

  async getTickets(): Promise<TicketOverview[]> {
    const env = await this.request<DataEnvelope<TicketOverview[]>>('/tickets');
    return env.data;
  }

  async getTicket(id: number): Promise<Ticket> {
    const env = await this.request<DataEnvelope<Ticket>>(`/tickets/${id}`);
    return env.data;
  }

  async markTicketRead(id: number): Promise<void> {
    await this.request<void>(`/tickets/${id}/read`, { method: 'PUT' });
  }

  async closeTicket(id: number): Promise<void> {
    await this.request<void>(`/tickets/${id}/close`, { method: 'PUT' });
  }

  async setTicketReplyFeedback(
    ticketId: number,
    replyId: number,
    positive: boolean,
  ): Promise<void> {
    await this.request<void>(`/tickets/${ticketId}/replies/${replyId}/feedback`, {
      method: 'PUT',
      query: { positive },
    });
  }

  async searchTicketFAQs(search: string): Promise<TicketFAQ[]> {
    const env = await this.request<DataEnvelope<TicketFAQ[]>>('/ticket-faqs', {
      query: { search },
    });
    return env.data;
  }

  async getTicketTopics(): Promise<TicketTopic[]> {
    const env = await this.request<DataEnvelope<TicketTopic[]>>('/ticket-topics');
    return env.data;
  }

  // ---- Offering ----

  async getOffering(): Promise<OfferingResponse> {
    const env = await this.request<DataEnvelope<OfferingResponse>>('/offering');
    return env.data;
  }

  async getOfferingCourse(shortcode: string, year?: string): Promise<OfferingCourse> {
    const env = await this.request<DataEnvelope<OfferingCourse>>(
      `/offering/courses/${shortcode}`,
      { query: year ? { year } : undefined },
    );
    return env.data;
  }

  async getCourseStatistics(
    shortcode: string,
    params?: { year?: string; teacherId?: string },
  ): Promise<CourseStatistics> {
    const env = await this.request<DataEnvelope<CourseStatistics>>(
      `/offering/courses/${shortcode}/statistics`,
      { query: params },
    );
    return env.data;
  }

  async getOfferingDegree(degreeId: string, year?: string): Promise<Degree> {
    const env = await this.request<DataEnvelope<Degree>>(`/offering/degrees/${degreeId}`, {
      query: year ? { year } : undefined,
    });
    return env.data;
  }

  // ---- Places ----

  async getSites(): Promise<Site[]> {
    const env = await this.request<DataEnvelope<Site[]>>('/v2/sites');
    return env.data;
  }

  async getDepartments(params?: {
    siteId?: string;
    departmentType?: string;
  }): Promise<Department[]> {
    const env = await this.request<DataEnvelope<Department[]>>('/departments', {
      query: params,
    });
    return env.data;
  }

  async getBuildings(siteId: string, params?: { search?: string }): Promise<Building[]> {
    const env = await this.request<DataEnvelope<Building[]>>(
      `/v2/sites/${siteId}/buildings`,
      { query: params },
    );
    return env.data;
  }

  async searchPlaces(params?: {
    search?: string;
    placeCategoryId?: string;
    siteId?: string;
    buildingId?: string;
    floorId?: string;
    departmentId?: string;
  }): Promise<PlaceOverview[]> {
    const env = await this.request<DataEnvelope<PlaceOverview[]>>('/v2/places', {
      query: params as Record<string, string | undefined>,
    });
    return env.data;
  }

  async getPlace(placeId: string): Promise<Place> {
    const env = await this.request<DataEnvelope<Place>>(`/v2/places/${placeId}`);
    return env.data;
  }

  async getFreeRooms(
    siteId: string,
    date: string,
    timeFrom: string,
    timeTo: string,
  ): Promise<FreeRoom[]> {
    const env = await this.request<DataEnvelope<FreeRoom[]>>(
      `/v2/sites/${siteId}/free-rooms`,
      { query: { date, timeFrom, timeTo } },
    );
    return env.data;
  }

  // ---- European Student Card ----

  async getEuropeanStudentCard(): Promise<EuropeanStudentCard> {
    const env = await this.request<DataEnvelope<EuropeanStudentCard>>('/esc');
    return env.data;
  }
}
