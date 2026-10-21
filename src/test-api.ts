import type * as vscode from 'vscode';
import type { Style } from './markdown';

export interface AppliedState {
  sequence: number;
  version: number;
  languageId: string;
  codeAppearance: 'light' | 'dark';
  headingSizes: number[];
  selections: { start: number; end: number }[];
  ranges: { style: Style; start: number; end: number; level?: number }[];
  boxes: { anchor: number; text: string; marginColumns: number; ruleAnchor?: number; hidden: { start: number; end: number }[] }[];
}

/** Exposed only in ExtensionMode.Test, after all setDecorations calls complete. */
export interface TestApi {
  readonly openedLinks: readonly string[];
  readonly linkOpenResults: readonly { uri: string; result: boolean }[];
  /**
   * ## snapshot(editor) ⇒ {AppliedState | undefined}
   * Let tests observe completed decoration application without forcing refreshes that could conceal event-wiring defects.
   *
   * **Kind:** method
   * **Access:** public
   *
   * ## Parameters
   * - `editor` **{vscode.TextEditor}** - Exact editor instance under test, including split identity.
   *
   * ## Returns
   * **{AppliedState | undefined}** - Copied last-applied state, or undefined before that editor has rendered.
   *
   * ## Implementation Details
   * The implementation exposes this API only in ExtensionMode.Test and emits after setDecorations calls.
   *
   * ## Agent Notes
   * A range snapshot proves application state, not painted pixels or OS browser focus. Keep native input and screenshot checks independent.
   */
  snapshot(editor: vscode.TextEditor): AppliedState | undefined;
  onDidApply: vscode.Event<vscode.TextEditor>;
}
