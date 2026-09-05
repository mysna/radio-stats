import { z } from "zod";

const uuid = z.string().uuid();
const channelId = z.string().trim().min(1).max(200);
const shortText = z.string().trim().min(1).max(200).nullable().optional();
const programMeta = {
  program_id: shortText,
  program_title: shortText,
};

export const visitStartSchema = z.object({
  visitor_id: uuid,
  referrer: z.string().trim().max(500).nullable().optional(),
});
export type VisitStartInput = z.infer<typeof visitStartSchema>;

export const visitHeartbeatSchema = z.object({ visit_id: uuid });
export type VisitHeartbeatInput = z.infer<typeof visitHeartbeatSchema>;

export const visitEndSchema = z.object({ visit_id: uuid });
export type VisitEndInput = z.infer<typeof visitEndSchema>;

export const listenStartSchema = z.object({
  visitor_id: uuid,
  visit_id: uuid,
  channel_id: channelId,
  broadcaster: shortText,
  region_id: shortText,
  ...programMeta,
});
export type ListenStartInput = z.infer<typeof listenStartSchema>;

export const listenHeartbeatSchema = z.object({ session_id: uuid, ...programMeta });
export type ListenHeartbeatInput = z.infer<typeof listenHeartbeatSchema>;

export const listenEndSchema = z.object({ session_id: uuid, ...programMeta });
export type ListenEndInput = z.infer<typeof listenEndSchema>;
