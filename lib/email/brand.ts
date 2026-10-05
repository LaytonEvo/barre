/**
 * Brand values for email, as literal hex.
 *
 * Email clients have no CSS custom properties, so the tokens in design/tokens.css
 * cannot be used here — these are copies, and the comment on each says which
 * token it mirrors. They are checked against the real tokens by a test, so the
 * two cannot drift apart unnoticed.
 */
export const EMAIL_COLORS = {
  /** --c-cream-100, the page ground */
  background: '#faf6f0',
  /** --c-white */
  surface: '#ffffff',
  /** --c-cream-300 */
  border: '#e6d9c8',
  /** --c-ink-900 */
  text: '#1a1f1b',
  /** --c-ink-500 */
  muted: '#626a63',
  /** --c-green-800, headings */
  heading: '#174a22',
  /** --c-green-700, links and primary buttons */
  primary: '#21632f',
  /** --c-clay-600, reserved for booking CTAs */
  accent: '#ae5430',
  /** --c-green-200, Kelly's logo mint */
  mint: '#bbe7c4',
} as const;

export const EMAIL_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
