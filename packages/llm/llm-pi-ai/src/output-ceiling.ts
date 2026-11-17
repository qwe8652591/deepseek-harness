/**
 * Output-token ceilings that providers state when they reject a request's `max_tokens`.
 *
 * A route that leaves output uncapped sends the model's whole remaining context as `max_tokens`;
 * a provider whose own ceiling is lower rejects that request and names the ceiling in its error
 * text. Each pattern below is one provider's observed wording.
 *
 * @module dsh-llm-pi-ai/output-ceiling
 */

const CEILING_PATTERNS: readonly RegExp[] = [
  // DeepSeek: `Invalid max_tokens value, the valid range of max_tokens is [1, 393216]`
  /valid range of max_tokens is \[\s*\d+\s*,\s*(\d+)\s*\]/i,
  // Volcengine Ark: `The parameter `max_tokens` ... expected a value <= 131072, but got 393216 instead.`
  /\bmax_tokens\b[^\n]*?expected a value <= (\d+)/i,
]

/**
 * Read the output ceiling a provider's rejection names.
 * @param message - the provider's error text, as pi-ai reports it.
 * @returns the largest `max_tokens` the provider accepts, or `undefined` when the text names none.
 */
export function rejectedOutputCeiling(message: string): number | undefined {
  for (const pattern of CEILING_PATTERNS) {
    const match = pattern.exec(message)
    const ceiling = match?.[1] === undefined ? undefined : Number(match[1])
    if (ceiling !== undefined && Number.isSafeInteger(ceiling) && ceiling > 0) return ceiling
  }
  return undefined
}
