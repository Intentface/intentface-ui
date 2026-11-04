import { tool } from "ai";
import { z } from "zod";

const questionSchema = z.object({
  question: z.string().describe("The question to ask the user"),
  header: z
    .string()
    .optional()
    .describe(
      "Short label of the question displayed as a tab header (max 18 chars), e.g. 'Auth method', 'Library'",
    ),
  options: z
    .array(
      z.object({
        label: z.string().describe("Short display label (1-5 words)"),
        description: z.string().describe("One sentence explaining what this option means"),
      }),
    )
    .describe("2-5 concrete options for the user to choose from"),
  multiSelect: z
    .boolean()
    .optional()
    .describe(
      "true if the user can select multiple options (checkboxes), false for single choice (radio buttons). Defaults to false.",
    ),
});

const questionsInputSchema = z.object({
  questions: z
    .array(questionSchema)
    .min(1)
    .max(4)
    .describe(
      "1-4 questions to ask the user. All questions are presented together and submitted at once.",
    ),
});

export const askUser = tool({
  description: `Ask the user one or more clarifying questions with predefined options. The user sees an interactive card and picks answers for all questions before submitting. Use this when:
- The user's request is ambiguous and could go multiple directions
- You need to choose between several valid approaches
- A preference or constraint is missing (time range, format, audience, etc.)
- You want to confirm a potentially destructive or irreversible action

Provide 1-4 questions, each with 2-5 concrete options with short labels and helpful descriptions. Users can also type a custom answer for any question.`,
  inputSchema: questionsInputSchema,
  // The chat answers with addToolOutput: a JSON object of question → answer.
  outputSchema: z.string(),
});
