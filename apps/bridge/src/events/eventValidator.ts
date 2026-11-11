import { validateAgentEventPayload, ValidationResult, AgentEventPayload, MAX_PAYLOAD_BYTES } from "@waitplay/shared";

export function validateEventInput(raw: unknown, rawBodyLength?: number): ValidationResult<AgentEventPayload> {
  if (rawBodyLength !== undefined && rawBodyLength > MAX_PAYLOAD_BYTES) {
    return {
      valid: false,
      error: `Payload size (${rawBodyLength} bytes) exceeds maximum limit of ${MAX_PAYLOAD_BYTES} bytes.`,
    };
  }

  return validateAgentEventPayload(raw);
}
