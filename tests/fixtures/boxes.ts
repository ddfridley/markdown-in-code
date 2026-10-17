const before = "**code stays raw**";

/**
 * # Comment heading
 * **Bold** and *italic* text.
 *
 * - A list item
 *     nested content
 */

/*
 * Conventional prefix
* Unindented prefix
// Slash prefix
Plain content
 */

function example() {
	/**
	 * Tab-indented block
	 *
	 *     indented code
	 */
	return 1;
}

//
// # This is a block comment made of line comments
//


const inline = 1; /* **Inline comment** */

export { before, example, inline }; // inline comment with *italic* and **bold**

