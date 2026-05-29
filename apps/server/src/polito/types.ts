/**
 * Mirrors the relevant subset of types from polito/api-spec.
 * See https://github.com/polito/api-spec/tree/master/src for the source.
 */

export interface Identity {
  username: string;
  type: string;
  clientId: string;
  token: string;
}

export interface PlaceRef {
  buildingId: string;
  floorId: string;
  roomId: string;
  siteId: string;
  name: string;
}

export interface RelatedVirtualClassroom {
  id: number;
  title: string;
}

export interface Lecture {
  id: number;
  startsAt: string;
  endsAt: string;
  type: string;
  virtualClassrooms: RelatedVirtualClassroom[];
  description: string | null;
  courseId: number;
  courseName: string;
  teacherId: number;
  place: PlaceRef;
}

export interface EuropeanStudentCard {
  canBeRequested: boolean;
  details: {
    status: 'active' | 'inactive' | 'expired';
    inactiveStatusReason: string | null;
    cardNumber: string;
    expiresAt: string;
    qrCode: string;
  } | null;
}

export interface Student {
  username: string;
  firstName: string;
  lastName: string;
  status: 'active' | 'closed' | 'cancelled' | 'graduated' | 'career_closed';
  allCareerIds: string[];
  degreeId: string;
  degreeCode: string;
  degreeLevel: string;
  degreeName: string;
  firstEnrollmentYear: number;
  lastEnrollmentYear: number;
  isCurrentlyEnrolled: boolean;
  averageGrade: number | null;
  estimatedFinalGrade: number | null;
  averageGradePurged: number | null;
  estimatedFinalGradePurged: number | null;
  usePurgedAverageFinalGrade: boolean;
  mastersAdmissionAverageGrade: number | null;
  totalOnTimeExamPoints: number | null;
  maxOnTimeExamPoints: number;
  excludedCreditsNumber: number | null;
  totalCredits: number;
  totalAttendedCredits: number;
  totalAcquiredCredits: number;
  enrollmentCredits: number;
  enrollmentAttendedCredits: number;
  enrollmentAcquiredCredits: number;
  smartCardPicture: string | null;
  europeanStudentCard: EuropeanStudentCard;
}

export interface Deadline {
  id?: number;
  name: string;
  type: string;
  url: string | null;
  date: string;
}

export interface ExamGrade {
  courseName: string;
  credits: number;
  grade: string;
  date: string;
  teacherId: number | null;
  onTimeExamPoints: number | null;
  shortcode: string;
  academicYear: number;
  creditsCountTowardsDegree: boolean;
}

export interface ProvisionalGrade {
  id: number;
  examId: number;
  courseShortcode: string;
  courseName: string;
  teacherId: number;
  credits: number;
  grade: string;
  date: string;
  state: 'published' | 'confirmed' | 'rejected';
  stateDescription: string;
  teacherMessage: string | null;
  isWithdrawn: boolean;
  isFailure: boolean;
  canBeAccepted: boolean;
  canBeRejected: boolean;
  confirmedAt: string | null;
  rejectedAt: string | null;
  rejectingExpiresAt: string;
}

export interface ProvisionalGradeState {
  id: string;
  name: string;
  description: string;
}

export type MessageType =
  | 'emergency'
  | 'event'
  | 'personal'
  | 'teacher'
  | 'secretariat'
  | 'exams'
  | 'mfa';

export interface Message {
  id: number;
  title: string;
  message: string | null;
  type: MessageType;
  senderId: number | null;
  sentAt: string;
  isRead: boolean;
}

export interface Notification {
  id: number;
  title: string;
  message: string | null;
  scope?: string[];
  sentAt: string;
  isRead: boolean;
}

export interface DataEnvelope<T> {
  data: T;
}

export interface LoginRequestBasic {
  username: string;
  password: string;
  loginType: 'basic';
  preferences: { language?: 'it' | 'en' };
  client?: {
    name: string;
    buildNumber?: string;
    appVersion?: string;
    id?: string;
    fcmRegistrationToken?: string;
  };
  device?: {
    name?: string;
    platform: string;
    version?: string;
    toothPicCompatible: boolean;
  };
}

// === Announcements ===

export type AnnouncementScope = 'onboarding' | 'appInfo';

export interface Announcement {
  id: string;
  title: string;
  contents: string;
  description?: string;
  scope: AnnouncementScope;
  seen: boolean;
  date: string;
  cover?: string;
}

// === Auth ===

export interface LinkToService {
  url: string;
}

// === Courses ===

export type CourseEnrollmentRole = 'student' | 'viewer' | 'teacher' | 'collaborator';

export interface CourseModuleEdition {
  year: string;
  id: number;
}

export interface CourseModule {
  id: number | null;
  shortcode: string;
  name: string;
  teachingPeriod: string;
  teacherId: number | null;
  teacherName: string | null;
  isOverBooking: boolean;
  enrollmentRole: CourseEnrollmentRole;
  year: string;
}

export interface CourseModuleOverview extends CourseModule {
  previousEditions: CourseModuleEdition[];
}

export interface CourseOverview extends CourseModuleOverview {
  cfu: number;
  modules: CourseModuleOverview[] | null;
}

export interface CourseNotice {
  id: number;
  publishedAt: string;
  expiresAt: string | null;
  content: string;
}

export interface CourseAssignment {
  id: number;
  description: string;
  mimeType: string;
  filename: string;
  uploadedAt: string;
  deletedAt: string | null;
  url: string;
  sizeInKiloBytes: number;
}

export interface CourseFileOverview {
  id: string;
  name: string;
  sizeInKiloBytes: number;
  mimeType: string;
  createdAt: string;
  type: 'file';
  checksum: string;
}

export interface CourseDirectory {
  id: string;
  name: string;
  type: 'directory';
  files: CourseDirectoryContent;
}

export type CourseDirectoryContent = Array<CourseDirectory | CourseFileOverview>;

export interface CourseHours {
  lecture?: number;
  tutoring?: number;
  classroomExercise?: number;
  labExercise?: number;
}

export interface CourseNotifications {
  notices: boolean;
  files: boolean;
  lectures: boolean;
}

export interface CourseLink {
  url: string;
  description?: string;
}

export interface CourseMoodleCourse {
  name: string;
  id: string;
}

export interface CourseStaffMember {
  role: string;
  id: number;
}

export interface Course extends CourseModule {
  cfu: number;
  links: CourseLink[];
  moodleCourses: CourseMoodleCourse[] | null;
  vcPreviousYears: CourseModuleEdition[];
  vcOtherCourses: Array<{ year: string; id: number; name: string }>;
  notifications: CourseNotifications;
  staff: CourseStaffMember[];
}

export interface GuideSection {
  title: string;
  content: string;
}

export interface GuideField {
  label: string;
  value: string;
  isCopyEnabled?: boolean;
}

export interface Guide {
  id: string;
  listTitle: string;
  title: string;
  intro: string;
  fields: GuideField[];
  sections: GuideSection[];
}

export interface VideoLecture {
  id: number;
  title: string;
  teacherId: number;
  abstract: string;
  coverUrl: string;
  videoUrl: string;
  audioUrl: string;
  createdAt: string;
  duration: string;
}

export interface VirtualClassroomBase {
  id: number;
  title: string;
  createdAt: string;
  teacherId: number;
}

export interface VirtualClassroomLive extends VirtualClassroomBase {
  type: 'live';
  meetingId?: string;
}

export interface VirtualClassroomRecording extends VirtualClassroomBase {
  type: 'recording';
  coverUrl: string | null;
  videoUrl: string;
  duration: string;
}

export type VirtualClassroom = VirtualClassroomLive | VirtualClassroomRecording;

// === Exams ===

export type ExamStatus =
  | 'available'
  | 'booked'
  | 'requestable'
  | 'requested'
  | 'requestAccepted'
  | 'requestRejected'
  | 'unavailable';

export interface ExamQuestion {
  id: number;
  statement: string;
  options: string[];
}

export interface Exam {
  id: number;
  courseId: number;
  courseShortcode: string;
  courseName: string;
  teacherId: number;
  type: string;
  places: PlaceRef[];
  status: ExamStatus;
  bookingStartsAt: string | null;
  bookingEndsAt: string;
  examStartsAt: string | null;
  examEndsAt: string | null;
  bookedCount: number;
  availableCount: number;
  question: ExamQuestion | null;
  feedback: string | null;
  isReschedulable: boolean;
  notes: string | null;
  moduleNumber: number;
  requestReason: string | null;
  requestDetails: string | null;
}

export interface BookExamRequest {
  courseShortcode: string;
  questionId?: number;
  questionOption?: number;
  requestReason?: string;
}

export interface RescheduleExamRequest {
  courseShortcode: string;
  requestReason: string;
  requestDetails: string;
}

// === Bookings ===

export interface BookingTopicOverview {
  id: string;
  title: string;
  description: string;
}

export interface BookingTopicLeaf extends BookingTopicOverview {
  isEnabled: boolean;
  disclaimer: string;
  showCalendar: boolean;
  slotLength: number;
  slotsPerHour: number;
  startDate: string | null;
  startHour: number;
  endHour: number;
  maxBookingsPerDay: number;
  canBeCancelled: boolean;
  daysPerWeek: number;
  agendaView: boolean;
}

export interface BookingSubtopicRequirement {
  name: string;
  url: string;
}

export interface BookingSubtopic extends BookingTopicLeaf {
  requirements: BookingSubtopicRequirement[];
}

export interface BookingTopic extends BookingTopicLeaf {
  subtopics: BookingSubtopic[];
}

export interface BookingSlotLocation {
  name?: string;
  description?: string;
  type?: string;
  address?: string;
}

export interface BookingSlot {
  id: number;
  description: string;
  isBooked: boolean;
  canBeBooked: boolean;
  hasSeats: boolean;
  hasSeatSelection: boolean;
  places: number;
  bookedPlaces: number;
  feedback: string;
  location: BookingSlotLocation;
  startsAt: string;
  endsAt: string;
  bookingStartsAt: string;
  bookingEndsAt: string;
}

export interface BookingSeatCell {
  id: number;
  status: 'available' | 'booked' | 'unavailable';
  label: string;
}

export interface BookingSeatsRow {
  id?: number;
  label: string;
  seats: BookingSeatCell[];
}

export interface BookingSeats {
  totalCount: number;
  availableCount: number;
  rows: BookingSeatsRow[];
}

export interface BookingLocationCheck {
  enabled: boolean;
  checked: boolean;
  latitude: string | null;
  longitude: string | null;
  radiusInKm: number | null;
}

export interface Booking {
  id: number;
  description: string;
  topic: BookingTopicOverview;
  subtopic: BookingTopicOverview | null;
  startsAt: string;
  endsAt: string;
  seat: { id?: number; row?: string; column?: string } | null;
  cancelableUntil: string;
  location: unknown;
  locationCheck?: BookingLocationCheck;
}

export interface CreateBookingRequest {
  slotId: number;
  seatId?: number;
}

export interface UpdateBookingRequest {
  isLocationChecked: boolean;
}

// === News ===

export interface NewsItemOverview {
  id: number;
  title: string;
  isEvent: boolean;
  shortDescription: string;
  eventStartTime: string | null;
  eventEndTime: string | null;
  createdAt: string;
}

export interface NewsItemExtra {
  url: string;
  description: string;
  type: 'link' | 'file' | 'image';
  sizeInKiloBytes: number | null;
}

export interface NewsItem extends NewsItemOverview {
  location: string;
  htmlContent: string;
  extras: NewsItemExtra[];
}

// === Job Offers ===

export interface JobOfferOverview {
  id: number;
  title: string;
  location: string;
  companyId: number;
  companyName: string;
  createdAtDate: string;
  endsAtDate: string;
}

export interface JobOffer extends JobOfferOverview {
  companyLocation: string;
  companyMission: string;
  description: string;
  requirements: string;
  contractType: string;
  salary: string;
  contactInformation: string | null;
  url: string | null;
  email: string | null;
  freePositions: number;
}

// === People ===

export interface PhoneNumber {
  full: string;
  internal: string;
}

export interface PersonOverview {
  id: number;
  firstName: string;
  lastName: string;
  picture: string | null;
  role: string;
}

export interface PersonCourse {
  id: number;
  shortcode?: string;
  name: string;
  role: string;
  year: number;
}

export interface Person extends PersonOverview {
  email: string;
  phoneNumbers: PhoneNumber[];
  facilityShortName: string | null;
  profileUrl: string;
  courses: PersonCourse[] | null;
}

// === Surveys ===

export interface SurveyTaxonomy {
  id: string;
  name: string;
}

export interface SurveyCourseRef {
  id: number;
  name: string;
  shortcode: string;
}

export interface Survey {
  id: number;
  title: string;
  subtitle: string | null;
  category: SurveyTaxonomy;
  type: SurveyTaxonomy;
  period: number;
  year: string;
  isMandatory: boolean;
  isCompiled: boolean;
  compileDate: string | null;
  url: string;
  startsAt: string;
  endsAt: string;
  course: SurveyCourseRef | null;
}

// === Tickets ===

export type TicketStatus = 'new' | 'pending' | 'closed';

export interface TicketAttachment {
  id: number;
  filename: string;
  mimeType: string;
  sizeInKiloBytes: number;
}

export interface TicketReply {
  id: number;
  message: string;
  isFromAgent: boolean;
  agentId: number | string | null;
  needsFeedback?: boolean;
  isRead: boolean;
  createdAt: string;
  attachments: TicketAttachment[];
}

export interface TicketOverview {
  id: number;
  subject: string;
  message: string;
  status: TicketStatus;
  hasAttachments: boolean;
  isFromAgent: boolean;
  agentId: number | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Ticket extends TicketOverview {
  replies: TicketReply[];
  attachments: TicketAttachment[];
}

export interface TicketFAQ {
  id: number;
  question: string;
  answer: string;
}

export interface TicketSubtopic {
  id: number;
  name: string;
}

export interface TicketTopic {
  id: number;
  name: string;
  subtopics: TicketSubtopic[];
}

// === Notifications ===

export interface NotificationPreferences {
  notices: boolean;
  files: boolean;
  lectures: boolean;
  bookings: boolean;
  tickets: boolean;
}

// === Offering / Degrees ===

export interface OfferingCourseOverview {
  name: string;
  shortcode: string;
  cfu: number;
  teachingYear: number;
  language: 'it' | 'en';
  group: string | null;
}

export interface Track {
  id: number;
  name: string;
  courses: OfferingCourseOverview[];
}

export interface DegreeOverview {
  id: string;
  name: string;
}

export interface OfferingClass {
  name: string;
  code: string;
  degrees: DegreeOverview[];
}

export interface OfferingResponse {
  bachelor?: OfferingClass[];
  master?: OfferingClass[];
}

export interface OfferingCourseStaff {
  role: string;
  id: number;
  courseId: number;
}

export interface OfferingCourse {
  name: string;
  shortcode: string;
  cfu: number;
  teachingPeriod: string;
  languages: ('it' | 'en')[];
  year: string;
  hours: CourseHours;
  editions: string[];
  staff: OfferingCourseStaff[];
  guide: GuideSection[];
}

export interface Teacher {
  id: number;
  firstName: string;
  lastName: string;
}

export interface GradeCount {
  grade: string;
  count: number;
}

export interface YearStatistics {
  succeeded: number;
  failed: number;
  grades: GradeCount[];
  averageGrade: number | null;
}

export interface PreviousYearsToCompare {
  year: number;
  succeeded: number;
  failed: number;
}

export interface CourseStatistics {
  shortcode: string;
  year: number;
  teacher: Teacher;
  totalEnrolled: number;
  totalSucceeded: number;
  totalFailed: number;
  firstYear: YearStatistics;
  otherYears: YearStatistics;
  previousYearsToCompare: PreviousYearsToCompare[];
  years: number[];
  teachers: Teacher[];
}

export interface Degree {
  id: string;
  name: string;
  level: string;
  department: { name: string };
  faculty?: { id?: string; name?: string };
  location: string;
  duration: string;
  class: { code: string; name: string };
  year: number;
  editions: string[];
  notes: string[];
  objectives: { title: string; content: string };
  jobOpportunities: { title: string; content: string };
  tracks: Track[];
}

// === Places ===

export interface Floor {
  id: string;
  name: string;
  level: number;
}

export interface Department {
  id: string;
  name: string | null;
  type: string;
}

export interface PlaceCategoryOverview {
  id: string;
  name: string;
  showInMenu?: boolean;
  color?: string;
  markerUrl?: string;
  priority?: number;
  highlighted?: boolean;
}

export interface BuildingOverview {
  id: string;
  name: string;
  siteId: string;
  category: PlaceCategoryOverview;
}

export interface Building extends BuildingOverview {
  latitude: number;
  longitude: number;
}

export interface PlaceOverview {
  id: string;
  latitude: number;
  longitude: number;
  room: { id: string; name: string };
  category: PlaceCategoryOverview;
  site: { id: string; name: string };
  building: BuildingOverview;
  floor: Floor;
  department: Department;
}

export interface PlaceResource {
  name: string;
  description: string;
  category: string;
}

export interface PlaceStructure {
  name: string;
  shortName: string;
  email: string | null;
  phone: string | null;
}

export interface Place extends PlaceOverview {
  geoJson?: unknown;
  capacity: number;
  structure: PlaceStructure | null;
  resources: PlaceResource[];
}

export interface Site {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  floors: Floor[];
  city: { id: string; name: string };
  extent: number;
}

export interface FreeRoom {
  buildingId: string;
  floorId: string;
  roomId: string;
  siteId: string;
  name: string;
  id?: string;
  freeFrom: string;
  freeTo: string;
}
