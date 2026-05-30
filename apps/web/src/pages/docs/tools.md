---
layout: ../../layouts/DocsLayout.astro
title: Tools
description: The full set of tools your assistant can call, grouped by area.
---

# Tools

Your assistant chooses which tools to call based on what you ask — you never invoke
them by name. This page is the reference for what's possible.

> **Status legend:** ✅ available now · 🧭 on the [roadmap](/docs/roadmap/).
> The project currently ships **15 tools** and is expanding toward full coverage of
> the ~71-endpoint PoliTO API.

## Profile & grades

| Tool | Does | Status |
|---|---|---|
| `get_profile` | Name, degree, credits, weighted averages | ✅ |
| `get_grades` | All recorded exam grades | ✅ |
| `get_provisional_grades` | Grades pending accept/reject | ✅ |
| `accept_provisional_grade` | Accept a provisional grade (irreversible) | ✅ |
| `reject_provisional_grade` | Reject a provisional grade (irreversible) | ✅ |

## Schedule & deadlines

| Tool | Does | Status |
|---|---|---|
| `list_today_lectures` | Today's lectures with rooms | ✅ |
| `list_deadlines` | Upcoming deadlines (date-range optional) | ✅ |
| `get_next_lecture` | Next session for a given course | 🧭 |
| `export_calendar` | Lectures + deadlines as iCal | 🧭 |

## Courses & materials

| Tool | Does | Status |
|---|---|---|
| `list_courses` | Your enrolled courses | ✅ |
| `get_course` | Details for one course | ✅ |
| `list_course_files` | Slides, PDFs and materials | 🧭 |
| `list_video_lectures` | Recorded video lectures | 🧭 |
| `list_course_notices` | Teacher announcements per course | 🧭 |

## Exams & booking

| Tool | Does | Status |
|---|---|---|
| `list_exams` | Available exam sessions | ✅ |
| `list_bookings` | Your active bookings | ✅ |
| `book_exam` | Book an exam session | 🧭 |
| `cancel_exam_booking` | Cancel a booking | 🧭 |

## Communications

| Tool | Does | Status |
|---|---|---|
| `list_messages` | Portal inbox | ✅ |
| `mark_message_read` | Mark a message read | ✅ |
| `list_notifications` | Push notifications | ✅ |
| `get_unread_emails_count` | Webmail badge count | ✅ |
| `list_announcements` | University-wide announcements | 🧭 |

## Campus, people & career

| Tool | Does | Status |
|---|---|---|
| `find_free_rooms` | Free rooms at a campus right now | 🧭 |
| `search_places` | Labs, libraries, offices | 🧭 |
| `search_people` | Students, professors, staff | 🧭 |
| `list_job_offers` | Internships & job postings | 🧭 |
| `get_course_statistics` | Pass rate & grade distribution | 🧭 |

## Account

| Tool | Does | Status |
|---|---|---|
| `delete_my_account` | Wipe your stored data + revoke the token | ✅ |

See **[Security & privacy](/docs/security/)** for what `delete_my_account` removes.
