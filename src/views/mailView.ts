/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GtClient } from '../gtClient';
import type { GtMailMessage, GtMailPriority, GtMailType } from '../cli/contracts';

export class MailTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
	private _unreadCount = 0;
	private _onUnreadCountChanged?: (count: number) => void;

	constructor(private readonly client: GtClient) {}

	set onUnreadCountChanged(cb: ((count: number) => void) | undefined) {
		this._onUnreadCountChanged = cb;
	}

	get unreadCount(): number {
		return this._unreadCount;
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(): Promise<vscode.TreeItem[]> {
		const messages = await this.client.getMailInbox();
		this._unreadCount = messages.filter(m => !m.read).length;
		this._onUnreadCountChanged?.(this._unreadCount);
		if (messages.length === 0) {
			const item = new vscode.TreeItem('No mail');
			item.iconPath = new vscode.ThemeIcon('inbox');
			return [item];
		}
		// Sort: unread first, then by timestamp descending
		const sorted = [...messages].sort((a, b) => {
			if (a.read !== b.read) { return a.read ? 1 : -1; }
			return b.timestamp.localeCompare(a.timestamp);
		});
		return sorted.map(m => new MailTreeItem(m));
	}
}

export class MailTreeItem extends vscode.TreeItem {
	constructor(public readonly message: GtMailMessage) {
		super(message.subject, vscode.TreeItemCollapsibleState.None);

		this.contextValue = message.read ? 'mailRead' : 'mailUnread';
		this.description = MailTreeItem.buildDescription(message);
		this.tooltip = MailTreeItem.buildTooltip(message);
		this.iconPath = MailTreeItem.getIcon(message);
		this.command = {
			command: 'citadel.showMail',
			title: 'Show Mail',
			arguments: [message],
		};
	}

	private static buildDescription(msg: GtMailMessage): string {
		const parts: string[] = [msg.from];
		if (!msg.read) {
			parts.unshift('●');
		}
		return parts.join(' ');
	}

	private static buildTooltip(msg: GtMailMessage): vscode.MarkdownString {
		const md = new vscode.MarkdownString('', true);
		md.isTrusted = true;
		md.appendMarkdown(`**${msg.subject}**\n\n`);
		md.appendMarkdown(`| | |\n|---|---|\n`);
		md.appendMarkdown(`| **From** | ${msg.from} |\n`);
		md.appendMarkdown(`| **To** | ${msg.to} |\n`);
		md.appendMarkdown(`| **Priority** | ${msg.priority} |\n`);
		md.appendMarkdown(`| **Type** | ${msg.type} |\n`);
		md.appendMarkdown(`| **Time** | ${msg.timestamp} |\n`);
		return md;
	}

	private static getIcon(msg: GtMailMessage): vscode.ThemeIcon {
		if (!msg.read) {
			return MailTreeItem.getPriorityIcon(msg.priority);
		}
		return MailTreeItem.getTypeIcon(msg.type);
	}

	private static getPriorityIcon(priority: GtMailPriority): vscode.ThemeIcon {
		switch (priority) {
			case 'urgent':
				return new vscode.ThemeIcon('bell-dot', new vscode.ThemeColor('testing.iconFailed'));
			case 'high':
				return new vscode.ThemeIcon('bell', new vscode.ThemeColor('editorWarning.foreground'));
			default:
				return new vscode.ThemeIcon('mail');
		}
	}

	private static getTypeIcon(type: GtMailType): vscode.ThemeIcon {
		switch (type) {
			case 'task':
				return new vscode.ThemeIcon('tasklist');
			case 'reply':
				return new vscode.ThemeIcon('reply');
			case 'scavenge':
				return new vscode.ThemeIcon('search');
			default:
				return new vscode.ThemeIcon('bell');
		}
	}
}
