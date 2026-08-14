---
name: query-art-instructor-data
description: Use the read-only Art Instructor Pool MCP data when the user asks about registrations, instructor attributes, visitor analytics, conversion funnels, A/B test variants and lift, acquisition sources, UTM campaigns, or wants those results organized into a spreadsheet.
---

# Query Art Instructor Pool Data

## Overview

Answer natural-language questions with current data from the Art Instructor Pool MCP server. Use only the provided read-only tools; never invent values or imply that a write operation was performed.

## Choose tools

- Use `get_analytics_overview` for visitor, page-view, CTA, completed-registration, conversion-rate, and funnel questions.
- Use `get_daily_analytics` for time-series comparisons or charts. Pass 7, 30, or 90 days as requested; default to 30 days when no period is given.
- Use `get_acquisition_report` for referrer, UTM source, medium, campaign, or participant-share questions.
- Use `get_ab_test_report` for A안/B안 exposure, CTA, form-start, registration, conversion-rate, lift, daily cohort, data-quality, or UTM-segment questions. Pass `source` or `campaign` only when the user requests that segment.
- Use `get_registration_summary` for a quick total and common distributions.
- Use `aggregate_registrations` for counts grouped by a requested registration field and apply relevant filters.
- Use `list_registrations` for filtered rows, contact lists, exports, or when the total matching count matters. Continue pagination only as needed.
- Use `get_registration_by_email` only when an exact email address is provided or an exact record is explicitly requested.

Read [data-dictionary.md](references/data-dictionary.md) when metric or field semantics affect the answer.

## Answering workflow

1. Translate the user's question into a period, filters, grouping, and required fields.
2. Call the smallest set of MCP tools that directly supports the answer.
3. State the period, timezone, and important filters next to the result.
4. Distinguish event-based registrations in analytics from the current registration-table total.
5. For A/B results, compare like-for-like metrics. CTA clicks and completed registrations are different funnel stages, while the daily table attributes a registration to the visitor's first exposure date.
6. Treat `decisionStatus: insufficient_data` as directional only; do not declare a winner.
7. If the data cannot answer a question, say which field or event is missing instead of estimating.

## Spreadsheet requests

When the user asks for a spreadsheet:

- Fetch rows with `list_registrations` using `pageSize: 100` and continue until `hasNext` is false or the requested limit is reached.
- Include only columns relevant to the request. Do not include email or free-text notes unless contact details or those fields are explicitly needed.
- Use the installed spreadsheet capability to create and verify an `.xlsx` file. If it is unavailable, create a UTF-8 CSV and explain the fallback.
- Put the applied filters, export time, and timezone on a separate metadata sheet when creating an `.xlsx` file.
- Link the completed local file with an absolute path.

## Privacy and safety

- Treat emails and free-text answers as personal data. Show the minimum necessary records and avoid repeating them in narrative summaries.
- Never put MCP tokens into responses, files, source code, or logs.
- The MCP tools cannot delete or update data. If asked to mutate data, clearly explain that the connection is read-only and direct the user to an authorized admin workflow.
