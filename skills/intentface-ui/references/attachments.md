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
| Keep a failed message | The composer clears the editor and empties the strip when the send starts. When a conversion fails, show an error and put the text back with `store.controller.setText(data.text)`, unless the user has started a new draft. |
| One send at a time | Pass `isSubmitting` to `Composer.Root` while the files convert, or a second send can reach `sendMessage` first. |

## Attachment submit

```tsx
"use client";

import { useChat } from "@ai-sdk/react";
import type { AttachmentItem } from "@intentface/ui/attachments";
import { Composer, type ComposerSubmitData } from "@intentface/ui/composer";
import type { FileUIPart } from "ai";
import { useState } from "react";

const toFilePart = async (item: AttachmentItem): Promise<FileUIPart> => {
  const blob = await (await fetch(item.url)).blob();
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.onabort = () => reject(new Error("The file read was aborted."));
    reader.readAsDataURL(blob);
  });
  return { type: "file", url, mediaType: item.mediaType ?? blob.type, filename: item.filename };
};

export const Chat = () => {
  const { sendMessage } = useChat();
  const [store] = useState(() => Composer.createStore());
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: ComposerSubmitData) => {
    if (data.kind !== "message") return;
    setError(null);
    setIsConverting(true);
    try {
      sendMessage({ text: data.text, files: await Promise.all(data.files.map(toFilePart)) });
    } catch {
      if (!store.controller.getText()) store.controller.setText(data.text);
      setError("The files couldn't be read. Attach them again and send.");
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <>
      <Composer.Root store={store} isSubmitting={isConverting} onSubmit={handleSubmit}>
        {/* … */}
      </Composer.Root>
      {error && <p role="alert">{error}</p>}
    </>
  );
};
```

- `onSubmit` is async, so the composer keeps the blob URLs alive until the conversion finishes. A failed read rejects, so the conversion never hangs.
- The data URLs travel with the message, because a server can't read a `blob:` URL. An app with file storage uploads the blob and sends its URL instead.
- By the time a conversion fails, the composer has cleared the editor and emptied the strip, and it revokes the blob URLs once `onSubmit` returns. The catch puts the text back and says why the files are gone. The editor stays editable while the files convert, so the text goes back only into an empty editor, and a new draft wins. `setText` restores plain text, so a chip comes back as its `[Label](chip:…)` token.
- `isSubmitting` stays true while the files convert, so a second send can't reach `sendMessage` before this one.
- A client other than `useChat` sends the same converted files.
