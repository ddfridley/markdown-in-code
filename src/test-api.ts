import type * as vscode from 'vscode';
import type { Style } from './markdown';

export interface AppliedState {
  sequence: number;
  version: number;
  languageId: string;
  codeAppearance: 'light' | 'dark';
  selections: { start: number; end: number }[];
  ranges: { style: Style; start: number; end: number }[];
  boxes: { anchor: number; text: string; marginColumns: number; ruleAnchor?: number; hidden: { start: number; end: number }[] }[];
}

/** Exposed only in ExtensionMode.Test, after all setDecorations calls complete. */
export interface TestApi {
  snapshot(editor: vscode.TextEditor): AppliedState | undefined;
  onDidApply: vscode.Event<vscode.TextEditor>;
}
