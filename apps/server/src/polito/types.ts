/**
 * Mirrors the relevant subset of types from polito/api-spec.
 * See https://github.com/polito/api-spec/tree/master/src for the source.
 *
 * We mirror types we actually expose through MCP tools. Other endpoints can
 * be wrapped without strict types as long as we surface them as JSON.
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
  date: string; // ISO date
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
