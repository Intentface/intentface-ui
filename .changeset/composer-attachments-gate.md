---
"@intentface/ui": minor
---

- [Composer] [Breaking] The composer now takes files, whether dropped, pasted or passed to `attachments.add`, only while `Composer.Attachments` is mounted. To keep receiving files, mount `<Composer.Attachments />`.
- [Composer] Fix attachments staying on after `Composer.Attachments` unmounts. Unmounting it inside a mounted composer now also clears the files it held.
