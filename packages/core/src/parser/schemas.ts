import { z } from "zod";

export const SessionIndexEntrySchema = z
  .object({
    sessionId: z.string(),
    fullPath: z.string().default(""),
    fileMtime: z.number().default(0),
    firstPrompt: z.string().default(""),
    summary: z.string().default(""),
    messageCount: z.number().default(0),
    created: z.string().default(""),
    modified: z.string().default(""),
    gitBranch: z.string().default(""),
    projectPath: z.string().default(""),
    isSidechain: z.boolean().default(false),
    customTitle: z.string().optional().default(""),
  })
  .passthrough(); // Allow unknown fields for forward-compatibility

export const SessionIndexFileSchema = z
  .object({
    version: z.number().default(1),
    entries: z.array(SessionIndexEntrySchema).default([]),
    originalPath: z.string().default(""),
  })
  .passthrough();

export type SessionIndexEntry = z.infer<typeof SessionIndexEntrySchema>;
export type SessionIndexFile = z.infer<typeof SessionIndexFileSchema>;
