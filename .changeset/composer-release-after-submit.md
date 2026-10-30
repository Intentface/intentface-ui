---
"@intentface/ui": patch
---

- [Composer] Fix sent attachments being released before `onSubmit` could read them, which left their `blob:` URLs dead. They are now released once `onSubmit` settles.
