# CloudSteps

Vocabulary training, coaching, and the admin console around them.

## Language

**Notification template**:
A row in `mail_templates` keyed by `(code, locale, channelType)` where `channelType` is `email` or `inbox`. Auth handlers emit `common.Sig()` events; separate listeners call `Mailer.SendEmail` or `Mailer.SendInbox` with the same template code.
_Avoid_: one row mixing both channels; calling Mailer at the handler instead of Sig

**Mailer**:
Outbound facade (`internal/notify.Mailer`). `SendEmail` loads email-type templates and sends via channels; `SendInbox` loads inbox-type templates and writes `inbox_messages`.
_Avoid_: Dispatcher as the app-level send API (ling-base Dispatcher is per-type failover, not inbox+email fan-out)

**Notification channel**:
A row in `notification_channels` (SMTP or SendCloud JSON). Enabled rows are loaded at send time.
_Avoid_: env-only mail config as the live source after first seed

**Inbox**:
In-app messages from inbox-type notification templates. Written by the inbox Sig listener via `Mailer.SendInbox`, not mirrored from email sends.
_Avoid_: hardcoded inbox copy in listeners; using an inbox message as the place a support conversation lives

**Feedback ticket**:
A support conversation opened by a signed-in user. The opening message belongs to the ticket; later messages are feedback replies. Status is `open` until an admin closes it.
_Avoid_: a single reply column on the ticket; treating the inbox ping as the conversation

**Feedback reply**:
One message on a feedback ticket, from the user or an admin. An admin reply is stored on the ticket and then notified by Inbox (`feedback_reply`); the inbox copy is not the reply.
_Avoid_: sending the reply only as inbox; replacing the ticket body with the latest reply

**Object storage manager**:
Admin browses buckets/objects on the `STORAGE_KIND` backend via ling-base `ObjectStorageManager` (`stores.DefaultManager()`). Empty bucket uses the env default (e.g. `QINIU_BUCKET`).
_Avoid_: talking to a second store instance that ignores `STORAGE_KIND`

**Word audio share**:
Pronunciation slots 0–1 (the English TTS) are shared by spelling across word books; unused object-store keys are deleted. Gloss slots stay per row.
_Avoid_: merging word *rows* across books

**Word**:
The shared canonical vocabulary row in a word book. Learners see these fields unless they have a User word for that row.
_Avoid_: letting a learner edit this row in place

**User word**:
A per-user overlay of a Word. Display prefers it when present; it does not mutate the Word. An admin may adopt it onto the Word after review.
_Avoid_: UserWordState (that is learning progress); treating one user's overlay as the shared Word without adopting it

**Signup coaching quota**:
Public registration grants the new **teacher** `SignupTeachingPoolMinutes` (1000) into `teacher_teaching_pools` — a **total** pool across all students, default 0 before gift. Student hours remain per-row in `student_teacher_coaching_quotas`. Monthly `teacher_coaching_usage_periods` is stats-only, not the signup gift.
_Avoid_: self-pair student rows; monthly cap as teaching limit

**Invite reward**:
Teaching-pool minutes given to the inviter and/or invitee when an invite record is registered or later activated. Amounts are set in admin.
_Avoid_: signup coaching quota; check-in reward; treating the invite record itself as the ledger

**Invite reward grant**:
The one-time issuance of an invite reward for a given invite record, trigger, and beneficiary.
_Avoid_: granting again after the setting changes; using the invite code string as the grant key

