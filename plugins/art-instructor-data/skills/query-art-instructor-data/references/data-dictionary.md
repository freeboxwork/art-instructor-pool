# Art Instructor Pool data dictionary

## Analytics metrics

- `visitSessions` / `visitors`: distinct anonymous session keys with an intro, registration, or completion page view during the selected period. This is not a count of unique people across devices or browser resets.
- `pageViews`: total intro, registration, and completion page-view events.
- `ctaClicks`: distinct sessions that clicked the registration CTA on the intro page.
- `registrations`: distinct sessions with a successful registration event during the selected period.
- `conversionRate`: successful registration sessions divided by intro-page sessions, expressed as a percentage.
- Analytics periods use calendar days in `Asia/Seoul` and support 7, 30, or 90 days.
- `source` prefers `utm_source`, then referrer hostname, then `직접 방문`.
- Campaign rows require a non-empty `utm_campaign` and also include `utm_source` and `utm_medium`.

Analytics registration counts are event based. They can differ from the current registration-table total because an email can update an existing row, analytics can be reset, and registrations can be physically deleted by an administrator.

## Registration fields

- `region`: required activity region.
- `major`: optional art major.
- `teachingSubject`: optional class or subject the instructor teaches or wants to teach.
- `career`: optional career band: `경력 없음`, `1년 미만`, `1~3년`, or `3년 이상`.
- `certification`: optional certification text.
- `jobSeeking`: required job-seeking state: `현재 구직중`, `향후 구직 의향 있음`, or `구직 의향 없음`.
- `courseInterest`: optional interest in professional training.
- `additionalNotes`: optional free-text request or specialty. Treat as personal data.
- `canTeachChildren`: whether child classes are possible.
- `email`: required contact email. Treat as personal data.
- `emailOptIn`: required consent to receive matching education or recruitment opportunities.
- `status`: `active` or `unsubscribed`.
- Timestamps are stored with timezone; present dates in `Asia/Seoul` unless the user requests another timezone.
