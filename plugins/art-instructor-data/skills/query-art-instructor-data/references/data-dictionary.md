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

## A/B test metrics

- `experiment.key`: currently `mobile_design_v1`.
- Variant `A`: the existing detailed registration design. Variant `B`: the simplified registration design.
- `exposures`: unique visitors whose first random-assignment intro-page exposure occurred during the selected period. QA `override` traffic is excluded.
- `ctaClicks`, `formStarts`, `submitClicks`, and `registrations`: unique exposed visitors who reached each outcome within 7 days after their first exposure to that variant.
- `ctaRate`, `startRate`, and `conversionRate`: each outcome divided by exposures, expressed as a percentage.
- `startToCompleteRate`: registrations divided by form starts.
- `validationFailureRate`: visitors with a validation failure divided by form starts.
- `apiFailureRate`: visitors with a registration API failure divided by submit clicks.
- `lift.absolutePercentagePoints`: B conversion rate minus A conversion rate in percentage points.
- `lift.relativePercent`: the relative change from A to B. It is `null` when A conversion is zero.
- `decisionStatus: insufficient_data`: at least one variant has fewer than 100 exposures or fewer than 10 registrations. Treat results as directional, not a winner decision.
- Daily rows are exposure cohorts: a later registration is counted on the date of the visitor's first exposure, not necessarily the calendar date when registration finished.
- Source and campaign filters use the UTM values captured at the first qualifying exposure. Direct traffic is labeled `직접 방문`; missing campaign values are labeled `미지정`.
- `quality.overrideVisitors` is QA override traffic, `quality.legacySessions` is traffic without experiment metadata, and `quality.conflictingVisitors` is visitors observed in more than one random variant.

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
