const codeBefore = "**this string stays raw**";

/**
 * # Heading with **bold**
 * A *word*, ~~strike~~, ~strike~, and ``a ` b``.
 *
 * - **List text**; the dash stays raw.
 *
 * ---
 *
 * <!-- **HTML comment stays raw** -->
 *
 * ```ts
 * **Fenced code stays raw**
 * ```
 */

/*
**Unprefixed bold**

*Unprefixed italic*
*/

// Standalone **bold**
const codeAfter = 2; // Trailing *italic*
// **Joined
// across comments**

export { codeBefore, codeAfter };
