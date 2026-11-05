# Attachments

The composer collects files and hands them to `onSubmit`. Storing and sending them is the app's.

## Rules

| Rule | Summary |
|------|---------|
| On unless limited | The composer accepts dropped and pasted files with nothing mounted, of every type and with no limits, and sends them in `data.files`. To build without attachments, mount `<Composer.Attachments maxFiles={0} />`. |
| Render a strip | Render a strip whenever the composer can receive files, so the user sees what will be sent. |
| Policy, not a strip | `Composer.Attachments` sets the accept rules and renders no strip of its own. Read the items from `useComposer((composer) => composer.attachments)` and render them with the `Attachments` parts. |
| The picker | Inside a composer, open the file picker with `Composer.AttachmentTrigger`. It clicks the file input that `Composer.Attachments` renders, so it does nothing without one. `Attachments.Trigger` is a bare button with no file input. |
| Convert before sending | `data.files` holds blob URLs. The composer revokes them once `onSubmit` settles, and a server can't read them anyway. Make `onSubmit` async, and turn each file into a data URL or an upload before sending. |

## Attachment submit

```tsx
import type { AttachmentItem } from "@intentface/ui/attachments";
import type { ComposerSubmitData } from "@intentface/ui/composer";
import type { FileUIPart } from "ai";

const toFilePart = async (item: AttachmentItem): Promise<FileUIPart> => {
  const blob = await (await fetch(item.url)).blob();
  const url = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
  return { type: "file", url, mediaType: item.mediaType ?? blob.type, filename: item.filename };
};

const handleSubmit = async (data: ComposerSubmitData) => {
  if (data.kind !== "message") return;
  sendMessage({ text: data.text, files: await Promise.all(data.files.map(toFilePart)) });
};
```

- `onSubmit` is async, so the composer keeps the blob URLs alive until the conversion finishes.
- The data URLs travel with the message, because a server can't read a `blob:` URL. An app with file storage uploads the blob and sends its URL instead.
- `sendMessage` and `FileUIPart` come from the AI SDK. Another client takes the same converted files.
